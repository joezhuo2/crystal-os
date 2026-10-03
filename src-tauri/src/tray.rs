//! System tray: Show/Hide, the Pomodoro timer, Quick Add, and Quit.
//!
//! The Pomodoro timer itself lives in the webview (`src/lib/pomodoro.ts`).
//! Clicking a Pomodoro item emits an event the webview applies to its store;
//! the webview then calls [`update_tray_pomodoro`] so the status row, the
//! Start/Pause label, and the tooltip follow the store. Rust never keeps its
//! own copy of the countdown.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::window;

const POMODORO_EVENT: &str = "tray://pomodoro";
const QUICK_ADD_EVENT: &str = "tray://quick-add";

const ID_SHOW_HIDE: &str = "show-hide";
const ID_POMODORO_TOGGLE: &str = "pomodoro-toggle";
const ID_POMODORO_RESET: &str = "pomodoro-reset";
const ID_QUICK_ADD: &str = "quick-add";
const ID_QUIT: &str = "quit";

/// macOS menu-bar icons are monochrome templates the system tints for light
/// and dark menu bars. Windows and Linux trays show the colour gem.
#[cfg(target_os = "macos")]
const ICON: &[u8] = include_bytes!("../icons/tray/tray-template.png");
#[cfg(not(target_os = "macos"))]
const ICON: &[u8] = include_bytes!("../icons/tray/tray-color.png");

/// Shown until the webview reports in. Matches a fresh store.
const IDLE_LABEL: &str = "Focus 25:00 (paused)";

/// Mirrors `TrayPomodoroView` in src/lib/tray.ts.
#[derive(Deserialize)]
pub struct PomodoroView {
  label: String,
  tooltip: String,
  running: bool,
}

/// Handles to the parts of the tray that change after startup.
pub struct TrayState<R: Runtime> {
  tray: TrayIcon<R>,
  status: MenuItem<R>,
  toggle: MenuItem<R>,
  /// Last reported state, so Start/Pause is only relabelled when it flips.
  running: AtomicBool,
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
  let show_hide = MenuItem::with_id(app, ID_SHOW_HIDE, "Show / Hide Crystal OS", true, None::<&str>)?;
  let status = MenuItem::with_id(app, "pomodoro-status", IDLE_LABEL, false, None::<&str>)?;
  let toggle = MenuItem::with_id(app, ID_POMODORO_TOGGLE, "Start", true, None::<&str>)?;
  let reset = MenuItem::with_id(app, ID_POMODORO_RESET, "Reset", true, None::<&str>)?;
  let quick_add = MenuItem::with_id(app, ID_QUICK_ADD, "Quick Add…", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, ID_QUIT, "Quit Crystal OS", true, None::<&str>)?;

  let menu = Menu::with_items(
    app,
    &[
      &show_hide,
      &PredefinedMenuItem::separator(app)?,
      &status,
      &toggle,
      &reset,
      &PredefinedMenuItem::separator(app)?,
      &quick_add,
      &PredefinedMenuItem::separator(app)?,
      &quit,
    ],
  )?;

  let tray = TrayIconBuilder::with_id("main")
    .icon(Image::from_bytes(ICON)?)
    .icon_as_template(cfg!(target_os = "macos"))
    .tooltip(format!("Crystal OS · {IDLE_LABEL}"))
    .menu(&menu)
    // Windows convention: left click toggles the window, right click opens
    // the menu. macOS menu-bar items open their menu on any click.
    .show_menu_on_left_click(cfg!(target_os = "macos"))
    .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        toggle_window(tray.app_handle());
      }
    })
    .build(app)?;

  app.manage(TrayState { tray, status, toggle, running: AtomicBool::new(false) });
  Ok(())
}

/// Clicking the tray takes focus from the window, so this checks visibility,
/// not focus as the hotkey does.
fn toggle_window<R: Runtime>(app: &AppHandle<R>) {
  match window::main_window(app) {
    Some(w) if window::is_shown(&w) => window::hide(app),
    _ => window::show(app),
  }
}

fn handle_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
  match id {
    ID_SHOW_HIDE => toggle_window(app),
    ID_POMODORO_TOGGLE => {
      let _ = app.emit(POMODORO_EVENT, "toggle");
    }
    ID_POMODORO_RESET => {
      let _ = app.emit(POMODORO_EVENT, "reset");
    }
    ID_QUICK_ADD => {
      window::show(app);
      let _ = app.emit(QUICK_ADD_EVENT, ());
    }
    // RunEvent::Exit in lib.rs still kills the sidecar.
    ID_QUIT => app.exit(0),
    _ => {}
  }
}

/// Called by the webview whenever the Pomodoro store's visible state changes.
#[tauri::command]
pub async fn update_tray_pomodoro<R: Runtime>(app: AppHandle<R>, view: PomodoroView) -> Result<(), String> {
  let state = app.state::<TrayState<R>>();
  state.status.set_text(&view.label).map_err(|e| e.to_string())?;
  state.tray.set_tooltip(Some(&view.tooltip)).map_err(|e| e.to_string())?;
  if state.running.swap(view.running, Ordering::Relaxed) != view.running {
    let text = if view.running { "Pause" } else { "Start" };
    state.toggle.set_text(text).map_err(|e| e.to_string())?;
  }
  Ok(())
}
