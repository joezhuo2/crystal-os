//! Native Obsidian vault access for the desktop app.
//!
//! The webview gets no filesystem plugin and no fs permissions. Every vault
//! read and write goes through the commands below, which only ever touch `.md`
//! files under the root the user picked with the native folder dialog. That
//! root is persisted as `vaultPath` in `settings.json` (see settings.rs).
//!
//! Parsing, search, and quick-add formatting stay in TypeScript
//! (src/lib/vaultCore.ts) so the web and desktop builds share one
//! implementation; this module is deliberately just bytes, paths, and events.

use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{self, Read as _, Write as _};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

/// Emitted with a [`VaultChange`] when notes change on disk.
pub const CHANGED_EVENT: &str = "vault://changed";

/// Key in `settings.json`.
const SETTINGS_KEY: &str = "vaultPath";

/// Folders that are never notes. Anything starting with `.` (`.obsidian`,
/// `.trash`, `.git`) is skipped as well.
const IGNORED_DIRS: [&str; 1] = ["node_modules"];

/// Refuse to ship absurd files over IPC; a real note is nowhere near this.
const MAX_NOTE_BYTES: u64 = 10 * 1024 * 1024;

/// Obsidian writes a note several times per save; collapse those into one event.
const DEBOUNCE: Duration = Duration::from_millis(250);

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/// Stable codes the webview branches on (src/lib/vaultNative.ts).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
  /// No vault folder has been picked yet.
  NotConfigured,
  /// The saved folder no longer exists (unplugged drive, renamed, deleted).
  Missing,
  PermissionDenied,
  /// The note does not exist, e.g. it was deleted while open.
  NotFound,
  InvalidPath,
  /// The note changed on disk between read and write.
  Conflict,
  Io,
}

#[derive(Clone, Debug, Serialize)]
pub struct VaultError {
  code: ErrorCode,
  message: String,
}

impl VaultError {
  fn new(code: ErrorCode, message: impl Into<String>) -> Self {
    Self { code, message: message.into() }
  }

