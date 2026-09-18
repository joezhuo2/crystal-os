//! Settings → Install & update.
//!
//! Three jobs, all of which have to happen in Rust:
//!
//! - **List releases.** `api.github.com` is not in the webview's `connect-src`,
//!   and widening the CSP for one panel is worse than one command here.
//! - **Download an installer.** The webview cannot write to the Downloads
//!   folder, and a long transfer wants progress the panel can render.
//! - **Build one from source.** Runs the repo's own `build:desktop` script, so
//!   this only works on a machine that has the checkout and its toolchain. The
//!   packaged app has neither, which is why the panel asks for the folder.
//!
//! Only one download and one build may run at a time; both report through
//! events rather than a long-running return value, so the panel survives a
//! tab change.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State, Window};

use crate::harness::job::kill_tree;

/// Where releases are published. The download command accepts nothing else, so
/// a tampered release list cannot point the app at another host.
const OWNER_REPO: &str = "joezhuo2/crystal-os";
const RELEASES_URL: &str = "https://api.github.com/repos/joezhuo2/crystal-os/releases?per_page=30";
/// GitHub rejects requests without one.
const USER_AGENT: &str = "crystal-os-desktop";

const LIST_TIMEOUT: Duration = Duration::from_secs(15);
/// A release installer is ~100 MB, so the ceiling is generous but not absent.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const MAX_ASSET_BYTES: u64 = 512 * 1024 * 1024;
/// One progress event per chunk this size, so a 100 MB download emits ~100.
const PROGRESS_STEP: u64 = 1024 * 1024;

const DOWNLOAD_EVENT: &str = "installer://download";
const BUILD_EVENT: &str = "installer://build";

/// Settings key holding the source checkout the user pointed at.
const SOURCE_KEY: &str = "installerSourceDir";

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

#[derive(Default)]
pub struct InstallerState {
  downloading: AtomicBool,
  /// Pid of the running `npm run build:desktop`, kept so it can be cancelled.
  /// Cleared by the cancel command, which is also how the build thread knows
  /// it was stopped rather than having failed on its own.
  build: Mutex<Option<u32>>,
}

impl InstallerState {
  fn build_running(&self) -> bool {
    self.build.lock().unwrap_or_else(|e| e.into_inner()).is_some()
  }
}

/* ------------------------------------------------------------------ *
 * Releases
 * ------------------------------------------------------------------ */

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Release {
  /// Git tag, and the id the download command takes.
  tag: String,
  /// Tag without a leading `v`, for comparing against the running build.
  version: String,
  name: String,
  published_at: Option<String>,
  prerelease: bool,
  notes: Option<String>,
  /// Absent when the release has no Windows installer attached.
  asset: Option<Asset>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
  name: String,
  size: u64,
  url: String,
}

fn agent(timeout: Duration) -> ureq::Agent {
  ureq::Agent::config_builder().timeout_global(Some(timeout)).build().into()
}

/// `.exe` first: the NSIS setup is the one to hand a person. An `.msi` is the
/// fallback for releases built before NSIS was a target.
fn pick_asset(assets: &[Value]) -> Option<Asset> {
  fn read(asset: &Value) -> Option<Asset> {
    let name = asset.get("name")?.as_str()?.to_string();
    let url = asset.get("browser_download_url")?.as_str()?.to_string();
    // GitHub serves release assets from these two hosts and redirects between
    // them. Anything else in the JSON is not a release asset.
    if !url.starts_with("https://github.com/") && !url.starts_with("https://objects.githubusercontent.com/") {
      return None;
    }
    let size = asset.get("size").and_then(Value::as_u64).unwrap_or(0);
    Some(Asset { name, size, url })
  }
  let by_ext = |ext: &str| assets.iter().filter_map(read).find(|asset| asset.name.to_ascii_lowercase().ends_with(ext));
  by_ext(".exe").or_else(|| by_ext(".msi"))
}

fn read_release(value: &Value) -> Option<Release> {
  if value.get("draft").and_then(Value::as_bool).unwrap_or(false) {
    return None;
  }
  let tag = value.get("tag_name")?.as_str()?.to_string();
  let version = tag.trim_start_matches(['v', 'V']).to_string();
  let name = value
    .get("name")
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|n| !n.is_empty())
    .unwrap_or(&tag)
    .to_string();
  let assets = value.get("assets").and_then(Value::as_array).cloned().unwrap_or_default();
  Some(Release {
    tag,
    version,
    name,
    published_at: value.get("published_at").and_then(Value::as_str).map(str::to_string),
    prerelease: value.get("prerelease").and_then(Value::as_bool).unwrap_or(false),
    // Release notes can run to thousands of lines; the panel shows an excerpt.
    notes: value
      .get("body")
      .and_then(Value::as_str)
      .map(str::trim)
      .filter(|body| !body.is_empty())
      .map(|body| body.chars().take(4000).collect()),
    asset: pick_asset(&assets),
  })
}

