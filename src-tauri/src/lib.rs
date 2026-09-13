use tauri::{Manager, RunEvent};

/// Handle to the `crystal-api` sidecar, kept so it can be killed on exit.
/// Only populated in release builds; `dev:desktop` uses the Vite server's
/// middleware instead.
#[derive(Default)]
struct Sidecar(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// Launch the Node sidecar that serves `/api/obsidian` and `/api/calendar` for
/// the packaged app (see server/sidecar.ts). It reads `.env.local` from the
/// app config dir, e.g. `%APPDATA%\com.crystalos.desktop\.env.local`.
#[cfg(not(debug_assertions))]
fn spawn_sidecar(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  use tauri_plugin_shell::{process::CommandEvent, ShellExt};

  let config_dir = app.path().app_config_dir()?;
  std::fs::create_dir_all(&config_dir)?;

  let (mut rx, child) = app
    .shell()
    .sidecar("crystal-api")?
    .env("CRYSTAL_CONFIG_DIR", &config_dir)
    .spawn()?;

  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => log::info!("{}", String::from_utf8_lossy(&line).trim_end()),
        CommandEvent::Stderr(line) => log::warn!("{}", String::from_utf8_lossy(&line).trim_end()),
        CommandEvent::Terminated(status) => log::error!("[crystal-api] exited: {:?}", status.code),
        _ => {}
      }
    }
  });

  *app.state::<Sidecar>().0.lock().unwrap() = Some(child);
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
    )
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .manage(Sidecar::default())
    .setup(|_app| {
      #[cfg(not(debug_assertions))]
      if let Err(err) = spawn_sidecar(_app) {
        // Not fatal: Supabase-backed views still work; Archive and Calendar
        // surface the connection error themselves.
        log::error!("[crystal-api] failed to start: {err}");
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app, event| {
    if let RunEvent::Exit = event {
      if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
        let _ = child.kill();
      }
    }
  });
}
