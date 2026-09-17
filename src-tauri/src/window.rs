//! Main-window visibility helpers shared by the global hotkey and the tray.
//!
//! These use the plain `Window`, not `WebviewWindow`: once the Portal tab adds
//! child webviews to "main", Tauri stops treating it as a webview window and
//! `get_webview_window("main")` returns `None`.

use tauri::{AppHandle, Manager, Runtime, Window};

pub fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<Window<R>> {
  app.get_window("main")
}

/// True when the window is on screen (visible and not minimised).
pub fn is_shown<R: Runtime>(window: &Window<R>) -> bool {
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
  // Gives the Portal app on screen its caches back before it is painted; the
  // others stay trimmed until they are shown.
  crate::portal::set_all_memory_saving(app, false);
  // The window alone taking focus leaves keys going nowhere until a click, so
  // hand focus to the Portal app on screen or the main webview.
  crate::portal::focus_content(app);
}

/// True when the window is the one the user is working in. `is_focused` is not
/// enough: it turns false once a Portal app page takes keyboard focus, even
/// though the window is still in front.
#[cfg(windows)]
pub fn is_foreground<R: Runtime>(window: &Window<R>) -> bool {
  use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOT};

  let Ok(hwnd) = window.hwnd() else { return false };
  let foreground = unsafe { GetForegroundWindow() };
  !foreground.is_invalid() && (foreground == hwnd || unsafe { GetAncestor(foreground, GA_ROOT) } == hwnd)
}

#[cfg(not(windows))]
pub fn is_foreground<R: Runtime>(window: &Window<R>) -> bool {
  window.is_focused().unwrap_or(false)
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
  if let Some(window) = main_window(app) {
    let _ = window.hide();
    // Nothing is on screen once the window is in the tray, so every Portal app
    // drops its caches at once rather than waiting out the idle delay. This is
    // where the Portal spends most of its time.
    crate::portal::set_all_memory_saving(app, true);
  }
}
