//! Settings → Install & update → Check for updates.
//!
//! `tauri-plugin-updater` reads `latest.json` from the newest GitHub release
//! (the endpoint and public key live in tauri.conf.json), checks the
//! installer's minisign signature against that key, and runs the NSIS setup in
//! passive mode. `npm run build:release` signs the installer and writes the
//! `latest.json` to attach to the release (scripts/updater-manifest.mjs).
//!
//! The webview gets no updater permission of its own: these two commands are
//! the whole surface, and the install command only installs the update the
//! check found, so nothing from the page picks what gets run.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATE_EVENT: &str = "installer://update";
/// One progress event per chunk this size, as for installer downloads.
const PROGRESS_STEP: u64 = 1024 * 1024;

/// The update the last check found, kept so install runs exactly that one.
#[derive(Default)]
pub struct UpdaterState {
  pending: Mutex<Option<Update>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  version: String,
  current_version: String,
  notes: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateEvent {
  received: u64,
  total: u64,
  /// True once the download is verified and the installer is about to start.
  installing: bool,
}

/// Asks the release endpoint for a newer version. Null when up to date.
#[tauri::command]
pub async fn update_check(app: AppHandle, state: State<'_, UpdaterState>) -> Result<Option<UpdateInfo>, String> {
  // The plugin's own exit hook only tidies windows and the tray. The sidecar,
  // shells and agents are child processes the installer would find holding
  // files open, so they go first, the same as on a normal quit. The hook
  // travels with the `Update`, so it is set here, where the update is found.
  let update = app
    .updater_builder()
    .on_before_exit({
      let app = app.clone();
      move || {
        crate::stop_children(&app);
        app.cleanup_before_exit();
      }
    })
    .build()
    .map_err(|e| e.to_string())?
    .check()
    .await
    .map_err(|err| format!("Could not check for updates: {err}"))?;
  let info = update.as_ref().map(|update| UpdateInfo {
    version: update.version.clone(),
    current_version: update.current_version.clone(),
    notes: update.body.clone().filter(|body| !body.trim().is_empty()),
  });
  *state.pending.lock().unwrap_or_else(|e| e.into_inner()) = update;
  Ok(info)
}

/// Downloads and verifies the update found by `update_check`, then starts the
/// installer. On Windows the app exits as the installer starts, so a success
/// never returns; progress arrives as `installer://update`.
#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, UpdaterState>) -> Result<(), String> {
  let update = state
    .pending
    .lock()
    .unwrap_or_else(|e| e.into_inner())
    .clone()
    .ok_or("No update is waiting. Check for updates first.")?;

  let mut received: u64 = 0;
  let mut announced: u64 = 0;
  let bytes = update
    .download(
      |chunk, total| {
        received += chunk as u64;
        if received - announced < PROGRESS_STEP {
          return;
        }
        announced = received;
        let _ = app.emit(UPDATE_EVENT, UpdateEvent { received, total: total.unwrap_or(0), installing: false });
      },
      || {},
    )
    .await
    .map_err(|err| format!("Could not download the update: {err}"))?;
  let _ = app.emit(UPDATE_EVENT, UpdateEvent { received, total: received, installing: true });

  state.pending.lock().unwrap_or_else(|e| e.into_inner()).take();
  update.install(bytes).map_err(|err| format!("Could not start the installer: {err}"))?;
  Ok(())
}
