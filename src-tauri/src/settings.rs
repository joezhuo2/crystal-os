//! `settings.json` in the app config dir (next to `.env.local`). Each module
//! owns one top-level key; writes are read-modify-write so keys another module
//! owns are carried through untouched.

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime};

const SETTINGS_FILE: &str = "settings.json";

/// Serialises read-modify-write cycles so two modules saving at once cannot
/// drop each other's key.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
  app.path().app_config_dir().ok().map(|dir| dir.join(SETTINGS_FILE))
}

fn read_all<R: Runtime>(app: &AppHandle<R>) -> Map<String, Value> {
  settings_path(app)
    .and_then(|path| std::fs::read_to_string(path).ok())
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

pub fn get_string<R: Runtime>(app: &AppHandle<R>, key: &str) -> Option<String> {
  read_all(app).get(key).and_then(Value::as_str).map(str::to_string)
}

pub fn set<R: Runtime>(app: &AppHandle<R>, key: &str, value: Value) -> Result<(), String> {
  let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let path = settings_path(app).ok_or("App config directory is unavailable")?;
  let mut settings = read_all(app);
  settings.insert(key.to_string(), value);
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
  std::fs::write(path, json).map_err(|e| e.to_string())
}
