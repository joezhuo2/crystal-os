//! Terminal tab: one PowerShell session on a real pseudoconsole (ConPTY on
//! Windows), streamed to xterm.js in the webview.
//!
//! The session lives here rather than in the view, so switching tabs does not
//! kill the shell; `terminal_attach` hands back the scrollback to redraw.
//!
//! A child process inherits the app's environment, which is frozen at launch,
//! so a package installed later is missing from PATH. `terminal_restart` reads
//! the machine and user environment from the registry again before starting
//! the new shell.

use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const OUTPUT_EVENT: &str = "terminal://output";
const EXIT_EVENT: &str = "terminal://exit";

/// Output kept for redrawing the view after a tab switch.
const SCROLLBACK_BYTES: usize = 256 * 1024;

/// Registry variables that describe the account or process that wrote them
/// rather than this session (HKLM holds `USERNAME=SYSTEM`), so the launch-time
/// value is kept.
const KEEP_FROM_PROCESS: &[&str] = &["USERNAME", "PSMODULEPATH", "PROCESSOR_ARCHITECTURE"];

struct Session {
  id: u64,
  shell: String,
  /// Taken once the shell exits; dropping it closes the pseudoconsole.
  master: Option<Box<dyn MasterPty + Send>>,
  writer: Box<dyn Write + Send>,
  killer: Box<dyn ChildKiller + Send + Sync>,
  scrollback: Arc<Mutex<Scrollback>>,
}

/// Recent output plus the total bytes ever written, so the view can skip
/// events already included in a scrollback it replayed.
#[derive(Default)]
struct Scrollback {
  text: String,
  end: u64,
}

#[derive(Default)]
pub struct TerminalState {
  session: Mutex<Option<Session>>,
  next_id: AtomicU64,
}

/// Mirrors `TerminalInfo` in src/lib/terminalNative.ts.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
  id: u64,
  shell: String,
  scrollback: String,
  /// Output offset the scrollback runs up to.
  scrollback_end: u64,
  exited: bool,
}

#[derive(Serialize, Clone)]
struct OutputPayload {
  id: u64,
  data: String,
  /// Output offset just after `data`.
  end: u64,
}

#[derive(Serialize, Clone)]
struct ExitPayload {
  id: u64,
  code: Option<u32>,
}

impl Session {
  fn info(&self) -> TerminalInfo {
    let scrollback = self.scrollback.lock().unwrap();
    TerminalInfo {
      id: self.id,
      shell: self.shell.clone(),
      scrollback: scrollback.text.clone(),
      scrollback_end: scrollback.end,
      exited: self.master.is_none(),
    }
  }

  fn kill(mut self) {
    let _ = self.killer.kill();
    drop(self.master.take());
  }
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
  PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 }
}

/* ------------------------------------------------------------------ *
 * Environment
 * ------------------------------------------------------------------ */

/// A registry variable: name, value, and whether it is `REG_EXPAND_SZ`.
type RegVar = (String, String, bool);

/// Replaces `%NAME%` with the variable's value. Unknown names stay as written,
/// the same as `cmd.exe`.
fn expand_vars(value: &str, vars: &BTreeMap<String, (String, String)>) -> String {
  let mut out = String::with_capacity(value.len());
  let mut rest = value;
  while let Some(start) = rest.find('%') {
    out.push_str(&rest[..start]);
    let after = &rest[start + 1..];
    match after.find('%') {
      Some(end) if end > 0 => {
        let name = &after[..end];
        match vars.get(&name.to_ascii_uppercase()) {
          Some((_, v)) => {
            out.push_str(v);
            rest = &after[end + 1..];
          }
          None => {
            // Keep the text literally; the closing % may open the next name.
            out.push('%');
            out.push_str(name);
            rest = &after[end..];
          }
        }
      }
      _ => {
        out.push('%');
        rest = after;
      }
    }
  }
  out.push_str(rest);
  out
}

