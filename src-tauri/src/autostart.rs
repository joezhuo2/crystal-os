//! Launch at login, so the global hotkey is live without opening the app first.
//!
//! The login entry passes [`HIDDEN_ARG`], which keeps the window hidden in the
//! tray; opening the app normally still shows it. The choice lives in
//! `settings.json` and defaults to on. It is re-applied on every launch so the
//! OS entry follows the setting after a reinstall or an exe move.

use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Argument the login entry launches with; see lib.rs.
pub const HIDDEN_ARG: &str = "--hidden";

/// Key in `settings.json` (see settings.rs).
const SETTINGS_KEY: &str = "launchAtLogin";

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![HIDDEN_ARG]))
}

fn apply<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<(), String> {
  let launcher = app.autolaunch();
  let result = if enabled { launcher.enable() } else { launcher.disable() };
  result.map_err(|e| e.to_string())
}

/// Sync the OS login entry to the saved choice. Never fails. Skipped in debug
/// builds so `dev:desktop` does not register the debug exe.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
  if cfg!(debug_assertions) {
    return;
  }
  let enabled = crate::settings::get_bool(app, SETTINGS_KEY).unwrap_or(true);
  if let Err(err) = apply(app, enabled) {
    let action = if enabled { "enable" } else { "disable" };
    log::warn!("[autostart] could not {action} launch at login: {err}");
  }
}

#[tauri::command]
pub async fn get_launch_at_login<R: Runtime>(app: AppHandle<R>) -> bool {
  app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub async fn set_launch_at_login<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<bool, String> {
  apply(&app, enabled)?;
  crate::settings::set(&app, SETTINGS_KEY, enabled.into())
    .map_err(|e| format!("Could not save the setting: {e}"))?;
  Ok(enabled)
}
