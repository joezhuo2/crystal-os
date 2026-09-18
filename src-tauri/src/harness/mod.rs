//! The Nebula tab's native side (ADR 0003): DeepSeek Harness over ACP for the
//! Low and Medium tiers, the claude CLI for High, plus chat storage.
//!
//! Protocol logic lives in TypeScript (`src/lib/harness/`). Rust owns what the
//! webview must not: spawning processes, API keys, MCP server env values, and
//! files outside the app's own storage.

mod claude;
mod config;
mod discovery;
pub(crate) mod job;
mod process;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Window};

use process::{ProcKind, Registry, SpawnSpec};

/// The DeepSeek Harness release Nebula is tested against. Bump deliberately:
/// dsh is a developer preview with breaking changes.
pub const DSH_VERSION: &str = "0.1.5-rc.1";

#[derive(Default)]
pub struct HarnessState {
  registry: Arc<Registry>,
  /// Serialises every read and write of Nebula's own files.
  io: Mutex<()>,
}

/* ------------------------------------------------------------------ *
 * Helpers shared by the submodules
 * ------------------------------------------------------------------ */

pub(crate) fn env_get<'a>(env: &'a [(String, String)], name: &str) -> Option<&'a str> {
  env.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
}

/// Finds `program` on the PATH in `env`, trying PATHEXT extensions on Windows.
pub(crate) fn which(env: &[(String, String)], program: &str) -> Option<PathBuf> {
  let path = env_get(env, "PATH")?;
  let separator = if cfg!(windows) { ';' } else { ':' };
  let has_ext = Path::new(program).extension().is_some();
  let exts: Vec<String> = if cfg!(windows) && !has_ext {
    env_get(env, "PATHEXT").unwrap_or(".COM;.EXE;.BAT;.CMD").split(';').filter(|e| !e.is_empty()).map(str::to_ascii_lowercase).collect()
  } else {
    vec![String::new()]
  };
  path.split(separator).filter(|dir| !dir.is_empty()).find_map(|dir| {
    exts.iter().map(|ext| Path::new(dir.trim_matches('"')).join(format!("{program}{ext}"))).find(|c| c.is_file())
  })
}

/// Write to a sibling temp file, then rename over the target. Windows can
/// briefly refuse the rename while an indexer or antivirus holds the file, so
/// a sharing violation is retried.
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let tmp = path.with_extension(format!("{}.tmp", path.extension().and_then(|e| e.to_str()).unwrap_or("")));
  std::fs::write(&tmp, bytes).map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
  let mut delay = 50;
  for attempt in 0..4 {
    match std::fs::rename(&tmp, path) {
      Ok(()) => return Ok(()),
      Err(err) if attempt < 3 && matches!(err.raw_os_error(), Some(5) | Some(32)) => {
        std::thread::sleep(Duration::from_millis(delay));
        delay *= 2;
      }
      Err(err) => {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("Could not save {}: {err}", path.display()));
      }
    }
  }
  unreachable!()
}

fn app_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  app.path().app_config_dir().map_err(|e| e.to_string())
}

fn harness_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  Ok(app_dir(app)?.join("harness"))
}

fn dsh_home<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  Ok(app_dir(app)?.join("dsh"))
}

fn runtime_dir(home: &Path) -> PathBuf {
  home.join("runtime")
}

fn dsh_bin(home: &Path) -> PathBuf {
  runtime_dir(home).join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js")
}

fn installed_dsh_version(home: &Path) -> Option<String> {
  let manifest = runtime_dir(home).join("node_modules").join("@deepseek-ai").join("dsh").join("package.json");
  let doc: Value = serde_json::from_str(&std::fs::read_to_string(manifest).ok()?).ok()?;
  doc.get("version").and_then(Value::as_str).map(str::to_string)
}

fn roots(env: &[(String, String)]) -> Result<discovery::Roots, String> {
  let home = env_get(env, "USERPROFILE").or_else(|| env_get(env, "HOME")).ok_or("Home folder is unknown")?;
  Ok(discovery::Roots { home: PathBuf::from(home), appdata: env_get(env, "APPDATA").map(PathBuf::from) })
}

fn workspace_key(path: &Path) -> String {
  config::forward_slashes(path).to_ascii_lowercase()
}

