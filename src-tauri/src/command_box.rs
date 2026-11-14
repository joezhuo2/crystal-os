//! The command box: a one-line window over whichever app is in front, opened
//! by its own global hotkey (src/components/CommandBox.tsx). It only collects
//! text; the main webview runs the command, so the main window stays hidden.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const LABEL: &str = "command";

/// Tells src/main.tsx to render the box instead of the app.
const MARKER: &str = "window.__CRYSTAL_COMMAND_BOX__ = true;";

/// Shows the box, or hides it when it is already up.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
  if let Some(window) = app.get_webview_window(LABEL) {
    if window.is_visible().unwrap_or(false) {
      let _ = window.hide();
    } else {
      let _ = window.center();
      let _ = window.show();
      let _ = window.set_focus();
    }
    return;
  }

  // Built off the main thread: creating a window inside an event handler
  // deadlocks on Windows.
  let app = app.clone();
  std::thread::spawn(move || {
    let built = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html".into()))
      .title("Crystal OS command")
      .initialization_script(MARKER)
      .inner_size(640.0, 84.0)
      .resizable(false)
      .decorations(false)
      .always_on_top(true)
      .skip_taskbar(true)
      .center()
      .focused(true)
      .build();
    match built {
      Ok(window) => {
        let handle = window.clone();
        window.on_window_event(move |event| {
          if let WindowEvent::Focused(false) = event {
            let _ = handle.hide();
          }
        });
      }
      Err(err) => log::warn!("[command] could not open the command box: {err}"),
    }
  });
}
