//! Main-window visibility helpers shared by the global hotkey and the tray.

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

pub fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
  app.get_webview_window("main")
}

/// True when the window is on screen (visible and not minimised).
pub fn is_shown<R: Runtime>(window: &WebviewWindow<R>) -> bool {
  window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
}

/// Restore, show, and focus the main window. It is only re-centred when it was
/// hidden or minimised, so focusing a visible window does not move it.
pub fn show<R: Runtime>(app: &AppHandle<R>) {
  let Some(window) = main_window(app) else { return };

  let minimized = window.is_minimized().unwrap_or(false);
  if minimized {
    let _ = window.unminimize();
  }
  if !window.is_visible().unwrap_or(false) || minimized {
    let _ = window.center();
  }
  let _ = window.show();
  let _ = window.set_focus();
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
  if let Some(window) = main_window(app) {
    let _ = window.hide();
  }
}