  fn from_io(err: &io::Error, subject: &str) -> Self {
    match err.kind() {
      io::ErrorKind::NotFound => Self::new(ErrorCode::NotFound, format!("Note not found: {subject}")),
      io::ErrorKind::PermissionDenied => {
        Self::new(ErrorCode::PermissionDenied, format!("Permission denied: {subject}"))
      }
      _ => Self::new(ErrorCode::Io, format!("{subject}: {err}")),
    }
  }
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

fn is_ignored(name: &str) -> bool {
  name.starts_with('.') || IGNORED_DIRS.contains(&name)
}

fn is_note(name: &str) -> bool {
  name.len() > 3 && name.is_char_boundary(name.len() - 3) && name[name.len() - 3..].eq_ignore_ascii_case(".md")
}

/// Normalise a caller-supplied vault-relative path to `Folder/Note.md`.
/// Mirrors `normalizeNotePath` in src/lib/vaultCore.ts, but stricter: `..`
/// is refused outright rather than resolved, since nothing legitimate sends it.
pub fn normalize_relative(raw: &str) -> Result<String, VaultError> {
  let invalid = |msg: String| VaultError::new(ErrorCode::InvalidPath, msg);

  let rel = raw.trim().replace('\\', "/");
  if rel.is_empty() {
    return Err(invalid("path must be a non-empty string".into()));
  }
  // ':' covers drive letters (C:) and NTFS alternate data streams (a.md:x).
  if rel.starts_with('/') || rel.contains(':') {
    return Err(invalid("path must be relative to the vault root".into()));
  }
  if rel.chars().any(|c| c.is_control() || matches!(c, '<' | '>' | '"' | '|' | '?' | '*')) {
    return Err(invalid(format!("path contains characters that are not allowed: {rel}")));
  }

  let mut parts = Vec::new();
  for part in rel.split('/') {
    match part {
      "" | "." => {}
      ".." => return Err(invalid("path escapes the vault root".into())),
      p if is_ignored(p) => return Err(invalid(format!("path is inside an ignored folder: {rel}"))),
      p => parts.push(p),
    }
  }
  if parts.is_empty() {
    return Err(invalid("path must be a non-empty string".into()));
  }

  let mut rel = parts.join("/");
  if !is_note(&rel) {
    rel.push_str(".md");
  }
  Ok(rel)
}

/// Vault-relative, forward-slashed form of `abs`, if it is inside `root`.
fn relative(root: &Path, abs: &Path) -> Option<String> {
  let rest = abs.strip_prefix(root).ok()?;
  let parts: Option<Vec<&str>> = rest.iter().map(|c| c.to_str()).collect();
  let parts = parts?;
  (!parts.is_empty()).then(|| parts.join("/"))
}

/// Refuse paths that leave the vault through a symlink or junction. The
/// deepest ancestor that exists is canonicalised and must sit under `root`,
/// which is itself canonical (see [`check_root`]).
fn ensure_inside(root: &Path, abs: &Path) -> Result<(), VaultError> {
  let escapes = || VaultError::new(ErrorCode::InvalidPath, "path escapes the vault root");
  let mut probe = Some(abs);
  while let Some(path) = probe {
    match fs::canonicalize(path) {
      Ok(real) => return if real.starts_with(root) { Ok(()) } else { Err(escapes()) },
      Err(err) if err.kind() == io::ErrorKind::NotFound => probe = path.parent(),
      Err(err) => return Err(VaultError::from_io(&err, &path.display().to_string())),
    }
  }
  Err(escapes())
}

/// The absolute path and normalised relative path for a caller-supplied path.
/// Every file access goes through this.
fn resolve(root: &Path, raw: &str) -> Result<(PathBuf, String), VaultError> {
  let rel = normalize_relative(raw)?;
  // Join segment by segment: verbatim `\\?\` roots do not accept '/'.
  let abs = rel.split('/').fold(root.to_path_buf(), |path, part| path.join(part));
  ensure_inside(root, &abs)?;
  Ok((abs, rel))
}

/// Validate a vault folder and return its canonical form.
fn check_root(root: &Path) -> Result<PathBuf, VaultError> {
  let shown = root.display();
  let unavailable = |err: io::Error| match err.kind() {
    io::ErrorKind::NotFound => {
      VaultError::new(ErrorCode::Missing, format!("Vault folder not found: {shown}"))
    }
    io::ErrorKind::PermissionDenied => VaultError::new(
      ErrorCode::PermissionDenied,
      format!("Permission denied reading the vault folder: {shown}"),
    ),
    _ => VaultError::new(ErrorCode::Io, format!("Vault folder unavailable ({shown}): {err}")),
  };

  let canonical = fs::canonicalize(root).map_err(unavailable)?;
  if !canonical.is_dir() {
    return Err(VaultError::new(ErrorCode::Missing, format!("Vault path is not a folder: {shown}")));
  }
  fs::read_dir(&canonical).map_err(unavailable)?;
  Ok(canonical)
}

fn mtime_ms(meta: &fs::Metadata) -> f64 {
  meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_nanos() as f64 / 1_000_000.0)
    .unwrap_or(0.0)
}

/* ------------------------------------------------------------------ *
 * File operations (pure functions of a canonical root, for testing)
 * ------------------------------------------------------------------ */

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
  path: String,
  mtime: f64,
  size: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
  path: String,
  content: String,
  mtime: f64,
  size: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
  path: String,
  mtime: f64,
  size: u64,
  created: bool,
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<VaultEntry>) {
  // Unreadable subfolders are skipped rather than failing the whole listing.
  let Ok(entries) = fs::read_dir(dir) else { return };
  for entry in entries.flatten() {
    let name = entry.file_name();
    let Some(name) = name.to_str() else { continue };
    if is_ignored(name) {
      continue;
    }
    // file_type() does not follow symlinks, so links never lead outside.
    let Ok(kind) = entry.file_type() else { continue };
    if kind.is_dir() {
      walk(root, &entry.path(), out);
    } else if kind.is_file() && is_note(name) {
      let path = entry.path();
      if let (Ok(meta), Some(rel)) = (entry.metadata(), relative(root, &path)) {
        out.push(VaultEntry { path: rel, mtime: mtime_ms(&meta), size: meta.len() });
      }
    }
  }
}

