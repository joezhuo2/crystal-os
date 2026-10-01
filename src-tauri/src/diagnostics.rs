//! Local error log for the webview: unhandled promise rejections, uncaught
//! errors, and failed Supabase writes (src/lib/diagnostics.ts). Lines go to
//! `diagnostics.log` in the app log dir, e.g.
//! `%LOCALAPPDATA%\com.crystalos.desktop\logs\diagnostics.log`. When it passes
//! [`MAX_BYTES`] it is renamed to `diagnostics.old.log`, replacing the previous
//! one, so at most two files are kept. Nothing leaves the machine; Settings
//! reads the tail back for "Copy diagnostics".

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, State};

const FILE: &str = "diagnostics.log";
const OLD_FILE: &str = "diagnostics.old.log";
const MAX_BYTES: u64 = 512 * 1024;
/// Per call, so a runaway loop in the webview cannot fill the disk in one go.
const MAX_LINES_PER_APPEND: usize = 50;
const MAX_LINE_CHARS: usize = 2_000;
/// Upper bound for `diagnostics_read`.
const MAX_READ_LINES: usize = 1_000;

/// Serialises appends and rotation.
#[derive(Default)]
pub struct DiagnosticsState(Mutex<()>);

fn log_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  app.path().app_log_dir().map_err(|e| e.to_string())
}

fn clean(line: &str) -> String {
  // One entry per line: newlines in a stack trace would split it.
  let flat = line.replace(['\r', '\n'], " ⏎ ");
  flat.chars().take(MAX_LINE_CHARS).collect()
}

#[tauri::command]
pub fn diagnostics_append<R: Runtime>(
  app: AppHandle<R>,
  state: State<'_, DiagnosticsState>,
  lines: Vec<String>,
) -> Result<(), String> {
  if lines.is_empty() {
    return Ok(());
  }
  let dir = log_dir(&app)?;
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = dir.join(FILE);

  let _guard = state.0.lock().map_err(|e| e.to_string())?;
  if fs::metadata(&path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
    fs::rename(&path, dir.join(OLD_FILE)).map_err(|e| e.to_string())?;
  }
  let mut file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&path)
    .map_err(|e| e.to_string())?;
  for line in lines.iter().take(MAX_LINES_PER_APPEND) {
    writeln!(file, "{}", clean(line)).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[derive(serde::Serialize)]
pub struct DiagnosticsLog {
  /// Where the log lives, shown so the user can attach the whole file.
  path: String,
  /// The newest `max_lines` lines, oldest first.
  lines: Vec<String>,
}

#[tauri::command]
pub fn diagnostics_read<R: Runtime>(
  app: AppHandle<R>,
  state: State<'_, DiagnosticsState>,
  max_lines: usize,
) -> Result<DiagnosticsLog, String> {
  let dir = log_dir(&app)?;
  let path = dir.join(FILE);
  let max_lines = max_lines.min(MAX_READ_LINES);

  let _guard = state.0.lock().map_err(|e| e.to_string())?;
  let mut all: Vec<String> = Vec::new();
  for file in [dir.join(OLD_FILE), path.clone()] {
    if let Ok(text) = fs::read_to_string(&file) {
      all.extend(text.lines().map(str::to_owned));
    }
  }
  let start = all.len().saturating_sub(max_lines);
  Ok(DiagnosticsLog {
    path: path.to_string_lossy().into_owned(),
    lines: all.split_off(start),
  })
}
