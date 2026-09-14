fn main() {
  // Declaring the app's commands makes each one a permission, so the webview
  // can only call what capabilities/default.json grants.
  let commands = tauri_build::AppManifest::new().commands(&[
    "get_global_shortcut",
    "set_global_shortcut",
    "pause_global_shortcut",
    "get_launch_at_login",
    "set_launch_at_login",
    "update_tray_pomodoro",
    "get_vault_status",
    "pick_vault",
    "list_vault",
    "read_vault_file",
    "write_vault_file",
    "watch_vault",
    "terminal_attach",
    "terminal_restart",
    "terminal_write",
    "terminal_resize",
  ]);
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(commands))
    .expect("failed to run tauri-build");
}