pub fn list_notes(root: &Path) -> Result<Vec<VaultEntry>, VaultError> {
  fs::read_dir(root).map_err(|err| VaultError::from_io(&err, &root.display().to_string()))?;
  let mut out = Vec::new();
  walk(root, root, &mut out);
  out.sort_by(|a, b| a.path.cmp(&b.path));
  Ok(out)
}

pub fn read_note(root: &Path, raw: &str) -> Result<VaultFile, VaultError> {
  let (abs, rel) = resolve(root, raw)?;
  let fail = |err: io::Error| VaultError::from_io(&err, &rel);

  let mut file = File::open(&abs).map_err(fail)?;
  let meta = file.metadata().map_err(fail)?;
  if !meta.is_file() {
    return Err(VaultError::new(ErrorCode::NotFound, format!("Note not found: {rel}")));
  }
  if meta.len() > MAX_NOTE_BYTES {
    return Err(VaultError::new(ErrorCode::Io, format!("Note is too large to open: {rel}")));
  }

  let mut bytes = Vec::with_capacity(meta.len() as usize);
  file.read_to_end(&mut bytes).map_err(fail)?;
  Ok(VaultFile {
    content: String::from_utf8_lossy(&bytes).into_owned(),
    mtime: mtime_ms(&meta),
    size: meta.len(),
    path: rel,
  })
}

/// Write a note, creating parent folders. With `expected_mtime`, the write is
/// refused if the file changed since it was read, so a quick-add never
/// clobbers an edit Obsidian saved in between.
pub fn write_note(
  root: &Path,
  raw: &str,
  content: &str,
  expected_mtime: Option<f64>,
) -> Result<WriteResult, VaultError> {
  let (abs, rel) = resolve(root, raw)?;
  let fail = |err: io::Error| VaultError::from_io(&err, &rel);

  let existing = match fs::metadata(&abs) {
    Ok(meta) if meta.is_file() => Some(meta),
    Ok(_) => return Err(VaultError::new(ErrorCode::InvalidPath, format!("Not a file: {rel}"))),
    Err(err) if err.kind() == io::ErrorKind::NotFound => None,
    Err(err) => return Err(fail(err)),
  };

  if let Some(expected) = expected_mtime {
    if existing.as_ref().map(mtime_ms) != Some(expected) {
      return Err(VaultError::new(
        ErrorCode::Conflict,
        format!("{rel} changed on disk. Try again."),
      ));
    }
  }

  if let Some(parent) = abs.parent() {
    fs::create_dir_all(parent).map_err(fail)?;
  }

  // Write beside the note, then swap it in, so a crash never leaves a
  // half-written note. The dot prefix keeps the temp file out of listings
  // and watcher events.
  let name = abs.file_name().and_then(|n| n.to_str()).unwrap_or("note.md");
  let tmp = abs.with_file_name(format!(".{name}.crystal-tmp"));
  let staged = File::create(&tmp).and_then(|mut f| {
    f.write_all(content.as_bytes())?;
    f.sync_all()
  });
  if let Err(err) = staged {
    let _ = fs::remove_file(&tmp);
    return Err(fail(err));
  }
  if fs::rename(&tmp, &abs).is_err() {
    // Windows refuses the swap while another app holds the note open without
    // delete sharing; fall back to writing in place.
    let _ = fs::remove_file(&tmp);
    fs::write(&abs, content).map_err(fail)?;
  }

  let meta = fs::metadata(&abs).map_err(fail)?;
  Ok(WriteResult { mtime: mtime_ms(&meta), size: meta.len(), created: existing.is_none(), path: rel })
}

/// Vault-relative path worth telling the webview about: a note, or an
/// extension-less path that is probably a folder being renamed or removed.
fn changed_path(root: &Path, abs: &Path) -> Option<String> {
  let rel = relative(root, abs)?;
  if rel.split('/').any(is_ignored) {
    return None;
  }
  (is_note(&rel) || abs.extension().is_none()).then_some(rel)
}

