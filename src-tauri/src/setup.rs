//! First-run setup: reads and writes the local API's keys in `.env.local` in
//! the app config dir. Only the keys in `KEYS` can be written, and values are
//! never returned to the webview, only whether each one is set.

use std::collections::HashMap;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

const KEYS: [&str; 4] = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
const REDIRECT_KEY: &str = "GOOGLE_REDIRECT_URI";
const REDIRECT_URI: &str = "http://127.0.0.1:8787/api/calendar/auth/callback";
const MAX_VALUE: usize = 2048;

fn env_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(".env.local"))
}

fn line_key(line: &str) -> Option<&str> {
  let trimmed = line.trim_start();
  if trimmed.starts_with('#') {
    return None;
  }
  trimmed.split_once('=').map(|(key, _)| key.trim())
}

fn value_of<'a>(content: &'a str, key: &str) -> Option<&'a str> {
  content
    .lines()
    .filter(|line| line_key(line) == Some(key))
    .filter_map(|line| line.split_once('=').map(|(_, value)| value.trim()))
    .last()
}

fn is_set(content: &str, key: &str) -> bool {
  value_of(content, key).is_some_and(|v| !v.trim_matches(|c| c == '"' || c == '\'').is_empty())
}

fn upsert(content: &str, key: &str, value: &str) -> String {
  let mut replaced = false;
  let mut lines: Vec<String> = content
    .lines()
    .map(|line| {
      if line_key(line) == Some(key) {
        replaced = true;
        format!("{key}={value}")
      } else {
        line.to_string()
      }
    })
    .collect();
  if !replaced {
    lines.push(format!("{key}={value}"));
  }
  lines.join("\n") + "\n"
}

fn apply(content: &str, values: &HashMap<String, String>) -> Result<String, String> {
  let mut next = content.to_string();
  for (key, value) in values {
    if !KEYS.contains(&key.as_str()) {
      return Err(format!("{key} cannot be set here."));
    }
    let value = value.trim();
    if value.is_empty() {
      continue;
    }
    if value.len() > MAX_VALUE || value.chars().any(|c| c.is_control() || c.is_whitespace() || c == '"' || c == '\'' || c == '#') {
      return Err(format!("{key} has characters that are not allowed."));
    }
    next = upsert(&next, key, value);
  }
  if is_set(&next, "GOOGLE_CLIENT_ID") && !is_set(&next, REDIRECT_KEY) {
    next = upsert(&next, REDIRECT_KEY, REDIRECT_URI);
  }
  Ok(next)
}

#[tauri::command]
pub fn setup_env_status<R: Runtime>(app: AppHandle<R>) -> Result<HashMap<String, bool>, String> {
  let content = std::fs::read_to_string(env_path(&app)?).unwrap_or_default();
  Ok(KEYS.iter().map(|key| (key.to_string(), is_set(&content, key))).collect())
}

#[tauri::command]
pub fn setup_write_env<R: Runtime>(app: AppHandle<R>, values: HashMap<String, String>) -> Result<HashMap<String, bool>, String> {
  let path = env_path(&app)?;
  let content = std::fs::read_to_string(&path).unwrap_or_default();
  let next = apply(&content, &values)?;
  std::fs::write(&path, &next).map_err(|e| e.to_string())?;
  // The sidecar reads .env.local once at start: the next /api request restarts it.
  crate::sidecar::stop(&app);
  Ok(KEYS.iter().map(|key| (key.to_string(), is_set(&next, key))).collect())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn values(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
  }

  #[test]
  fn replaces_a_key_and_keeps_the_rest() {
    let before = "# mine\nGOOGLE_REFRESH_TOKEN=abc\nGOOGLE_CLIENT_ID=old\nGOOGLE_REDIRECT_URI=http://x\n";
    let after = apply(before, &values(&[("GOOGLE_CLIENT_ID", "new")])).unwrap();
    assert_eq!(after, "# mine\nGOOGLE_REFRESH_TOKEN=abc\nGOOGLE_CLIENT_ID=new\nGOOGLE_REDIRECT_URI=http://x\n");
  }

  #[test]
  fn adds_the_redirect_uri_with_a_new_google_client() {
    let after = apply("", &values(&[("GOOGLE_CLIENT_ID", "id")])).unwrap();
    assert_eq!(after, format!("GOOGLE_CLIENT_ID=id\n{REDIRECT_KEY}={REDIRECT_URI}\n"));
  }

  #[test]
  fn blank_values_leave_the_file_alone() {
    assert_eq!(apply("VITE_SUPABASE_URL=https://a.b\n", &values(&[("VITE_SUPABASE_URL", "  ")])).unwrap(), "VITE_SUPABASE_URL=https://a.b\n");
  }

  #[test]
  fn refuses_other_keys_and_multi_line_values() {
    assert!(apply("", &values(&[("GOOGLE_REFRESH_TOKEN", "x")])).is_err());
    assert!(apply("", &values(&[("GOOGLE_CLIENT_ID", "a\nEVIL=1")])).is_err());
  }

  #[test]
  fn empty_and_quoted_empty_values_are_not_set() {
    assert!(!is_set("GOOGLE_CLIENT_ID=\n", "GOOGLE_CLIENT_ID"));
    assert!(!is_set("GOOGLE_CLIENT_ID=\"\"\n", "GOOGLE_CLIENT_ID"));
    assert!(is_set("GOOGLE_CLIENT_ID=abc\n", "GOOGLE_CLIENT_ID"));
  }
}