/// The environment a freshly signed-in shell would get: the app's own
/// variables, overlaid with the machine then user registry variables, and
/// PATH rebuilt as machine PATH followed by user PATH. Names are matched
/// case-insensitively, as Windows does.
fn build_env(process: Vec<(String, String)>, machine: Vec<RegVar>, user: Vec<RegVar>) -> Vec<(String, String)> {
  let mut vars: BTreeMap<String, (String, String)> =
    process.into_iter().map(|(k, v)| (k.to_ascii_uppercase(), (k, v))).collect();

  let mut paths: Vec<(String, bool)> = Vec::new();
  for (name, value, expand) in machine.into_iter().chain(user) {
    let key = name.to_ascii_uppercase();
    if key == "PATH" {
      paths.push((value, expand));
      continue;
    }
    if KEEP_FROM_PROCESS.contains(&key.as_str()) {
      continue;
    }
    let value = if expand { expand_vars(&value, &vars) } else { value };
    vars.insert(key, (name, value));
  }

  let path = paths
    .into_iter()
    .map(|(value, expand)| if expand { expand_vars(&value, &vars) } else { value })
    .map(|value| value.trim_matches(';').to_string())
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>()
    .join(";");
  if !path.is_empty() {
    let name = vars.get("PATH").map(|(n, _)| n.clone()).unwrap_or_else(|| "Path".into());
    vars.insert("PATH".into(), (name, path));
  }

  vars.into_values().collect()
}

#[cfg(windows)]
fn read_registry_env(root: winreg::HKEY, path: &str) -> Vec<RegVar> {
  use winreg::enums::{REG_EXPAND_SZ, REG_SZ};
  use winreg::types::FromRegValue;
  use winreg::RegKey;

  let Ok(key) = RegKey::predef(root).open_subkey(path) else {
    return Vec::new();
  };
  key
    .enum_values()
    .filter_map(Result::ok)
    .filter(|(_, value)| value.vtype == REG_SZ || value.vtype == REG_EXPAND_SZ)
    .filter_map(|(name, value)| {
      let expand = value.vtype == REG_EXPAND_SZ;
      String::from_reg_value(&value).ok().map(|s| (name, s, expand))
    })
    .collect()
}

#[cfg(windows)]
fn fresh_env() -> Vec<(String, String)> {
  use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
  build_env(
    std::env::vars().collect(),
    read_registry_env(HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    read_registry_env(HKEY_CURRENT_USER, "Environment"),
  )
}

#[cfg(not(windows))]
fn fresh_env() -> Vec<(String, String)> {
  let mut env: Vec<(String, String)> = std::env::vars().filter(|(k, _)| k != "TERM").collect();
  env.push(("TERM".into(), "xterm-256color".into()));
  env
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

struct Shell {
  name: &'static str,
  program: String,
  args: &'static [&'static str],
}

fn env_value<'a>(env: &'a [(String, String)], name: &str) -> Option<&'a str> {
  env.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
}

/// PowerShell 7 when it is on PATH, otherwise the Windows PowerShell that ships
/// with Windows.
#[cfg(windows)]
fn pick_shell(env: &[(String, String)]) -> Shell {
  let pwsh = env_value(env, "PATH")
    .into_iter()
    .flat_map(|path| path.split(';'))
    .filter(|dir| !dir.is_empty())
    .map(|dir| std::path::Path::new(dir).join("pwsh.exe"))
    .find(|candidate| candidate.is_file());
  if let Some(pwsh) = pwsh {
    return Shell { name: "PowerShell", program: pwsh.to_string_lossy().into_owned(), args: &["-NoLogo"] };
  }
  let root = env_value(env, "SystemRoot").unwrap_or(r"C:\Windows");
  let builtin = format!(r"{root}\System32\WindowsPowerShell\v1.0\powershell.exe");
  let program = if std::path::Path::new(&builtin).is_file() { builtin } else { "powershell.exe".into() };
  Shell { name: "Windows PowerShell", program, args: &["-NoLogo"] }
}

#[cfg(not(windows))]
fn pick_shell(env: &[(String, String)]) -> Shell {
  let program = env_value(env, "SHELL").unwrap_or("/bin/sh").to_string();
  Shell { name: "Shell", program, args: &["-l"] }
}

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

/// Decodes a PTY read, holding back a multi-byte character split across reads.
fn decode_chunk(pending: &mut Vec<u8>, chunk: &[u8]) -> String {
  pending.extend_from_slice(chunk);
  let mut out = String::new();
  loop {
    match std::str::from_utf8(pending) {
      Ok(s) => {
        out.push_str(s);
        pending.clear();
        return out;
      }
      Err(err) => {
        let valid = err.valid_up_to();
        out.push_str(std::str::from_utf8(&pending[..valid]).unwrap());
        match err.error_len() {
          Some(len) => {
            out.push('\u{FFFD}');
            pending.drain(..valid + len);
          }
          None => {
            pending.drain(..valid);
            return out;
          }
        }
      }
    }
  }
}

