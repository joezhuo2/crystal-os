use tauri::{Manager, RunEvent, WindowEvent};

mod autostart;
mod hotkey;
mod portal;
mod settings;
mod terminal;
mod tray;
mod vault;
mod window;

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
    // Must be registered first. Opening the app while it already runs (for
    // example hidden in the tray after login) shows the existing window
    // instead of starting a second process that cannot claim the hotkey.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      window::show(app);
    }))
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
    )
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(hotkey::plugin())
    .plugin(autostart::plugin())
    // Closing the window hides it to the tray so the hotkey stays live. Tray
    // Quit calls app.exit, which does not go through CloseRequested.
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .manage(Sidecar::default())
    .manage(hotkey::HotkeyState::default())
    .manage(vault::VaultState::default())
    .manage(terminal::TerminalState::default())
    .manage(portal::PortalState::default())
    .invoke_handler(tauri::generate_handler![
      hotkey::get_global_shortcut,
      hotkey::set_global_shortcut,
      hotkey::pause_global_shortcut,
      autostart::get_launch_at_login,
      autostart::set_launch_at_login,
      tray::update_tray_pomodoro,
      vault::get_vault_status,
      vault::pick_vault,
      vault::list_vault,
      vault::read_vault_file,
      vault::write_vault_file,
      vault::watch_vault,
      terminal::terminal_list,
      terminal::terminal_open,
      terminal::terminal_attach,
      terminal::terminal_restart,
      terminal::terminal_close,
      terminal::terminal_write,
      terminal::terminal_resize,
      portal::portal_show,
      portal::portal_hide,
      portal::portal_fade_out,
      portal::portal_nav,
      portal::portal_open_external,
      portal::portal_sign_out,
      portal::portal_remove,
      portal::portal_prune,
    ])
    .setup(|_app| {
      hotkey::init(_app.handle());
      vault::init(_app.handle());
      autostart::init(_app.handle());

      // The window starts hidden (tauri.conf.json). The login entry keeps it
      // in the tray; any other launch shows it.
      if !std::env::args().any(|arg| arg == autostart::HIDDEN_ARG) {
        window::show(_app.handle());
      }

      // Not fatal: the window and hotkey still work without a tray.
      if let Err(err) = tray::init(_app.handle()) {
        log::error!("[tray] failed to create: {err}");
      }

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
      terminal::shutdown(app);
      if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
        let _ = child.kill();
      }
    }
  });
}
