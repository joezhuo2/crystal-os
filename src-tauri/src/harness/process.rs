//! Piped child processes for the Nebula tab: one `dsh --profile acp` per
//! project folder and one `claude` per High chat.
//!
//! Rust is a thin pipe. Each stdout line becomes a `harness://line` event; the
//! webview writes whole lines back through `send`. stdin stays open for the
//! life of the process, stderr is drained into a log file so a full pipe can
//! never stall a child, and every child joins a kill-on-close Job Object.

use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::job::{kill_tree, Job};

const LOG_ROTATE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcKind {
  Dsh,
  Claude,
}

impl ProcKind {
  fn log_name(self) -> &'static str {
    match self {
      ProcKind::Dsh => "dsh.log",
      ProcKind::Claude => "claude.log",
    }
  }
}

struct Proc {
  kind: ProcKind,
  /// Workspace path for dsh, chat id for claude.
  key: String,
  pid: u32,
  stdin: Option<ChildStdin>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LineEvent<'a> {
  proc_id: u64,
  line: &'a str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExitEvent {
  pub proc_id: u64,
  pub kind: ProcKind,
  pub key: String,
  pub code: Option<i32>,
}

pub struct Registry {
  procs: Mutex<HashMap<u64, Proc>>,
  next_id: AtomicU64,
  job: Option<Job>,
}

impl Default for Registry {
  fn default() -> Self {
    let job = Job::new();
    if job.is_none() {
      log::warn!("[nebula] could not create a job object; falling back to taskkill");
    }
    Registry { procs: Mutex::new(HashMap::new()), next_id: AtomicU64::new(1), job }
  }
}

pub struct SpawnSpec<'a> {
  pub kind: ProcKind,
  pub key: String,
  pub program: &'a Path,
  pub args: Vec<String>,
  pub cwd: &'a Path,
  pub env: Vec<(String, String)>,
  pub log_dir: PathBuf,
}

impl Registry {
  /// Id of a live process of `kind` with `key`, if any.
  pub fn find(&self, kind: ProcKind, key: &str) -> Option<u64> {
    let procs = self.procs.lock().unwrap();
    procs.iter().find(|(_, p)| p.kind == kind && p.key == key).map(|(id, _)| *id)
  }

  pub fn spawn(self: &Arc<Self>, app: &AppHandle, spec: SpawnSpec<'_>) -> Result<u64, String> {
    let mut command = Command::new(spec.program);
    command
      .args(&spec.args)
      .current_dir(spec.cwd)
      .env_clear()
      .envs(spec.env.iter().map(|(k, v)| (k, v)))
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      const CREATE_NO_WINDOW: u32 = 0x0800_0000;
      command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child: Child = command
      .spawn()
      .map_err(|err| format!("Could not start {}: {err}", spec.program.display()))?;
    let in_job = self.job.as_ref().is_some_and(|job| job.assign(&child));
    if !in_job {
      log::warn!("[nebula] pid {} is not in the job object; taskkill will be used", child.id());
    }

    let id = self.next_id.fetch_add(1, Ordering::SeqCst);
    let stdout = child.stdout.take().ok_or("stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("stderr unavailable")?;
    let proc = Proc { kind: spec.kind, key: spec.key.clone(), pid: child.id(), stdin: child.stdin.take() };
    self.procs.lock().unwrap().insert(id, proc);

    let log = open_log(&spec.log_dir, spec.kind);
    std::thread::spawn(move || drain_stderr(stderr, log));

    let line_app = app.clone();
    std::thread::spawn(move || read_lines(&line_app, id, stdout));

    let registry = Arc::clone(self);
    let exit_app = app.clone();
    let (kind, key) = (spec.kind, spec.key);
    std::thread::spawn(move || {
      let code = child.wait().ok().and_then(|status| status.code());
      registry.procs.lock().unwrap().remove(&id);
      let _ = exit_app.emit("harness://exit", ExitEvent { proc_id: id, kind, key, code });
    });

    Ok(id)
  }

  /// Write one line (a newline is appended) and flush.
  pub fn send(&self, id: u64, line: &str) -> Result<(), String> {
    let mut procs = self.procs.lock().unwrap();
    let proc = procs.get_mut(&id).ok_or_else(|| format!("Process {id} is not running"))?;
    let stdin = proc.stdin.as_mut().ok_or("stdin is closed")?;
    stdin
      .write_all(line.trim_end_matches(['\r', '\n']).as_bytes())
      .and_then(|_| stdin.write_all(b"\n"))
      .and_then(|_| stdin.flush())
      .map_err(|err| format!("Could not write to process {id}: {err}"))
  }

  pub fn kill(&self, id: u64) {
    let proc = self.procs.lock().unwrap().remove(&id);
    if let Some(mut proc) = proc {
      proc.stdin.take();
      // Killing the direct child is not enough for node-based trees; taskkill
      // /T reaches its descendants even when the job holds other processes.
      kill_tree(proc.pid);
    }
  }

  pub fn kill_all(&self) {
    let ids: Vec<u64> = self.procs.lock().unwrap().keys().copied().collect();
    for id in ids {
      self.kill(id);
    }
  }

  /// App exit: end every tree at once.
  pub fn shutdown(&self) {
    if let Some(job) = &self.job {
      job.terminate();
    }
    self.kill_all();
  }
}

fn read_lines(app: &AppHandle, id: u64, stdout: impl Read) {
  let mut reader = BufReader::new(stdout);
  let mut buf = Vec::new();
  loop {
    buf.clear();
    match reader.read_until(b'\n', &mut buf) {
      Ok(0) | Err(_) => break,
      Ok(_) => {
        let text = String::from_utf8_lossy(&buf);
        let line = text.trim_end_matches(['\r', '\n']);
        if !line.is_empty() {
          let _ = app.emit("harness://line", LineEvent { proc_id: id, line });
        }
      }
    }
  }
}

fn open_log(dir: &Path, kind: ProcKind) -> Option<File> {
  std::fs::create_dir_all(dir).ok()?;
  let path = dir.join(kind.log_name());
  if std::fs::metadata(&path).map(|m| m.len() > LOG_ROTATE_BYTES).unwrap_or(false) {
    let _ = std::fs::rename(&path, path.with_extension("log.1"));
  }
  OpenOptions::new().create(true).append(true).open(path).ok()
}

fn drain_stderr(stderr: impl Read, mut log: Option<File>) {
  let mut reader = BufReader::new(stderr);
  let mut buf = [0u8; 8192];
  loop {
    match reader.read(&mut buf) {
      Ok(0) | Err(_) => break,
      Ok(n) => {
        if let Some(file) = log.as_mut() {
          if file.write_all(&buf[..n]).is_err() {
            log = None;
          }
        }
      }
    }
  }
}

#[cfg(all(test, windows))]
mod tests {
  use super::*;

  #[test]
  fn log_rotates_when_large() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("dsh.log");
    std::fs::write(&path, vec![b'x'; (LOG_ROTATE_BYTES + 1) as usize]).unwrap();
    let file = open_log(dir.path(), ProcKind::Dsh);
    assert!(file.is_some());
    assert!(dir.path().join("dsh.log.1").exists());
    assert_eq!(std::fs::metadata(&path).unwrap().len(), 0);
  }
}
