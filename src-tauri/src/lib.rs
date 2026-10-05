use tauri::{Manager, RunEvent, WindowEvent};

mod autostart;
mod diagnostics;
mod harness;
mod hotkey;
mod installer;
mod portal;
mod settings;
mod sidecar;
mod terminal;
mod tray;
mod updater;
mod vault;
mod window;

/// Stops the processes the app spawned: shells, agents and the sidecar. Runs
/// on exit, and before an update's installer starts (src-tauri/src/updater.rs)
/// so none of them holds a file the installer replaces.
pub(crate) fn stop_children(app: &tauri::AppHandle) {
  terminal::shutdown(app);
  harness::shutdown(app);
  sidecar::stop(app);
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
    // Desktop toasts for task due times, calendar reminders, Pomodoro phase
    // changes and Portal unread counts, scheduled by the webview
    // (src/lib/notifications.ts).
    .plugin(tauri_plugin_notification::init())
    .plugin(hotkey::plugin())
    .plugin(autostart::plugin())
    .plugin(tauri_plugin_updater::Builder::new().build())
    // Closing the window hides it to the tray so the hotkey stays live. Tray
    // Quit calls app.exit, which does not go through CloseRequested.
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        // Same path as the tray and hotkey, so caches are trimmed and the page
        // hears it went hidden.
        if window.label() == "main" {
          window::hide(window.app_handle());
        } else {
          let _ = window.hide();
        }
      }
    })
    .manage(sidecar::SidecarState::default())
    .manage(hotkey::HotkeyState::default())
    .manage(vault::VaultState::default())
    .manage(terminal::TerminalState::default())
    .manage(portal::PortalState::default())
    .manage(harness::HarnessState::default())
    .manage(installer::InstallerState::default())
    .manage(updater::UpdaterState::default())
    .manage(diagnostics::DiagnosticsState::default())
    .invoke_handler(tauri::generate_handler![
      hotkey::get_global_shortcut,
      hotkey::set_global_shortcut,
      hotkey::pause_global_shortcut,
      autostart::get_launch_at_login,
      autostart::set_launch_at_login,
      diagnostics::diagnostics_append,
      diagnostics::diagnostics_read,
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
      portal::portal_snapshot,
      portal::portal_fade_out,
      portal::portal_nav,
      portal::portal_open_external,
      portal::portal_sign_out,
      portal::portal_remove,
      portal::portal_rebuild,
      portal::portal_unload,
      portal::portal_prune,
      harness::harness_env_status,
      harness::harness_install_runtime,
      harness::harness_get_config,
      harness::harness_set_config,
      harness::harness_set_key,
      harness::harness_discover,
      harness::harness_probe,
      harness::harness_dsh_start,
      harness::harness_acp_open_session,
      harness::harness_claude_start,
      harness::harness_send,
      harness::harness_kill,
      harness::harness_reset,
      harness::harness_pick_folder,
      harness::harness_create_project,
      harness::harness_state_load,
      harness::harness_state_save,
      harness::harness_chat_load,
      harness::harness_chat_save,
      harness::harness_chat_delete,
      installer::installer_status,
      installer::installer_releases,
      installer::installer_download,
      installer::installer_pick_source,
      installer::installer_build,
      installer::installer_cancel_build,
      installer::installer_reveal,
      updater::update_check,
      updater::update_install,
      sidecar::sidecar_ensure,
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

      // The crystal-api sidecar is not started here: the webview starts it on
      // its first /api/* request (sidecar.rs).
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app, event| {
    if let RunEvent::Exit = event {
      stop_children(app);
    }
  });
}