fn existing_dir(path: &str) -> Result<PathBuf, String> {
  let dir = PathBuf::from(path);
  if dir.is_absolute() && dir.is_dir() {
    Ok(dir)
  } else {
    Err(format!("Folder does not exist: {path}"))
  }
}

/* ------------------------------------------------------------------ *
 * Environment and install
 * ------------------------------------------------------------------ */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvStatus {
  node: Option<String>,
  claude: Option<String>,
  dsh_version: &'static str,
  runtime_installed: bool,
  keys: config::KeyStatus,
}

#[tauri::command]
pub async fn harness_env_status(app: AppHandle) -> Result<EnvStatus, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let env = crate::terminal::fresh_env();
    let home = dsh_home(&app)?;
    Ok(EnvStatus {
      node: which(&env, "node").map(|p| p.display().to_string()),
      claude: claude::resolve_binary(&env).map(|p| p.display().to_string()),
      dsh_version: DSH_VERSION,
      runtime_installed: installed_dsh_version(&home).as_deref() == Some(DSH_VERSION) && dsh_bin(&home).is_file(),
      keys: config::key_status(&home),
    })
  })
  .await
  .map_err(|e| e.to_string())?
}

/// One-time `npm install` of the pinned dsh into the app's own runtime folder.
/// Progress lines are emitted as `harness://install`.
#[tauri::command]
pub async fn harness_install_runtime(app: AppHandle) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    let env = crate::terminal::fresh_env();
    let node = which(&env, "node").ok_or("Node.js was not found on PATH. Install Node.js 22 or newer, then retry.")?;
    let home = dsh_home(&app)?;
    let runtime = runtime_dir(&home);
    std::fs::create_dir_all(&runtime).map_err(|e| e.to_string())?;
    let manifest = runtime.join("package.json");
    if !manifest.is_file() {
      atomic_write(&manifest, br#"{ "name": "crystal-os-dsh-runtime", "private": true }"#)?;
    }

    let spec = format!("@deepseek-ai/dsh@{DSH_VERSION}");
    let npm_cli = node.parent().map(|d| d.join("node_modules").join("npm").join("bin").join("npm-cli.js"));
    let mut command = match npm_cli.filter(|p| p.is_file()) {
      Some(cli) => {
        let mut c = Command::new(&node);
        c.arg(cli);
        c
      }
      None => {
        let npm = which(&env, "npm").ok_or("npm was not found on PATH")?;
        let mut c = Command::new(format!("{}\\System32\\cmd.exe", env_get(&env, "SystemRoot").unwrap_or(r"C:\Windows")));
        c.args(["/d", "/c"]).arg(npm);
        c
      }
    };
    command
      .args(["install", "--no-audit", "--no-fund", "--loglevel=http", "--save-exact"])
      .arg(&spec)
      .current_dir(&runtime)
      .env_clear()
      .envs(env.iter().map(|(k, v)| (k, v)))
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|e| format!("Could not run npm: {e}"))?;
    let emit_lines = |stream: Box<dyn std::io::Read + Send>, app: AppHandle| {
      std::thread::spawn(move || {
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
          let _ = app.emit("harness://install", line);
        }
      })
    };
    let out = emit_lines(Box::new(child.stdout.take().unwrap()), app.clone());
    let err = emit_lines(Box::new(child.stderr.take().unwrap()), app.clone());
    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = (out.join(), err.join());
    if !status.success() || installed_dsh_version(&home).as_deref() != Some(DSH_VERSION) {
      return Err(format!("npm install {spec} failed (exit {:?}). See the log above.", status.code()));
    }
    Ok(())
  })
  .await
  .map_err(|e| e.to_string())?
}

/* ------------------------------------------------------------------ *
 * Configuration, keys, discovery, probes
 * ------------------------------------------------------------------ */

#[tauri::command]
pub fn harness_get_config(app: AppHandle) -> Result<config::NebulaConfig, String> {
  Ok(config::load(&harness_dir(&app)?.join("config.json")))
}

#[tauri::command]
pub fn harness_set_config(app: AppHandle, state: State<'_, HarnessState>, config: config::NebulaConfig) -> Result<(), String> {
  let _io = state.io.lock().unwrap();
  config::save(&harness_dir(&app)?.join("config.json"), &config)?;
  let env = crate::terminal::fresh_env();
  let skills = discovery::skill_dirs(&roots(&env)?);
  config::write_dsh_files(&dsh_home(&app)?, &config, &skills)
}

