//! Global hotkey that summons the command palette from anywhere.
//!
//! The combo lives in `settings.json` in the app config dir (next to
//! `.env.local`), so it is registered in Rust at startup, before the webview
//! has loaded or anyone has signed in. A registration failure never aborts
//! startup: it is kept in [`HotkeyState`] and the webview reads it on mount to
//! show a toast.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT_ACCELERATOR: &str = "Alt+Space";

/// Event the webview listens for to open and focus `CommandPalette`.
const OPEN_PALETTE_EVENT: &str = "palette://open";

/// Key in `settings.json` (see settings.rs).
const SETTINGS_KEY: &str = "globalShortcut";

/// What the webview needs to render the setting and report failures.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
  accelerator: String,
  registered: bool,
  error: Option<String>,
}

pub struct HotkeyState(Mutex<HotkeyStatus>);

impl Default for HotkeyState {
  fn default() -> Self {
    Self(Mutex::new(HotkeyStatus {
      accelerator: DEFAULT_ACCELERATOR.into(),
      registered: false,
      error: None,
    }))
  }
}

fn write_accelerator<R: Runtime>(app: &AppHandle<R>, accelerator: &str) -> Result<(), String> {
  crate::settings::set(app, SETTINGS_KEY, accelerator.into())
}

/// Turn a plugin error into something a toast can say.
fn describe(accelerator: &str, err: impl std::fmt::Display) -> String {
  let msg = err.to_string();
  if msg.contains("already registered") {
    format!("{accelerator} is already in use by another app")
  } else {
    format!("Could not register {accelerator}: {msg}")
  }
}

fn register<R: Runtime>(app: &AppHandle<R>, accelerator: &str) -> Result<(), String> {
  let shortcut: Shortcut = accelerator
    .parse()
    .map_err(|e| format!("\"{accelerator}\" is not a valid shortcut: {e}"))?;
  app.global_shortcut().register(shortcut).map_err(|e| describe(accelerator, e))
}

/// Show + focus the main window and open the palette, or hide the window if
/// it already has focus.
fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
  let Some(window) = crate::window::main_window(app) else { return };

  if crate::window::is_shown(&window) && window.is_focused().unwrap_or(false) {
    crate::window::hide(app);
    return;
  }

  crate::window::show(app);
  let _ = app.emit(OPEN_PALETTE_EVENT, ());
}

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri_plugin_global_shortcut::Builder::new()
    .with_handler(|app, _shortcut, event| {
      // Only one shortcut is ever registered, so any press is ours. The
      // handler must not lock HotkeyState: the commands below hold that lock
      // while (un)registering on the main thread, which is where this runs.
      if event.state() == ShortcutState::Pressed {
        toggle_main_window(app);
      }
    })
    .build()
}

/// Register the saved combo (or the default) at startup. Never fails.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
  let accelerator = crate::settings::get_string(app, SETTINGS_KEY)
    .unwrap_or_else(|| DEFAULT_ACCELERATOR.to_string());

  let result = register(app, &accelerator);
  if let Err(err) = &result {
    log::warn!("[hotkey] {err}");
  }

  *app.state::<HotkeyState>().0.lock().unwrap() = HotkeyStatus {
    registered: result.is_ok(),
    error: result.err(),
    accelerator,
  };
}

#[tauri::command]
pub async fn get_global_shortcut<R: Runtime>(app: AppHandle<R>) -> HotkeyStatus {
  app.state::<HotkeyState>().0.lock().unwrap().clone()
}

/// Swap the combo. The new one is only saved once it registers; on failure
/// the previous combo is restored and the error is returned for a toast.
#[tauri::command]
pub async fn set_global_shortcut<R: Runtime>(
  app: AppHandle<R>,
  accelerator: String,
) -> Result<HotkeyStatus, String> {
  let state = app.state::<HotkeyState>();
  let mut status = state.0.lock().unwrap();
  let previous = status.accelerator.clone();

  if status.registered {
    if previous.eq_ignore_ascii_case(&accelerator) {
      return Ok(status.clone());
    }
    let _ = app.global_shortcut().unregister(previous.as_str());
  }

  if let Err(err) = register(&app, &accelerator) {
    status.registered = register(&app, &previous).is_ok();
    return Err(err);
  }

  if let Err(err) = write_accelerator(&app, &accelerator) {
    // Registered but not saved: keep the old combo so the next launch agrees
    // with what is active now.
    let _ = app.global_shortcut().unregister(accelerator.as_str());
    status.registered = register(&app, &previous).is_ok();
    return Err(format!("Could not save the shortcut: {err}"));
  }

  *status = HotkeyStatus { accelerator, registered: true, error: None };
  Ok(status.clone())
}

/// Release the combo while the settings dialog records a new one; otherwise
/// pressing the current combo would hide the window instead of being captured.
#[tauri::command]
pub async fn pause_global_shortcut<R: Runtime>(app: AppHandle<R>, paused: bool) -> Result<(), String> {
  let state = app.state::<HotkeyState>();
  let mut status = state.0.lock().unwrap();
  let accelerator = status.accelerator.clone();

  if paused {
    if status.registered {
      app.global_shortcut().unregister(accelerator.as_str()).map_err(|e| e.to_string())?;
      status.registered = false;
    }
    return Ok(());
  }

  if !status.registered {
    let result = register(&app, &accelerator);
    status.registered = result.is_ok();
    status.error = result.clone().err();
    return result;
  }
  Ok(())
}