impl Scrollback {
  /// Appends `data` and returns the output offset just after it.
  fn push(&mut self, data: &str) -> u64 {
    self.end += data.len() as u64;
    self.text.push_str(data);
    if self.text.len() > SCROLLBACK_BYTES {
      let mut cut = self.text.len() - SCROLLBACK_BYTES;
      while !self.text.is_char_boundary(cut) {
        cut += 1;
      }
      self.text.drain(..cut);
    }
    self.end
  }
}

fn spawn_session(app: &AppHandle, state: &TerminalState, cols: u16, rows: u16) -> Result<Session, String> {
  let pair = native_pty_system().openpty(pty_size(cols, rows)).map_err(|e| e.to_string())?;

  let env = fresh_env();
  let shell = pick_shell(&env);
  let mut cmd = CommandBuilder::new(&shell.program);
  cmd.args(shell.args);
  cmd.env_clear();
  for (key, value) in &env {
    cmd.env(key, value);
  }
  if let Ok(home) = app.path().home_dir() {
    cmd.cwd(home);
  }

  let mut child = pair
    .slave
    .spawn_command(cmd)
    .map_err(|e| format!("Could not start {}: {e}", shell.name))?;
  drop(pair.slave);

  let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
  let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
  let killer = child.clone_killer();
  let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
  let scrollback = Arc::new(Mutex::new(Scrollback::default()));

  let reader_thread = {
    let app = app.clone();
    let scrollback = scrollback.clone();
    std::thread::spawn(move || {
      let mut buf = [0u8; 8192];
      let mut pending = Vec::new();
      while let Ok(n) = reader.read(&mut buf) {
        if n == 0 {
          break;
        }
        let data = decode_chunk(&mut pending, &buf[..n]);
        if data.is_empty() {
          continue;
        }
        // Emitted while holding the lock so events leave in offset order.
        let mut scrollback = scrollback.lock().unwrap();
        let end = scrollback.push(&data);
        let _ = app.emit(OUTPUT_EVENT, OutputPayload { id, data, end });
      }
    })
  };

  // ConPTY keeps the reader open after the shell exits, so wait on the child
  // and close the pseudoconsole here, which lets the reader drain and finish.
  let app_handle = app.clone();
  std::thread::spawn(move || {
    let code = child.wait().ok().map(|status| status.exit_code());
    let master = {
      let state = app_handle.state::<TerminalState>();
      let mut session = state.session.lock().unwrap();
      session.as_mut().filter(|s| s.id == id).and_then(|s| s.master.take())
    };
    drop(master);
    let _ = reader_thread.join();
    let _ = app_handle.emit(EXIT_EVENT, ExitPayload { id, code });
  });

  Ok(Session {
    id,
    shell: shell.name.to_string(),
    master: Some(pair.master),
    writer,
    killer,
    scrollback,
  })
}

