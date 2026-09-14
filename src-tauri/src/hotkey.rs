//! Global hotkeys that work from any app.
//!
//! Two actions, each with its own combo:
//! - [`HotkeyAction::Toggle`] shows and focuses the window, or hides it when
//!   it already has focus.
//! - [`HotkeyAction::Palette`] shows the window and focuses the command
//!   palette's search bar.
//!
//! The combos live in `settings.json` in the app config dir (next to
//! `.env.local`), so they are registered in Rust at startup, before the webview
//! has loaded or anyone has signed in. A registration failure never aborts
//! startup: it is kept in [`HotkeyState`] and the webview reads it on mount to
//! show a toast.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Event the webview listens for to focus the `CommandPalette` search bar.
const OPEN_PALETTE_EVENT: &str = "palette://open";

/// No shortcut registered for an action.
const NO_ID: u32 = 0;

/// Shortcut ids by action, read by the press handler. Atomics rather than
/// [`HotkeyState`] because the handler runs on the main thread, where the
/// commands below (un)register while holding that lock.
static TOGGLE_ID: AtomicU32 = AtomicU32::new(NO_ID);
static PALETTE_ID: AtomicU32 = AtomicU32::new(NO_ID);

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HotkeyAction {
  Toggle,
  Palette,
}

impl HotkeyAction {
  const ALL: [HotkeyAction; 2] = [HotkeyAction::Toggle, HotkeyAction::Palette];

  fn default_accelerator(self) -> &'static str {
    match self {
      HotkeyAction::Toggle => "Alt+Space",
      HotkeyAction::Palette => "Alt+Shift+Space",
    }
  }

  /// Key in `settings.json` (see settings.rs). `globalShortcut` predates the
  /// palette hotkey, so a combo saved before the split keeps working.
  fn settings_key(self) -> &'static str {
    match self {
      HotkeyAction::Toggle => "globalShortcut",
      HotkeyAction::Palette => "paletteShortcut",
    }
  }

  fn label(self) -> &'static str {
    match self {
      HotkeyAction::Toggle => "show or hide Crystal OS",
      HotkeyAction::Palette => "open the search bar",
    }
  }

  fn id_slot(self) -> &'static AtomicU32 {
    match self {
      HotkeyAction::Toggle => &TOGGLE_ID,
      HotkeyAction::Palette => &PALETTE_ID,
    }
  }
}

/// What the webview needs to render one setting and report failures.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
  accelerator: String,
  registered: bool,
  error: Option<String>,
}

impl HotkeyStatus {
  fn unregistered(action: HotkeyAction) -> Self {
    Self { accelerator: action.default_accelerator().into(), registered: false, error: None }
  }
}

#[derive(Clone, Serialize)]
pub struct HotkeyStatuses {
  toggle: HotkeyStatus,
  palette: HotkeyStatus,
}

impl HotkeyStatuses {
  fn get_mut(&mut self, action: HotkeyAction) -> &mut HotkeyStatus {
    match action {
      HotkeyAction::Toggle => &mut self.toggle,
      HotkeyAction::Palette => &mut self.palette,
    }
  }
}

pub struct HotkeyState(Mutex<HotkeyStatuses>);

impl Default for HotkeyState {
  fn default() -> Self {
    Self(Mutex::new(HotkeyStatuses {
      toggle: HotkeyStatus::unregistered(HotkeyAction::Toggle),
      palette: HotkeyStatus::unregistered(HotkeyAction::Palette),
    }))
  }
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

fn register<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction, accelerator: &str) -> Result<(), String> {
  let shortcut: Shortcut = accelerator
    .parse()
    .map_err(|e| format!("\"{accelerator}\" is not a valid shortcut: {e}"))?;
  app.global_shortcut().register(shortcut).map_err(|e| describe(accelerator, e))?;
  action.id_slot().store(shortcut.id(), Ordering::SeqCst);
  Ok(())
}

fn unregister<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction, accelerator: &str) -> Result<(), String> {
  action.id_slot().store(NO_ID, Ordering::SeqCst);
  app.global_shortcut().unregister(accelerator).map_err(|e| e.to_string())
}