/* ------------------------------------------------------------------ *
 * App state and watcher
 * ------------------------------------------------------------------ */

#[derive(Default)]
pub struct VaultState {
  /// The folder as picked, used for display and settings.
  picked: Mutex<Option<PathBuf>>,
  watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
  /// Set from the watcher thread when it can no longer be trusted (the root
  /// vanished or the backend errored); the next command replaces it.
  stale: AtomicBool,
}

/// Mirrors `VaultStatus` in src/lib/vaultNative.ts.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
  path: Option<String>,
  available: bool,
  watching: bool,
  error: Option<VaultError>,
}

/// Payload of [`CHANGED_EVENT`].
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultChange {
  paths: Vec<String>,
  root_missing: bool,
}

fn start_watcher<R: Runtime>(
  app: &AppHandle<R>,
  root: &Path,
) -> Result<Debouncer<RecommendedWatcher>, String> {
  let handle = app.clone();
  let watched = root.to_path_buf();

  let mut debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| {
    let state = handle.state::<VaultState>();
    let events = match result {
      Ok(events) => events,
      Err(err) => {
        log::warn!("[vault] watcher error: {err:?}");
        state.stale.store(true, Ordering::SeqCst);
        Vec::new()
      }
    };

    let paths: BTreeSet<String> =
      events.iter().filter_map(|event| changed_path(&watched, &event.path)).collect();
    let root_missing = !watched.is_dir();
    if root_missing {
      state.stale.store(true, Ordering::SeqCst);
    }

    if !paths.is_empty() || root_missing {
      let change = VaultChange { paths: paths.into_iter().collect(), root_missing };
      let _ = handle.emit(CHANGED_EVENT, change);
    }
  })
  .map_err(|e| e.to_string())?;

  debouncer.watcher().watch(root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
  Ok(debouncer)
}

/// Start the watcher if none is running or the running one went stale. A
/// failure is logged, not returned: reads still work without live updates.
fn ensure_watching<R: Runtime>(app: &AppHandle<R>, root: &Path) {
  let state = app.state::<VaultState>();
  let mut watcher = state.watcher.lock().unwrap();
  if watcher.is_some() && !state.stale.swap(false, Ordering::SeqCst) {
    return;
  }
  *watcher = None;
  state.stale.store(false, Ordering::SeqCst);
  match start_watcher(app, root) {
    Ok(debouncer) => *watcher = Some(debouncer),
    Err(err) => log::warn!("[vault] could not watch {}: {err}", root.display()),
  }
}

/// The canonical vault root, or why there is none. Also revives the watcher,
/// so a vault folder that comes back (a drive plugged in again) goes live.
fn active_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, VaultError> {
  let picked = app.state::<VaultState>().picked.lock().unwrap().clone();
  let picked = picked.ok_or_else(|| {
    VaultError::new(ErrorCode::NotConfigured, "Choose your Obsidian vault folder to open the Archive")
  })?;
  let root = check_root(&picked)?;
  ensure_watching(app, &root);
  Ok(root)
}

fn status<R: Runtime>(app: &AppHandle<R>) -> VaultStatus {
  let result = active_root(app);
  let state = app.state::<VaultState>();
  let path = state.picked.lock().unwrap().as_ref().map(|p| p.display().to_string());
  let watching = state.watcher.lock().unwrap().is_some() && !state.stale.load(Ordering::SeqCst);
  VaultStatus { path, available: result.is_ok(), watching: result.is_ok() && watching, error: result.err() }
}

/// Run blocking filesystem work off the async runtime's worker threads.
async fn blocking<T, F>(work: F) -> Result<T, VaultError>
where
  T: Send + 'static,
  F: FnOnce() -> Result<T, VaultError> + Send + 'static,
{
  tauri::async_runtime::spawn_blocking(work)
    .await
    .map_err(|err| VaultError::new(ErrorCode::Io, err.to_string()))?
}