/// Published releases, newest first as GitHub returns them.
#[tauri::command]
pub async fn installer_releases() -> Result<Vec<Release>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    let mut response = agent(LIST_TIMEOUT)
      .get(RELEASES_URL)
      .header("User-Agent", USER_AGENT)
      .header("Accept", "application/vnd.github+json")
      .call()
      .map_err(|err| format!("Could not reach GitHub: {err}"))?;
    let body = response.body_mut().read_to_string().map_err(|e| e.to_string())?;
    let list: Vec<Value> = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(list.iter().filter_map(read_release).collect())
  })
  .await
  .map_err(|e| e.to_string())?
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadEvent {
  tag: String,
  received: u64,
  total: u64,
  done: bool,
  path: Option<String>,
  error: Option<String>,
}

/// Keeps the saved name to what GitHub published, minus any path it implies.
fn safe_file_name(name: &str) -> String {
  let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
  let cleaned: String = base
    .chars()
    .map(|c| if c.is_control() || matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
    .collect();
  let trimmed = cleaned.trim().trim_matches('.').trim().to_string();
  if trimmed.is_empty() {
    "crystal-os-setup.exe".to_string()
  } else {
    trimmed
  }
}

/// `name.exe`, `name (2).exe`, … so a second download never overwrites the
/// first — the one already on disk may be the installer the user is running.
fn free_path(dir: &Path, name: &str) -> PathBuf {
  let path = dir.join(name);
  if !path.exists() {
    return path;
  }
  let (stem, ext) = match name.rsplit_once('.') {
    Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
    None => (name.to_string(), String::new()),
  };
  for n in 2..1000 {
    let candidate = dir.join(format!("{stem} ({n}){ext}"));
    if !candidate.exists() {
      return candidate;
    }
  }
  dir.join(format!("{stem} ({}){ext}", uuid::Uuid::new_v4()))
}

/// Downloads the installer for `tag` into the Downloads folder and returns its
/// path. Progress arrives as `installer://download` while it runs.
#[tauri::command]
pub async fn installer_download(app: AppHandle, state: State<'_, InstallerState>, tag: String) -> Result<String, String> {
  if state.downloading.swap(true, Ordering::SeqCst) {
    return Err("A download is already running.".to_string());
  }
  let result = download_inner(&app, tag.clone()).await;
  app.state::<InstallerState>().downloading.store(false, Ordering::SeqCst);

  // The panel listens for the terminal event rather than only the return
  // value, so a view remounted mid-download still sees the outcome.
  let event = match &result {
    Ok(path) => DownloadEvent { tag, received: 0, total: 0, done: true, path: Some(path.clone()), error: None },
    Err(error) => DownloadEvent { tag, received: 0, total: 0, done: true, path: None, error: Some(error.clone()) },
  };
  let _ = app.emit(DOWNLOAD_EVENT, event);
  result
}

async fn download_inner(app: &AppHandle, tag: String) -> Result<String, String> {
  let releases = installer_releases().await?;
  let release = releases.into_iter().find(|r| r.tag == tag).ok_or("That release is no longer published.")?;
  let asset = release.asset.ok_or("That release has no Windows installer attached.")?;
  let dir = app.path().download_dir().map_err(|_| "The Downloads folder is unavailable.".to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

  let app = app.clone();
  tauri::async_runtime::spawn_blocking(move || {
    let mut response = agent(DOWNLOAD_TIMEOUT)
      .get(&asset.url)
      .header("User-Agent", USER_AGENT)
      .call()
      .map_err(|err| format!("Could not download the installer: {err}"))?;
    let total = response
      .headers()
      .get("content-length")
      .and_then(|v| v.to_str().ok())
      .and_then(|v| v.parse::<u64>().ok())
      .unwrap_or(asset.size);
    if total > MAX_ASSET_BYTES {
      return Err("That asset is larger than 512 MB; download it from GitHub instead.".to_string());
    }

    // Written under a temporary name and renamed at the end, so a failed
    // transfer never leaves a half installer that still looks runnable.
    let path = free_path(&dir, &safe_file_name(&asset.name));
    let partial = path.with_extension("crdownload");
    let mut file = std::fs::File::create(&partial).map_err(|e| e.to_string())?;
    let mut reader = response.body_mut().as_reader();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut received: u64 = 0;
    let mut announced: u64 = 0;

    loop {
      let read = match reader.read(&mut buffer) {
        Ok(0) => break,
        Ok(n) => n,
        Err(err) => {
          let _ = std::fs::remove_file(&partial);
          return Err(format!("The download stopped: {err}"));
        }
      };
      received += read as u64;
      if received > MAX_ASSET_BYTES {
        let _ = std::fs::remove_file(&partial);
        return Err("The download grew past 512 MB and was stopped.".to_string());
      }
      if let Err(err) = file.write_all(&buffer[..read]) {
        let _ = std::fs::remove_file(&partial);
        return Err(format!("Could not write the installer: {err}"));
      }
      if received - announced >= PROGRESS_STEP {
        announced = received;
        let _ = app.emit(DOWNLOAD_EVENT, DownloadEvent { tag: tag.clone(), received, total, done: false, path: None, error: None });
      }
    }

    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&partial, &path).map_err(|err| format!("Could not finish the download: {err}"))?;
    Ok(path.display().to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

/* ------------------------------------------------------------------ *
 * Source checkout
 * ------------------------------------------------------------------ */

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Status {
  /// The running build, from Cargo at compile time.
  current_version: String,
  repo: String,
  /// The checkout builds run in, or null when none is set.
  source_dir: Option<String>,
  /// False when `source_dir` is set but no longer a Crystal OS checkout.
  source_ok: bool,
  building: bool,
  downloading: bool,
}

/// A folder is a checkout when it has the manifest with the build script and
/// the Tauri config that script drives.
fn is_checkout(dir: &Path) -> bool {
  let manifest = dir.join("package.json");
  if !dir.join("src-tauri").join("tauri.conf.json").is_file() || !manifest.is_file() {
    return false;
  }
  std::fs::read_to_string(&manifest)
    .ok()
    .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    .and_then(|json| json.get("scripts").and_then(|scripts| scripts.get("build:desktop")).cloned())
    .is_some()
}

/// The folder the user chose, falling back to the checkout this binary was
/// compiled in. That fallback only resolves under `dev:desktop`; in a packaged
/// app the path is gone, and the panel asks for one.
fn source_dir(app: &AppHandle) -> Option<PathBuf> {
  if let Some(saved) = crate::settings::get_string(app, SOURCE_KEY).map(PathBuf::from) {
    return Some(saved);
  }
  let compiled = Path::new(env!("CARGO_MANIFEST_DIR")).parent()?.to_path_buf();
  is_checkout(&compiled).then_some(compiled)
}

#[tauri::command]
pub fn installer_status(app: AppHandle, state: State<'_, InstallerState>) -> Status {
  let dir = source_dir(&app);
  let source_ok = dir.as_deref().is_some_and(is_checkout);
  Status {
    current_version: env!("CARGO_PKG_VERSION").to_string(),
    repo: OWNER_REPO.to_string(),
    source_dir: dir.map(|dir| dir.display().to_string()),
    source_ok,
    building: state.build_running(),
    downloading: state.downloading.load(Ordering::SeqCst),
  }
}

/// Folder picker for the checkout builds run in.
#[tauri::command]
pub async fn installer_pick_source(app: AppHandle, window: Window) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  let picked = tauri::async_runtime::spawn_blocking({
    let app = app.clone();
    move || app.dialog().file().set_title("Choose the Crystal OS source folder").set_parent(&window).blocking_pick_folder()
  })
  .await
  .map_err(|e| e.to_string())?;

  let Some(picked) = picked else { return Ok(None) };
  let path = picked.into_path().map_err(|e| e.to_string())?;
  if !is_checkout(&path) {
    return Err("That folder is not a Crystal OS checkout: it has no package.json with a build:desktop script.".to_string());
  }
  crate::settings::set(&app, SOURCE_KEY, Value::String(path.display().to_string()))?;
  Ok(Some(path.display().to_string()))
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BuildEvent {
  line: Option<String>,
  done: bool,
  path: Option<String>,
  error: Option<String>,
}

fn emit_line(app: &AppHandle, line: String) {
  let _ = app.emit(BUILD_EVENT, BuildEvent { line: Some(line), done: false, path: None, error: None });
}

/// The newest installer under the bundle folder. `build:desktop` prunes old
/// bundles first, but a prune that failed would otherwise let a stale
/// installer be reported as the one just built.
fn newest_installer(root: &Path) -> Option<PathBuf> {
  let bundle = root.join("src-tauri").join("target").join("release").join("bundle");
  let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
  for sub in ["nsis", "msi"] {
    let Ok(entries) = std::fs::read_dir(bundle.join(sub)) else { continue };
    for entry in entries.flatten() {
      let path = entry.path();
      let ext = path.extension().and_then(|ext| ext.to_str()).unwrap_or_default().to_ascii_lowercase();
      if ext != "exe" && ext != "msi" {
        continue;
      }
      let Ok(modified) = entry.metadata().and_then(|meta| meta.modified()) else { continue };
      // `Option::is_none_or` would read better but is newer than the crate's
      // MSRV (1.77.2).
      let newer = match &best {
        Some((best_time, _)) => modified > *best_time,
        None => true,
      };
      if newer {
        best = Some((modified, path));
      }
    }
  }
  best.map(|(_, path)| path)
}

/// Runs the checkout's `build:desktop` and reports the installer it produced.
/// Output arrives line by line as `installer://build`.
#[tauri::command]
pub async fn installer_build(app: AppHandle, state: State<'_, InstallerState>) -> Result<String, String> {
  if state.build_running() {
    return Err("A build is already running.".to_string());
  }
  let root = source_dir(&app)
    .filter(|dir| is_checkout(dir))
    .ok_or("No Crystal OS source folder is set. Choose the checkout to build from — a packaged app has no source to build.")?;

  let result = build_inner(&app, root).await;
  app.state::<InstallerState>().build.lock().unwrap_or_else(|e| e.into_inner()).take();

  let event = match &result {
    Ok(path) => BuildEvent { line: None, done: true, path: Some(path.clone()), error: None },
    Err(error) => BuildEvent { line: None, done: true, path: None, error: Some(error.clone()) },
  };
  let _ = app.emit(BUILD_EVENT, event);
  result
}

async fn build_inner(app: &AppHandle, root: PathBuf) -> Result<String, String> {
  let env = crate::terminal::fresh_env();
  let npm = crate::harness::which(&env, "npm").ok_or("npm was not found on PATH. Install Node.js and try again.")?;

  let app = app.clone();
  tauri::async_runtime::spawn_blocking(move || {
    emit_line(&app, format!("> npm run build:desktop   ({})", root.display()));

    let mut command = Command::new(&npm);
    command
      .args(["run", "build:desktop"])
      .current_dir(&root)
      .env_clear()
      .envs(env.iter().map(|(key, value)| (key, value)))
      // The panel renders the log as plain text, so colour codes would only
      // arrive as escape noise.
      .env("NO_COLOR", "1")
      .env("FORCE_COLOR", "0")
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      const CREATE_NO_WINDOW: u32 = 0x0800_0000;
      command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child: Child = command.spawn().map_err(|err| format!("Could not start npm: {err}"))?;
    *app.state::<InstallerState>().build.lock().unwrap_or_else(|e| e.into_inner()) = Some(child.id());

    // Both pipes are drained on their own threads: a release build fills
    // either one long before it exits, and a full pipe would stall it.
    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
      let app = app.clone();
      readers.push(std::thread::spawn(move || pump(&app, stdout)));
    }
    if let Some(stderr) = child.stderr.take() {
      let app = app.clone();
      readers.push(std::thread::spawn(move || pump(&app, stderr)));
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    for reader in readers {
      let _ = reader.join();
    }

    // Cancel clears the pid, so an empty slot here means the exit code below
    // is the one the kill produced rather than a real failure.
    if app.state::<InstallerState>().build.lock().unwrap_or_else(|e| e.into_inner()).is_none() {
      return Err("The build was stopped.".to_string());
    }
    if !status.success() {
      return Err(format!("The build failed (exit code {}). The log above has the reason.", status.code().unwrap_or(-1)));
    }
    newest_installer(&root)
      .map(|path| path.display().to_string())
      .ok_or_else(|| "The build finished but no installer was found under src-tauri/target/release/bundle.".to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

fn pump(app: &AppHandle, stream: impl Read) {
  let mut reader = BufReader::new(stream);
  let mut line = String::new();
  loop {
    line.clear();
    match reader.read_line(&mut line) {
      Ok(0) | Err(_) => break,
      Ok(_) => {
        let text = line.trim_end_matches(['\r', '\n']);
        if !text.trim().is_empty() {
          emit_line(app, text.to_string());
        }
      }
    }
  }
}

/// Stops a running build. `npm` spawns vite, cargo and NSIS below it, so the
/// whole tree goes, not just the direct child.
#[tauri::command]
pub fn installer_cancel_build(state: State<'_, InstallerState>) -> Result<(), String> {
  let pid = state.build.lock().unwrap_or_else(|e| e.into_inner()).take();
  match pid {
    Some(pid) => {
      kill_tree(pid);
      Ok(())
    }
    None => Err("No build is running.".to_string()),
  }
}

/// Opens the folder holding `path` with the file selected. Confined to the
/// folders this module writes to, so the webview cannot use it to browse the
/// disk.
#[tauri::command]
pub fn installer_reveal(app: AppHandle, path: String) -> Result<(), String> {
  let file = PathBuf::from(&path);
  if !file.is_file() {
    return Err("That file is no longer there.".to_string());
  }
  let roots = [
    app.path().download_dir().ok(),
    source_dir(&app).map(|dir| dir.join("src-tauri").join("target")),
  ];
  if !roots.into_iter().flatten().any(|root| file.starts_with(root)) {
    return Err("That file is outside the download and build folders.".to_string());
  }

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // explorer.exe exits non-zero even when it opens the window, so only the
    // spawn is checked.
    Command::new("explorer.exe")
      .arg(format!("/select,{}", file.display()))
      .creation_flags(CREATE_NO_WINDOW)
      .spawn()
      .map_err(|err| format!("Could not open File Explorer: {err}"))?;
    Ok(())
  }
  #[cfg(not(windows))]
  {
    let dir = file.parent().ok_or("That file has no folder.")?;
    Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn safe_file_name_strips_paths_and_separators() {
    assert_eq!(safe_file_name("Crystal OS_0.6.6_x64-setup.exe"), "Crystal OS_0.6.6_x64-setup.exe");
    assert_eq!(safe_file_name("../../evil.exe"), "evil.exe");
    assert_eq!(safe_file_name("a\\b\\c.msi"), "c.msi");
    assert_eq!(safe_file_name("bad:name?.exe"), "bad_name_.exe");
    assert_eq!(safe_file_name("   "), "crystal-os-setup.exe");
    assert_eq!(safe_file_name("..."), "crystal-os-setup.exe");
  }

  #[test]
  fn free_path_never_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let first = free_path(dir.path(), "setup.exe");
    assert_eq!(first, dir.path().join("setup.exe"));
    std::fs::write(&first, b"x").unwrap();
    assert_eq!(free_path(dir.path(), "setup.exe"), dir.path().join("setup (2).exe"));
  }

  #[test]
  fn pick_asset_prefers_the_exe() {
    let assets = serde_json::json!([
      { "name": "app.msi", "size": 2, "browser_download_url": "https://github.com/o/r/releases/download/v1/app.msi" },
      { "name": "app-setup.exe", "size": 1, "browser_download_url": "https://github.com/o/r/releases/download/v1/app-setup.exe" },
    ]);
    assert_eq!(pick_asset(assets.as_array().unwrap()).unwrap().name, "app-setup.exe");
  }

  #[test]
  fn pick_asset_rejects_assets_hosted_elsewhere() {
    let assets = serde_json::json!([
      { "name": "app-setup.exe", "size": 1, "browser_download_url": "https://elsewhere.example/app-setup.exe" },
    ]);
    assert!(pick_asset(assets.as_array().unwrap()).is_none());
  }

  #[test]
  fn read_release_skips_drafts_and_trims_the_tag() {
    assert!(read_release(&serde_json::json!({ "tag_name": "v9", "draft": true })).is_none());
    let release = read_release(&serde_json::json!({ "tag_name": "v0.6.6", "name": "", "assets": [] })).unwrap();
    assert_eq!(release.version, "0.6.6");
    assert_eq!(release.name, "v0.6.6");
    assert!(release.asset.is_none());
  }

  #[test]
  fn is_checkout_wants_the_build_script_and_tauri_config() {
    let dir = tempfile::tempdir().unwrap();
    assert!(!is_checkout(dir.path()));
    std::fs::create_dir_all(dir.path().join("src-tauri")).unwrap();
    std::fs::write(dir.path().join("src-tauri").join("tauri.conf.json"), "{}").unwrap();
    std::fs::write(dir.path().join("package.json"), r#"{"scripts":{"build":"vite build"}}"#).unwrap();
    assert!(!is_checkout(dir.path()));
    std::fs::write(dir.path().join("package.json"), r#"{"scripts":{"build:desktop":"tauri build"}}"#).unwrap();
    assert!(is_checkout(dir.path()));
  }
}