/// Kills the shell. Called when the app exits.
pub fn shutdown(app: &AppHandle) {
  if let Some(session) = app.state::<TerminalState>().session.lock().unwrap().take() {
    session.kill();
  }
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

/// Returns the running session, starting one if there is none.
#[tauri::command]
pub fn terminal_attach(app: AppHandle, state: State<'_, TerminalState>, cols: u16, rows: u16) -> Result<TerminalInfo, String> {
  let mut session = state.session.lock().unwrap();
  if let Some(current) = session.as_ref() {
    if let Some(master) = current.master.as_ref() {
      let _ = master.resize(pty_size(cols, rows));
    }
    return Ok(current.info());
  }
  let next = spawn_session(&app, &state, cols, rows)?;
  let info = next.info();
  *session = Some(next);
  Ok(info)
}

/// Kills the current shell and starts a new one with PATH and the other
/// variables read again from the registry.
#[tauri::command]
pub fn terminal_restart(app: AppHandle, state: State<'_, TerminalState>, cols: u16, rows: u16) -> Result<TerminalInfo, String> {
  let old = state.session.lock().unwrap().take();
  if let Some(old) = old {
    old.kill();
  }
  let next = spawn_session(&app, &state, cols, rows)?;
  let info = next.info();
  *state.session.lock().unwrap() = Some(next);
  Ok(info)
}

#[tauri::command]
pub fn terminal_write(state: State<'_, TerminalState>, data: String) -> Result<(), String> {
  let mut session = state.session.lock().unwrap();
  match session.as_mut() {
    Some(s) if s.master.is_some() => {
      s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
      s.writer.flush().map_err(|e| e.to_string())
    }
    _ => Ok(()),
  }
}

#[tauri::command]
pub fn terminal_resize(state: State<'_, TerminalState>, cols: u16, rows: u16) -> Result<(), String> {
  let session = state.session.lock().unwrap();
  if let Some(master) = session.as_ref().and_then(|s| s.master.as_ref()) {
    master.resize(pty_size(cols, rows)).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn var(name: &str, value: &str, expand: bool) -> RegVar {
    (name.into(), value.into(), expand)
  }

  fn get<'a>(env: &'a [(String, String)], name: &str) -> Option<&'a str> {
    env_value(env, name)
  }

  #[test]
  fn path_is_machine_then_user() {
    let env = build_env(
      vec![("Path".into(), r"C:\old".into())],
      vec![var("Path", r"C:\Windows;C:\Program Files\nodejs;", false)],
      vec![var("Path", r"C:\Users\joe\bin", false)],
    );
    assert_eq!(get(&env, "PATH"), Some(r"C:\Windows;C:\Program Files\nodejs;C:\Users\joe\bin"));
  }

  #[test]
  fn keeps_process_path_when_registry_has_none() {
    let env = build_env(vec![("PATH".into(), r"C:\old".into())], vec![], vec![]);
    assert_eq!(get(&env, "Path"), Some(r"C:\old"));
  }

  #[test]
  fn user_overrides_machine_case_insensitively() {
    let env = build_env(vec![], vec![var("TEMP", r"C:\Windows\Temp", false)], vec![var("temp", r"D:\tmp", false)]);
    assert_eq!(get(&env, "TEMP"), Some(r"D:\tmp"));
    assert_eq!(env.iter().filter(|(k, _)| k.eq_ignore_ascii_case("temp")).count(), 1);
  }

  #[test]
  fn expands_expand_sz_values() {
    let env = build_env(
      vec![("USERPROFILE".into(), r"C:\Users\joe".into())],
      vec![],
      vec![var("Path", r"%USERPROFILE%\AppData\Local\Programs;%NOPE%", true), var("Lit", "%USERPROFILE%", false)],
    );
    assert_eq!(get(&env, "PATH"), Some(r"C:\Users\joe\AppData\Local\Programs;%NOPE%"));
    assert_eq!(get(&env, "Lit"), Some("%USERPROFILE%"));
  }

  #[test]
  fn keeps_session_specific_variables() {
    let env = build_env(vec![("USERNAME".into(), "joe".into())], vec![var("USERNAME", "SYSTEM", false)], vec![]);
    assert_eq!(get(&env, "USERNAME"), Some("joe"));
  }

  #[test]
  fn expand_handles_stray_percent() {
    let vars = BTreeMap::from([("A".to_string(), ("A".to_string(), "1".to_string()))]);
    assert_eq!(expand_vars("100% %A%", &vars), "100% 1");
    assert_eq!(expand_vars("%%A%", &vars), "%1");
  }

  #[test]
  fn decode_holds_back_split_characters() {
    let mut pending = Vec::new();
    let bytes = "é✓".as_bytes();
    assert_eq!(decode_chunk(&mut pending, &bytes[..1]), "");
    assert_eq!(decode_chunk(&mut pending, &bytes[1..3]), "é");
    assert_eq!(decode_chunk(&mut pending, &bytes[3..]), "✓");
    assert_eq!(decode_chunk(&mut pending, &[0xff, b'a']), "\u{FFFD}a");
    assert!(pending.is_empty());
  }

  #[test]
  fn scrollback_is_capped_on_a_char_boundary() {
    let mut scrollback = Scrollback::default();
    scrollback.push(&"✓".repeat(SCROLLBACK_BYTES / 3 + 10));
    let end = scrollback.push("x");
    assert!(scrollback.text.len() <= SCROLLBACK_BYTES);
    assert!(scrollback.text.ends_with('x'));
    assert_eq!(end, (3 * (SCROLLBACK_BYTES / 3 + 10) + 1) as u64);
  }
}