/// Load the saved vault at startup. Never fails: a missing folder is reported
/// to the webview through [`get_vault_status`] instead.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
  let Some(saved) = crate::settings::get_string(app, SETTINGS_KEY) else { return };
  *app.state::<VaultState>().picked.lock().unwrap() = Some(PathBuf::from(&saved));
  if let Err(err) = active_root(app) {
    log::warn!("[vault] {}", err.message);
  }
}

#[tauri::command]
pub async fn get_vault_status<R: Runtime>(app: AppHandle<R>) -> VaultStatus {
  status(&app)
}

/// Show the native folder picker and switch to the chosen vault. Resolves to
/// `None` when the dialog is cancelled.
#[tauri::command]
pub async fn pick_vault<R: Runtime>(
  app: AppHandle<R>,
  // Window, not WebviewWindow: the latter fails to extract once the Portal tab
  // has added child webviews to the main window.
  window: Window<R>,
) -> Result<Option<VaultStatus>, VaultError> {
  use tauri_plugin_dialog::DialogExt;

  let current = app.state::<VaultState>().picked.lock().unwrap().clone();
  let dialog = app.clone();
  let picked = blocking(move || {
    let mut builder = dialog.dialog().file().set_title("Choose your Obsidian vault").set_parent(&window);
    if let Some(dir) = current.filter(|dir| dir.is_dir()) {
      builder = builder.set_directory(dir);
    }
    Ok(builder.blocking_pick_folder())
  })
  .await?;

  let Some(picked) = picked else { return Ok(None) };
  let picked = picked
    .into_path()
    .map_err(|err| VaultError::new(ErrorCode::InvalidPath, err.to_string()))?;
  check_root(&picked)?;

  crate::settings::set(&app, SETTINGS_KEY, picked.display().to_string().into())
    .map_err(|err| VaultError::new(ErrorCode::Io, format!("Could not save the vault folder: {err}")))?;

  let state = app.state::<VaultState>();
  *state.picked.lock().unwrap() = Some(picked);
  state.stale.store(true, Ordering::SeqCst);
  Ok(Some(status(&app)))
}

/// Every note in the vault with its mtime and size, sorted by path.
#[tauri::command]
pub async fn list_vault<R: Runtime>(app: AppHandle<R>) -> Result<Vec<VaultEntry>, VaultError> {
  let root = active_root(&app)?;
  blocking(move || list_notes(&root)).await
}

#[tauri::command]
pub async fn read_vault_file<R: Runtime>(app: AppHandle<R>, path: String) -> Result<VaultFile, VaultError> {
  let root = active_root(&app)?;
  blocking(move || read_note(&root, &path)).await
}

#[tauri::command]
pub async fn write_vault_file<R: Runtime>(
  app: AppHandle<R>,
  path: String,
  content: String,
  expected_mtime: Option<f64>,
) -> Result<WriteResult, VaultError> {
  let root = active_root(&app)?;
  blocking(move || write_note(&root, &path, &content, expected_mtime)).await
}