#[tauri::command]
pub fn harness_set_key(app: AppHandle, state: State<'_, HarnessState>, provider: String, key: Option<String>) -> Result<config::KeyStatus, String> {
  let _io = state.io.lock().unwrap();
  let home = dsh_home(&app)?;
  config::set_key(&home, &provider, key.as_deref())?;
  Ok(config::key_status(&home))
}

#[tauri::command]
pub async fn harness_discover(app: AppHandle, cwd: Option<String>) -> Result<discovery::DiscoverySummary, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let env = crate::terminal::fresh_env();
    let config = config::load(&harness_dir(&app)?.join("config.json"));
    let found = discovery::discover(&roots(&env)?, cwd.as_deref().map(Path::new), &env, &config.disabled_mcp);
    Ok(discovery::summarize(&found))
  })
  .await
  .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
  ok: bool,
  status: Option<u16>,
  error: Option<String>,
  /// Configured model ids the endpoint did not list (NIM only).
  missing_models: Vec<String>,
  has_key: bool,
}

/// `GET {base}/models` with the stored key and a short timeout. Runs in Rust so
/// keys never reach the webview.
#[tauri::command]
pub async fn harness_probe(app: AppHandle, provider: String) -> Result<ProbeResult, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let config = config::load(&harness_dir(&app)?.join("config.json"));
    let key = config::get_key(&dsh_home(&app)?, &provider);
    let (base, wanted) = match provider.as_str() {
      "nvidia" => (config.nim_base_url.clone(), vec![config.nim_models.kimi, config.nim_models.deepseek, config.nim_models.nemotron]),
      "omniroute" => (config.omniroute_base_url.clone(), Vec::new()),
      other => return Err(format!("Unknown provider: {other}")),
    };
    let agent: ureq::Agent = ureq::Agent::config_builder()
      .timeout_global(Some(Duration::from_secs(3)))
      .http_status_as_error(false)
      .build()
      .into();
    let mut request = agent.get(format!("{}/models", base.trim_end_matches('/')));
    if let Some(key) = &key {
      request = request.header("Authorization", format!("Bearer {key}"));
    }
    let has_key = key.is_some();
    match request.call() {
      Ok(mut response) => {
        let status = response.status().as_u16();
        let body = response.body_mut().read_to_string().unwrap_or_default();
        let listed: Vec<String> = serde_json::from_str::<Value>(&body)
          .ok()
          .and_then(|v| v.get("data").and_then(Value::as_array).cloned())
          .map(|models| models.iter().filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_string)).collect())
          .unwrap_or_default();
        let missing_models = if listed.is_empty() { Vec::new() } else { wanted.into_iter().filter(|w| !listed.contains(w)).collect() };
        Ok(ProbeResult { ok: (200..300).contains(&status), status: Some(status), error: None, missing_models, has_key })
      }
      Err(err) => Ok(ProbeResult { ok: false, status: None, error: Some(err.to_string()), missing_models: Vec::new(), has_key }),
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

/* ------------------------------------------------------------------ *
 * Processes
 * ------------------------------------------------------------------ */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
  proc_id: u64,
  reused: bool,
}

