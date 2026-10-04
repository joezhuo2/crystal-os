//! The `crystal-api` sidecar: a Node executable that serves `/api/obsidian`
//! and `/api/calendar` for the packaged app (see server/sidecar.ts).
//!
//! It used to start with the app. On desktop the vault is read natively
//! (vault.rs), so the sidecar only serves the calendar, and many sessions never
//! touch it. The webview now starts it on its first `/api/*` request through
//! [`sidecar_ensure`] (src/lib/sidecarNative.ts), which returns once it
//! accepts connections. `dev:desktop` uses the Vite server's middleware, so
//! there the command does nothing.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::CommandChild;

/// Port server/sidecar.ts listens on; SIDECAR_ORIGIN in src/lib/platform.ts.
#[cfg(not(debug_assertions))]
const PORT: u16 = 8787;

/// How long a fresh sidecar gets to start listening before the request fails.
#[cfg(not(debug_assertions))]
const START_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

/// The running sidecar, kept so it can be killed on exit. Cleared when the
/// process ends, so the next request starts a new one.
#[derive(Default)]
pub struct SidecarState(Mutex<Option<CommandChild>>);

/// Starts the sidecar unless it is already running. Reads `.env.local` from
/// the app config dir, e.g. `%APPDATA%\com.crystalos.desktop\.env.local`.
#[cfg(not(debug_assertions))]
fn spawn_if_stopped<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
  use tauri_plugin_shell::{process::CommandEvent, ShellExt};

  let state = app.state::<SidecarState>();
  let mut slot = state.0.lock().unwrap();
  if slot.is_some() {
    return Ok(());
  }

  let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

  let (mut rx, child) = app
    .shell()
    .sidecar("crystal-api")
    .map_err(|e| e.to_string())?
    .env("CRYSTAL_CONFIG_DIR", &config_dir)
    .spawn()
    .map_err(|e| e.to_string())?;
  let pid = child.pid();
  log::info!("[crystal-api] started (pid {pid})");

  let handle = app.clone();
  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => log::info!("{}", String::from_utf8_lossy(&line).trim_end()),
        CommandEvent::Stderr(line) => log::warn!("{}", String::from_utf8_lossy(&line).trim_end()),
        CommandEvent::Terminated(status) => {
          log::error!("[crystal-api] exited: {:?}", status.code);
          let state = handle.state::<SidecarState>();
          let mut slot = state.0.lock().unwrap();
          if slot.as_ref().is_some_and(|c| c.pid() == pid) {
            *slot = None;
          }
        }
        _ => {}
      }
    }
  });

  *slot = Some(child);
  Ok(())
}

/// Waits until the sidecar's port accepts a connection.
#[cfg(not(debug_assertions))]
async fn wait_until_listening() -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(|| {
    use std::net::{Ipv4Addr, SocketAddr, TcpStream};
    use std::time::{Duration, Instant};

    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, PORT));
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
      if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
        return Ok(());
      }
      if Instant::now() >= deadline {
        return Err("The local API (crystal-api) did not start in time. See the app log for details.".to_string());
      }
      std::thread::sleep(Duration::from_millis(50));
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Starts the sidecar if needed and resolves once it is listening. Cheap when
/// it already runs: one connection to the loopback port.
#[tauri::command]
pub async fn sidecar_ensure<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
  #[cfg(debug_assertions)]
  {
    let _ = app;
    Ok(())
  }
  #[cfg(not(debug_assertions))]
  {
    spawn_if_stopped(&app)?;
    wait_until_listening().await
  }
}

/// Kills the sidecar, if it was started. Called from `stop_children` in lib.rs.
pub fn stop<R: Runtime>(app: &AppHandle<R>) {
  if let Some(child) = app.state::<SidecarState>().0.lock().unwrap().take() {
    let _ = child.kill();
  }
}