/// Restart the file watcher, e.g. after the webview notices events stopped.
#[tauri::command]
pub async fn watch_vault<R: Runtime>(app: AppHandle<R>) -> Result<VaultStatus, VaultError> {
  app.state::<VaultState>().stale.store(true, Ordering::SeqCst);
  active_root(&app)?;
  Ok(status(&app))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn vault() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    (dir, root)
  }

  #[test]
  fn normalizes_relative_paths() {
    assert_eq!(normalize_relative("Inbox").unwrap(), "Inbox.md");
    assert_eq!(normalize_relative("./Projects\\Plan.MD").unwrap(), "Projects/Plan.MD");
    assert_eq!(normalize_relative(" a//b.md ").unwrap(), "a/b.md");
  }

  #[test]
  fn rejects_paths_outside_the_vault() {
    for bad in [
      "", "  ", "/etc/passwd", "C:/Windows/x.md", "../x.md", "a/../../x.md", "a.md:stream",
      ".obsidian/app.md", "node_modules/x.md", "a?.md",
    ] {
      let err = normalize_relative(bad).unwrap_err();
      assert_eq!(err.code, ErrorCode::InvalidPath, "{bad}");
    }
  }

  #[test]
  fn lists_only_visible_notes() {
    let (_dir, root) = vault();
    fs::create_dir_all(root.join("Projects")).unwrap();
    fs::create_dir_all(root.join(".obsidian")).unwrap();
    fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
    fs::write(root.join("Inbox.md"), "hi").unwrap();
    fs::write(root.join("Projects/Plan.md"), "plan").unwrap();
    fs::write(root.join("Projects/image.png"), "png").unwrap();
    fs::write(root.join(".obsidian/workspace.md"), "x").unwrap();
    fs::write(root.join("node_modules/pkg/README.md"), "x").unwrap();
    fs::write(root.join(".hidden.md"), "x").unwrap();

    let paths: Vec<String> = list_notes(&root).unwrap().into_iter().map(|e| e.path).collect();
    assert_eq!(paths, vec!["Inbox.md", "Projects/Plan.md"]);
  }

  #[test]
  fn reads_and_writes_notes() {
    let (_dir, root) = vault();

    let created = write_note(&root, "Daily/2026-09-13", "# Today\n", None).unwrap();
    assert!(created.created);
    assert_eq!(created.path, "Daily/2026-09-13.md");

    let read = read_note(&root, "Daily/2026-09-13.md").unwrap();
    assert_eq!(read.content, "# Today\n");
    assert_eq!(read.mtime, created.mtime);

    let updated =
      write_note(&root, "Daily/2026-09-13.md", "# Today\n- more\n", Some(read.mtime)).unwrap();
    assert!(!updated.created);
    assert_eq!(read_note(&root, "Daily/2026-09-13.md").unwrap().content, "# Today\n- more\n");
    assert!(!root.join("Daily/.2026-09-13.md.crystal-tmp").exists());
  }

  #[test]
  fn refuses_stale_writes() {
    let (_dir, root) = vault();
    write_note(&root, "Inbox.md", "one", None).unwrap();
    let err = write_note(&root, "Inbox.md", "two", Some(1.0)).unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);
    let err = write_note(&root, "New.md", "two", Some(1.0)).unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);
  }

  #[test]
  fn reports_deleted_notes_as_not_found() {
    let (_dir, root) = vault();
    write_note(&root, "Gone.md", "bye", None).unwrap();
    fs::remove_file(root.join("Gone.md")).unwrap();
    assert_eq!(read_note(&root, "Gone.md").unwrap_err().code, ErrorCode::NotFound);
  }

  #[test]
  fn reports_missing_vault_root() {
    let (dir, root) = vault();
    drop(dir);
    assert_eq!(check_root(&root).unwrap_err().code, ErrorCode::Missing);
  }

  #[test]
  fn refuses_symlinks_out_of_the_vault() {
    let (_dir, root) = vault();
    let (_outside_dir, outside) = vault();
    fs::write(outside.join("secret.md"), "secret").unwrap();

    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(&outside, root.join("link"));
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_dir(&outside, root.join("link"));
    // Creating symlinks needs Developer Mode or admin on Windows.
    if linked.is_err() {
      return;
    }

    assert_eq!(read_note(&root, "link/secret.md").unwrap_err().code, ErrorCode::InvalidPath);
    assert_eq!(write_note(&root, "link/new.md", "x", None).unwrap_err().code, ErrorCode::InvalidPath);
    assert!(list_notes(&root).unwrap().is_empty());
  }

  #[test]
  fn filters_watcher_paths() {
    let root = Path::new("/vault");
    assert_eq!(changed_path(root, Path::new("/vault/a/b.md")), Some("a/b.md".into()));
    assert_eq!(changed_path(root, Path::new("/vault/Projects")), Some("Projects".into()));
    assert_eq!(changed_path(root, Path::new("/vault/img.png")), None);
    assert_eq!(changed_path(root, Path::new("/vault/.obsidian/workspace.json")), None);
    assert_eq!(changed_path(root, Path::new("/vault/.Inbox.md.crystal-tmp")), None);
    assert_eq!(changed_path(root, Path::new("/vault")), None);
  }
}