/// One dsh process per project folder, so dsh's sandbox root is that folder.
#[tauri::command]
pub async fn harness_dsh_start(app: AppHandle, state: State<'_, HarnessState>, workspace: String) -> Result<Started, String> {
  let cwd = existing_dir(&workspace)?;
  let key = workspace_key(&cwd);
  if let Some(proc_id) = state.registry.find(ProcKind::Dsh, &key) {
    return Ok(Started { proc_id, reused: true });
  }
  let registry = Arc::clone(&state.registry);
  tauri::async_runtime::spawn_blocking(move || {
    let env = crate::terminal::fresh_env();
    let home = dsh_home(&app)?;
    if installed_dsh_version(&home).as_deref() != Some(DSH_VERSION) {
      return Err("DeepSeek Harness is not installed yet".to_string());
    }
    let node = which(&env, "node").ok_or("Node.js was not found on PATH")?;
    let config = config::load(&harness_dir(&app)?.join("config.json"));
    let skills = discovery::skill_dirs(&roots(&env)?);
    config::write_dsh_files(&home, &config, &skills)?;

    let mut child_env: Vec<(String, String)> = claude::scrub_env(env)
      .into_iter()
      .filter(|(k, _)| {
        let upper = k.to_ascii_uppercase();
        // Launch-environment keys would override the credentials file.
        upper != config::NVIDIA_KEY_REF && upper != config::OMNIROUTE_KEY_REF && !upper.starts_with("DSH_")
      })
      .collect();
    child_env.push(("DSH_HOME".into(), home.display().to_string()));
    child_env.push(("NO_COLOR".into(), "1".into()));

    let proc_id = registry.spawn(
      &app,
      SpawnSpec {
        kind: ProcKind::Dsh,
        key,
        program: &node,
        args: vec![dsh_bin(&home).display().to_string(), "--profile".into(), "acp".into()],
        cwd: &cwd,
        env: child_env,
        log_dir: harness_dir(&app)?.join("logs"),
      },
    )?;
    Ok(Started { proc_id, reused: false })
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Builds the ACP `session/new` or `session/resume` request and writes it to
/// dsh directly, so MCP server env values never pass through the webview.
/// Returns the names of the MCP servers that were attached.
#[tauri::command]
pub async fn harness_acp_open_session(
  app: AppHandle,
  state: State<'_, HarnessState>,
  proc_id: u64,
  rpc_id: u64,
  cwd: String,
  session_id: Option<String>,
  with_mcp: bool,
) -> Result<Vec<String>, String> {
  let dir = existing_dir(&cwd)?;
  let registry = Arc::clone(&state.registry);
  tauri::async_runtime::spawn_blocking(move || {
    let servers = if with_mcp {
      let env = crate::terminal::fresh_env();
      let config = config::load(&harness_dir(&app)?.join("config.json"));
      discovery::acp_servers(&discovery::discover(&roots(&env)?, Some(&dir), &env, &config.disabled_mcp))
    } else {
      Vec::new()
    };
    let names = servers.iter().filter_map(|s| s["name"].as_str().map(str::to_string)).collect();
    let cwd = dir.display().to_string();
    let (method, params) = match session_id {
      Some(id) => {
        if !claude::valid_uuid(&id) {
          return Err("Invalid session id".to_string());
        }
        ("session/resume", json!({ "sessionId": id, "cwd": cwd, "mcpServers": servers }))
      }
      None => ("session/new", json!({ "cwd": cwd, "mcpServers": servers })),
    };
    let request = json!({ "jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params });
    registry.send(proc_id, &request.to_string())?;
    Ok(names)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn harness_claude_start(app: AppHandle, state: State<'_, HarnessState>, opts: claude::ClaudeOpts) -> Result<Started, String> {
  let cwd = claude::validate(&opts)?;
  if let Some(old) = state.registry.find(ProcKind::Claude, &opts.chat_id) {
    state.registry.kill(old);
  }
  let registry = Arc::clone(&state.registry);
  tauri::async_runtime::spawn_blocking(move || {
    let env = crate::terminal::fresh_env();
    let program = claude::resolve_binary(&env).ok_or("Claude Code (claude.exe) was not found")?;
    let proc_id = registry.spawn(
      &app,
      SpawnSpec {
        kind: ProcKind::Claude,
        key: opts.chat_id.clone(),
        program: &program,
        args: claude::args(&opts),
        cwd: &cwd,
        env: claude::scrub_env(env),
        log_dir: harness_dir(&app)?.join("logs"),
      },
    )?;
    Ok(Started { proc_id, reused: false })
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn harness_send(state: State<'_, HarnessState>, proc_id: u64, line: String) -> Result<(), String> {
  state.registry.send(proc_id, &line)
}

#[tauri::command]
pub fn harness_kill(state: State<'_, HarnessState>, proc_id: u64) {
  state.registry.kill(proc_id);
}

/// Called when the webview boots: a reload must not leave orphaned agents.
#[tauri::command]
pub fn harness_reset(state: State<'_, HarnessState>) {
  state.registry.kill_all();
}

pub fn shutdown(app: &AppHandle) {
  app.state::<HarnessState>().registry.shutdown();
}

/* ------------------------------------------------------------------ *
 * Projects and chats
 * ------------------------------------------------------------------ */

#[tauri::command]
pub async fn harness_pick_folder(app: AppHandle, window: Window, start: Option<String>) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  tauri::async_runtime::spawn_blocking(move || {
    let mut builder = app.dialog().file().set_title("Choose a project folder").set_parent(&window);
    if let Some(dir) = start.map(PathBuf::from).filter(|d| d.is_dir()) {
      builder = builder.set_directory(dir);
    }
    let Some(picked) = builder.blocking_pick_folder() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
  })
  .await
  .map_err(|e| e.to_string())?
}

const RESERVED_NAMES: [&str; 22] = [
  "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4",
  "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn valid_project_name(name: &str) -> bool {
  let trimmed = name.trim();
  !trimmed.is_empty()
    && trimmed.len() <= 100
    && trimmed == name
    && !name.ends_with('.')
    && !name.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control())
    && !RESERVED_NAMES.contains(&name.split('.').next().unwrap_or("").to_ascii_uppercase().as_str())
    && name != ".."
}

#[tauri::command]
pub fn harness_create_project(root: String, name: String) -> Result<String, String> {
  if !valid_project_name(&name) {
    return Err(format!("'{name}' is not a valid folder name"));
  }
  let root = PathBuf::from(&root);
  if !root.is_absolute() {
    return Err("Projects folder must be an absolute path".into());
  }
  std::fs::create_dir_all(&root).map_err(|e| format!("Could not create {}: {e}", root.display()))?;
  let dir = root.join(&name);
  if dir.exists() {
    return Err(format!("{} already exists", dir.display()));
  }
  std::fs::create_dir(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
  Ok(dir.display().to_string())
}

fn chat_path<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<PathBuf, String> {
  if !claude::valid_chat_id(id) {
    return Err("Invalid chat id".into());
  }
  Ok(harness_dir(app)?.join("chats").join(format!("{id}.json")))
}

fn check_json(text: &str) -> Result<(), String> {
  serde_json::from_str::<Value>(text).map(|_| ()).map_err(|e| format!("Refusing to save invalid JSON: {e}"))
}

#[tauri::command]
pub fn harness_state_load(app: AppHandle, state: State<'_, HarnessState>) -> Result<Option<String>, String> {
  let _io = state.io.lock().unwrap();
  Ok(std::fs::read_to_string(harness_dir(&app)?.join("state.json")).ok())
}

#[tauri::command]
pub fn harness_state_save(app: AppHandle, state: State<'_, HarnessState>, json: String) -> Result<(), String> {
  check_json(&json)?;
  let _io = state.io.lock().unwrap();
  atomic_write(&harness_dir(&app)?.join("state.json"), json.as_bytes())
}

#[tauri::command]
pub fn harness_chat_load(app: AppHandle, state: State<'_, HarnessState>, id: String) -> Result<Option<String>, String> {
  let path = chat_path(&app, &id)?;
  let _io = state.io.lock().unwrap();
  Ok(std::fs::read_to_string(path).ok())
}

#[tauri::command]
pub fn harness_chat_save(app: AppHandle, state: State<'_, HarnessState>, id: String, json: String) -> Result<(), String> {
  let path = chat_path(&app, &id)?;
  check_json(&json)?;
  let _io = state.io.lock().unwrap();
  atomic_write(&path, json.as_bytes())
}

#[tauri::command]
pub fn harness_chat_delete(app: AppHandle, state: State<'_, HarnessState>, id: String) -> Result<(), String> {
  let path = chat_path(&app, &id)?;
  let _io = state.io.lock().unwrap();
  match std::fs::remove_file(path) {
    Ok(()) => Ok(()),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(err) => Err(err.to_string()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn atomic_write_replaces_existing_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chats").join("a.json");
    atomic_write(&path, b"{\"v\":1}").unwrap();
    atomic_write(&path, b"{\"v\":2}").unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"v\":2}");
    assert_eq!(std::fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
  }

  #[test]
  fn project_names_are_validated() {
    for good in ["my-app", "Crystal OS", "v2.1"] {
      assert!(valid_project_name(good), "{good}");
    }
    for bad in ["", " lead", "a/b", "a\\b", "con", "LPT1.txt", "dots.", "..", "x:y"] {
      assert!(!valid_project_name(bad), "{bad}");
    }
  }

  #[test]
  fn which_finds_programs_with_pathext() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join(if cfg!(windows) { "tool.cmd" } else { "tool" }), b"").unwrap();
    let env = vec![("PATH".to_string(), dir.path().display().to_string()), ("PATHEXT".to_string(), ".EXE;.CMD".to_string())];
    assert!(which(&env, "tool").is_some());
    assert!(which(&env, "absent").is_none());
  }
}