/// Show + focus the main window, or hide it if it already has focus.
fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
  let Some(window) = crate::window::main_window(app) else { return };

  if crate::window::is_shown(&window) && window.is_focused().unwrap_or(false) {
    crate::window::hide(app);
  } else {
    crate::window::show(app);
  }
}

fn open_palette<R: Runtime>(app: &AppHandle<R>) {
  crate::window::show(app);
  let _ = app.emit(OPEN_PALETTE_EVENT, ());
}

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri_plugin_global_shortcut::Builder::new()
    .with_handler(|app, shortcut, event| {
      if event.state() != ShortcutState::Pressed {
        return;
      }
      let id = shortcut.id();
      if id == TOGGLE_ID.load(Ordering::SeqCst) {
        toggle_main_window(app);
      } else if id == PALETTE_ID.load(Ordering::SeqCst) {
        open_palette(app);
      }
    })
    .build()
}

/// Register the saved combos (or the defaults) at startup. Never fails.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
  let state = app.state::<HotkeyState>();
  let mut statuses = state.0.lock().unwrap();

  for action in HotkeyAction::ALL {
    let accelerator = crate::settings::get_string(app, action.settings_key())
      .unwrap_or_else(|| action.default_accelerator().to_string());

    let result = register(app, action, &accelerator);
    if let Err(err) = &result {
      log::warn!("[hotkey] {err}");
    }

    *statuses.get_mut(action) = HotkeyStatus {
      registered: result.is_ok(),
      error: result.err(),
      accelerator,
    };
  }
}

#[tauri::command]
pub async fn get_global_shortcut<R: Runtime>(app: AppHandle<R>) -> HotkeyStatuses {
  app.state::<HotkeyState>().0.lock().unwrap().clone()
}

/// Swap one action's combo. The new one is only saved once it registers; on
/// failure the previous combo is restored and the error is returned for a
/// toast.
#[tauri::command]
pub async fn set_global_shortcut<R: Runtime>(
  app: AppHandle<R>,
  action: HotkeyAction,
  accelerator: String,
) -> Result<HotkeyStatuses, String> {
  let state = app.state::<HotkeyState>();
  let mut statuses = state.0.lock().unwrap();

  for other in HotkeyAction::ALL {
    if other != action && statuses.get_mut(other).accelerator.eq_ignore_ascii_case(&accelerator) {
      return Err(format!("{accelerator} is already used to {}", other.label()));
    }
  }

  let status = statuses.get_mut(action);
  let previous = status.accelerator.clone();

  if status.registered {
    if previous.eq_ignore_ascii_case(&accelerator) {
      return Ok(statuses.clone());
    }
    let _ = unregister(&app, action, &previous);
  }

  if let Err(err) = register(&app, action, &accelerator) {
    status.registered = register(&app, action, &previous).is_ok();
    return Err(err);
  }

  if let Err(err) = crate::settings::set(&app, action.settings_key(), accelerator.clone().into()) {
    // Registered but not saved: keep the old combo so the next launch agrees
    // with what is active now.
    let _ = unregister(&app, action, &accelerator);
    status.registered = register(&app, action, &previous).is_ok();
    return Err(format!("Could not save the shortcut: {err}"));
  }

  *status = HotkeyStatus { accelerator, registered: true, error: None };
  Ok(statuses.clone())
}

/// Release every combo while the settings dialog records a new one; otherwise
/// pressing a current combo would hide the window instead of being captured.
#[tauri::command]
pub async fn pause_global_shortcut<R: Runtime>(app: AppHandle<R>, paused: bool) -> Result<(), String> {
  let state = app.state::<HotkeyState>();
  let mut statuses = state.0.lock().unwrap();
  let mut first_error: Option<String> = None;

  for action in HotkeyAction::ALL {
    let status = statuses.get_mut(action);
    let accelerator = status.accelerator.clone();

    if paused {
      if status.registered {
        match unregister(&app, action, &accelerator) {
          Ok(()) => status.registered = false,
          Err(err) => {
            first_error.get_or_insert(err);
          }
        }
      }
    } else if !status.registered {
      let result = register(&app, action, &accelerator);
      status.registered = result.is_ok();
      status.error = result.err();
      if let (None, Some(err)) = (&first_error, &status.error) {
        first_error = Some(err.clone());
      }
    }
  }

  first_error.map_or(Ok(()), Err)
}
