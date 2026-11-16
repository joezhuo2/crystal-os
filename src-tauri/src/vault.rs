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
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
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

const MAX_BINARY_BYTES: u64 = 100 * 1024 * 1024;

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

fn has_suffix(name: &str, suffix: &str) -> bool {
  let n = suffix.len();
  name.len() > n && name.is_char_boundary(name.len() - n) && name[name.len() - n..].eq_ignore_ascii_case(suffix)
}

fn is_note(name: &str) -> bool {
  has_suffix(name, ".md")
}

fn is_pdf(name: &str) -> bool {
  has_suffix(name, ".pdf")
}

/// Normalise a caller-supplied vault-relative path to `Folder/Note.md`.
/// Mirrors `normalizeNotePath` in src/lib/vaultCore.ts, but stricter: `..`
/// is refused outright rather than resolved, since nothing legitimate sends it.
fn clean_relative(raw: &str) -> Result<String, VaultError> {
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

  Ok(parts.join("/"))
}

pub fn normalize_relative(raw: &str) -> Result<String, VaultError> {
  let mut rel = clean_relative(raw)?;
  if !is_note(&rel) {
    rel.push_str(".md");
  }
  Ok(rel)
}

/// Like [`normalize_relative`] but for PDFs: the extension is required, never added.
pub fn normalize_binary(raw: &str) -> Result<String, VaultError> {
  let rel = clean_relative(raw)?;
  if !is_pdf(&rel) && ![".png", ".jpg", ".jpeg"].iter().any(|ext| has_suffix(&rel, ext)) {
    return Err(VaultError::new(ErrorCode::InvalidPath, format!("only .pdf and image files are allowed: {rel}")));
  }
  Ok(rel)
}

/// A move endpoint: a note, a PDF, or an extension-less folder.
fn normalize_movable(raw: &str) -> Result<String, VaultError> {
  let rel = clean_relative(raw)?;
  let last = rel.rsplit('/').next().unwrap_or(&rel);
  if is_note(last) || is_pdf(last) || !last.contains('.') {
    Ok(rel)
  } else {
    Err(VaultError::new(ErrorCode::InvalidPath, format!("only notes, PDFs and folders can be moved: {rel}")))
  }
}

fn join_inside(root: &Path, rel: &str) -> Result<PathBuf, VaultError> {
  // Join segment by segment: verbatim `\\?\` roots do not accept '/'.
  let abs = rel.split('/').fold(root.to_path_buf(), |path, part| path.join(part));
  ensure_inside(root, &abs)?;
  Ok(abs)
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
  Ok((join_inside(root, &rel)?, rel))
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

/// Creation time in ms, or 0 where the file system does not record one.
fn ctime_ms(meta: &fs::Metadata) -> f64 {
  meta
    .created()
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
  ctime: f64,
  size: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
  path: String,
  content: String,
  mtime: f64,
  ctime: f64,
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
        out.push(VaultEntry { path: rel, mtime: mtime_ms(&meta), ctime: ctime_ms(&meta), size: meta.len() });
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
    ctime: ctime_ms(&meta),
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

pub fn read_binary(root: &Path, raw: &str) -> Result<Vec<u8>, VaultError> {
  let rel = normalize_binary(raw)?;
  let abs = join_inside(root, &rel)?;
  let fail = |err: io::Error| VaultError::from_io(&err, &rel);

  let meta = fs::metadata(&abs).map_err(fail)?;
  if !meta.is_file() {
    return Err(VaultError::new(ErrorCode::NotFound, format!("File not found: {rel}")));
  }
  if meta.len() > MAX_BINARY_BYTES {
    return Err(VaultError::new(ErrorCode::Io, format!("File is too large to open: {rel}")));
  }
  fs::read(&abs).map_err(fail)
}

pub fn write_binary(root: &Path, raw: &str, bytes: &[u8], overwrite: bool) -> Result<WriteResult, VaultError> {
  let rel = normalize_binary(raw)?;
  let abs = join_inside(root, &rel)?;
  let fail = |err: io::Error| VaultError::from_io(&err, &rel);

  if bytes.len() as u64 > MAX_BINARY_BYTES {
    return Err(VaultError::new(ErrorCode::Io, format!("File is too large to save: {rel}")));
  }
  if let Some(parent) = abs.parent() {
    fs::create_dir_all(parent).map_err(fail)?;
  }

  let conflict = || VaultError::new(ErrorCode::Conflict, format!("{rel} already exists"));
  let created = fs::symlink_metadata(&abs).is_err();
  if !created && !overwrite {
    return Err(conflict());
  }

  let name = abs.file_name().and_then(|n| n.to_str()).unwrap_or("file.pdf");
  let tmp = abs.with_file_name(format!(".{name}.crystal-tmp"));
  // A stale tmp entry may be a symlink; remove the entry itself, then refuse to open through one.
  let _ = fs::remove_file(&tmp);
  let staged = fs::OpenOptions::new()
    .write(true)
    .create_new(true)
    .open(&tmp)
    .and_then(|mut f| f.write_all(bytes).and_then(|_| f.sync_all()));
  // Rename replaces a symlink entry instead of following it out of the vault.
  let swapped = staged.and_then(|_| fs::rename(&tmp, &abs));
  if let Err(err) = swapped {
    let _ = fs::remove_file(&tmp);
    return Err(fail(err));
  }

  let meta = fs::metadata(&abs).map_err(fail)?;
  Ok(WriteResult { mtime: mtime_ms(&meta), size: meta.len(), created, path: rel })
}

#[derive(Clone, Debug, Serialize)]
pub struct MoveResult {
  path: String,
}

fn path_ext(rel: &str) -> Option<String> {
  rel.rsplit('/').next().and_then(|n| n.rsplit_once('.')).map(|(_, e)| e.to_ascii_lowercase())
}

const TRASH: &str = ".trash";

/// Move a note, PDF or folder into `<root>/.trash`, picking a free name.
pub fn trash_path(root: &Path, raw: &str) -> Result<MoveResult, VaultError> {
  let rel = normalize_movable(raw)?;
  let from_abs = join_inside(root, &rel)?;
  let fail = |err: io::Error| VaultError::from_io(&err, &rel);
  if fs::symlink_metadata(&from_abs).is_err() {
    return Err(VaultError::new(ErrorCode::NotFound, format!("Not found: {rel}")));
  }
  if path_ext(&rel).is_none() && !from_abs.is_dir() {
    return Err(VaultError::new(ErrorCode::InvalidPath, format!("only notes, PDFs and folders can be moved: {rel}")));
  }

  let trash_abs = join_inside(root, TRASH)?;
  fs::create_dir_all(&trash_abs).map_err(fail)?;
  // The trash folder itself may be a symlink out of the vault.
  ensure_inside(root, &trash_abs)?;

  let name = rel.rsplit('/').next().unwrap_or(&rel);
  let (stem, ext) = match name.rsplit_once('.') {
    Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
    _ => (name, String::new()),
  };
  let mut candidate = name.to_string();
  let mut n = 1;
  while fs::symlink_metadata(trash_abs.join(&candidate)).is_ok() {
    n += 1;
    candidate = format!("{stem} {n}{ext}");
  }
  fs::rename(&from_abs, trash_abs.join(&candidate)).map_err(fail)?;
  Ok(MoveResult { path: format!("{TRASH}/{candidate}") })
}

/// Move one entry from `.trash` back to `to`. Never overwrites.
pub fn restore_path(root: &Path, trash_rel: &str, to: &str) -> Result<MoveResult, VaultError> {
  let invalid = |msg: &str| VaultError::new(ErrorCode::InvalidPath, msg);
  let segment = trash_rel
    .strip_prefix(".trash/")
    .filter(|s| !s.is_empty() && !s.contains(['/', '\\']) && *s != "." && *s != "..")
    .ok_or_else(|| invalid("trash path must be a single entry under .trash"))?;
  if clean_relative(segment)? != segment {
    return Err(invalid("trash path must be a single entry under .trash"));
  }
  let to_rel = normalize_movable(to)?;
  let from_abs = join_inside(root, &format!("{TRASH}/{segment}"))?;
  let to_abs = join_inside(root, &to_rel)?;
  let fail = |err: io::Error| VaultError::from_io(&err, trash_rel);

  if path_ext(segment) != path_ext(&to_rel) {
    return Err(invalid("trash path and destination must be the same kind of path"));
  }
  if fs::symlink_metadata(&from_abs).is_err() {
    return Err(VaultError::new(ErrorCode::NotFound, format!("Not found: {trash_rel}")));
  }
  if fs::symlink_metadata(&to_abs).is_ok() {
    return Err(VaultError::new(ErrorCode::Conflict, format!("{to_rel} already exists")));
  }
  if let Some(parent) = to_abs.parent() {
    fs::create_dir_all(parent).map_err(fail)?;
  }
  fs::rename(&from_abs, &to_abs).map_err(fail)?;
  Ok(MoveResult { path: to_rel })
}

/// Rename a note, PDF or folder inside the vault. Never overwrites.
pub fn move_path(root: &Path, from: &str, to: &str) -> Result<MoveResult, VaultError> {
  let from_rel = normalize_movable(from)?;
  let to_rel = normalize_movable(to)?;
  let from_abs = join_inside(root, &from_rel)?;
  let to_abs = join_inside(root, &to_rel)?;
  let fail = |err: io::Error| VaultError::from_io(&err, &from_rel);

  let ext = path_ext;
  if ext(&from_rel) != ext(&to_rel) {
    return Err(VaultError::new(ErrorCode::InvalidPath, "from and to must be the same kind of path"));
  }
  if to_rel.to_lowercase().starts_with(&format!("{}/", from_rel.to_lowercase())) {
    return Err(VaultError::new(ErrorCode::InvalidPath, "cannot move a folder into itself"));
  }
  if fs::symlink_metadata(&from_abs).is_err() {
    return Err(VaultError::new(ErrorCode::NotFound, format!("Not found: {from_rel}")));
  }
  if ext(&from_rel).is_none() && !from_abs.is_dir() {
    return Err(VaultError::new(ErrorCode::InvalidPath, format!("only notes, PDFs and folders can be moved: {from_rel}")));
  }
  if fs::symlink_metadata(&to_abs).is_ok() {
    return Err(VaultError::new(ErrorCode::Conflict, format!("{to_rel} already exists")));
  }
  if let Some(parent) = to_abs.parent() {
    fs::create_dir_all(parent).map_err(fail)?;
  }
  fs::rename(&from_abs, &to_abs).map_err(fail)?;
  Ok(MoveResult { path: to_rel })
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

#[tauri::command]
pub async fn read_vault_binary<R: Runtime>(
  app: AppHandle<R>,
  path: String,
) -> Result<tauri::ipc::Response, VaultError> {
  let root = active_root(&app)?;
  blocking(move || read_binary(&root, &path).map(tauri::ipc::Response::new)).await
}

#[tauri::command]
pub async fn write_vault_binary<R: Runtime>(
  app: AppHandle<R>,
  path: String,
  data: String,
  overwrite: bool,
) -> Result<WriteResult, VaultError> {
  let root = active_root(&app)?;
  blocking(move || {
    if data.len() as u64 > MAX_BINARY_BYTES / 3 * 4 + 4 {
      return Err(VaultError::new(ErrorCode::Io, "File is too large to save"));
    }
    let bytes = BASE64
      .decode(data)
      .map_err(|err| VaultError::new(ErrorCode::Io, format!("invalid data: {err}")))?;
    write_binary(&root, &path, &bytes, overwrite)
  })
  .await
}

#[tauri::command]
pub async fn move_vault_path<R: Runtime>(
  app: AppHandle<R>,
  from: String,
  to: String,
) -> Result<MoveResult, VaultError> {
  let root = active_root(&app)?;
  blocking(move || move_path(&root, &from, &to)).await
}

#[tauri::command]
pub async fn trash_vault_path<R: Runtime>(app: AppHandle<R>, path: String) -> Result<MoveResult, VaultError> {
  let root = active_root(&app)?;
  blocking(move || trash_path(&root, &path)).await
}

#[tauri::command]
pub async fn restore_vault_path<R: Runtime>(
  app: AppHandle<R>,
  trash_path: String,
  to: String,
) -> Result<MoveResult, VaultError> {
  let root = active_root(&app)?;
  blocking(move || restore_path(&root, &trash_path, &to)).await
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
  fn normalize_binary_requires_pdf() {
    assert_eq!(
      normalize_binary("Observatory/MATH117/resources/a.PDF").unwrap(),
      "Observatory/MATH117/resources/a.PDF"
    );
    assert_eq!(normalize_binary("Observatory/MATH117/resources/images/q1.png").unwrap(), "Observatory/MATH117/resources/images/q1.png");
    for bad in ["a.md", "a.exe", "a.svg", "../a.png", "C:/a.pdf", ".obsidian/a.pdf", "a"] {
      assert_eq!(normalize_binary(bad).unwrap_err().code, ErrorCode::InvalidPath, "{bad}");
    }
  }

  #[test]
  fn binary_round_trip_and_conflict() {
    let (_dir, root) = vault();
    let bytes = [0u8, 159, 146, 150, 255];
    write_binary(&root, "O/a.pdf", &bytes, false).unwrap();
    assert_eq!(read_binary(&root, "O/a.pdf").unwrap(), bytes);
    assert_eq!(write_binary(&root, "O/a.pdf", b"x", false).unwrap_err().code, ErrorCode::Conflict);
    write_binary(&root, "O/a.pdf", b"x", true).unwrap();
    assert_eq!(read_binary(&root, "O/a.pdf").unwrap(), b"x");
  }

  #[test]
  fn moves_folders_without_overwriting() {
    let (_dir, root) = vault();
    write_binary(&root, "Observatory/MATH117/resources/a.pdf", b"pdf", false).unwrap();
    write_binary(&root, "Observatory/MATH119/b.pdf", b"b", false).unwrap();

    let moved = move_path(&root, "Observatory/MATH117", "Observatory/MATH118").unwrap();
    assert_eq!(moved.path, "Observatory/MATH118");
    assert_eq!(read_binary(&root, "Observatory/MATH118/resources/a.pdf").unwrap(), b"pdf");
    assert!(!root.join("Observatory/MATH117").exists());

    let err = move_path(&root, "Observatory/MATH118", "Observatory/MATH119").unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);
    let err = move_path(&root, "Observatory/MATH118", "Observatory/MATH118/inner").unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidPath);
    let err = move_path(&root, "Observatory/MATH118", "Observatory/x.exe").unwrap_err();
    assert_eq!(err.code, ErrorCode::InvalidPath);
    assert_eq!(move_path(&root, "Nope", "Other").unwrap_err().code, ErrorCode::NotFound);
  }

  #[test]
  fn trashes_and_restores_folders() {
    let (_dir, root) = vault();
    write_binary(&root, "Observatory/MATH117/a.pdf", b"one", false).unwrap();
    let t = trash_path(&root, "Observatory/MATH117").unwrap();
    assert_eq!(t.path, ".trash/MATH117");
    assert_eq!(fs::read(root.join(".trash/MATH117/a.pdf")).unwrap(), b"one");
    assert!(!root.join("Observatory/MATH117").exists());

    write_binary(&root, "Observatory/MATH117/b.pdf", b"two", false).unwrap();
    let t2 = trash_path(&root, "Observatory/MATH117").unwrap();
    assert_eq!(t2.path, ".trash/MATH117 2");

    let back = restore_path(&root, &t.path, "Observatory/MATH117").unwrap();
    assert_eq!(back.path, "Observatory/MATH117");
    assert_eq!(read_binary(&root, "Observatory/MATH117/a.pdf").unwrap(), b"one");
    assert!(!root.join(".trash/MATH117").exists());

    let err = restore_path(&root, &t2.path, "Observatory/MATH117").unwrap_err();
    assert_eq!(err.code, ErrorCode::Conflict);
    assert!(root.join(".trash/MATH117 2").exists());
  }

  #[test]
  fn trash_numbers_files_before_the_extension() {
    let (_dir, root) = vault();
    for _ in 0..2 {
      write_binary(&root, "a/x.pdf", b"p", false).unwrap();
      trash_path(&root, "a/x.pdf").unwrap();
    }
    assert!(root.join(".trash/x.pdf").exists() && root.join(".trash/x 2.pdf").exists());
  }

  #[test]
  fn trash_and_restore_refuse_bad_paths() {
    let (_dir, root) = vault();
    fs::create_dir_all(root.join(".trash/a")).unwrap();
    fs::create_dir_all(root.join("notes/x")).unwrap();
    for bad in ["", ".", ".obsidian/x", ".trash/a", "../x"] {
      assert_eq!(trash_path(&root, bad).unwrap_err().code, ErrorCode::InvalidPath, "{bad:?}");
    }
    for bad in ["../x", ".trash/a/b", "notes/x", ".trash/", ".trash/..", ".trash/a:b"] {
      assert_eq!(restore_path(&root, bad, "Z").unwrap_err().code, ErrorCode::InvalidPath, "{bad:?}");
    }
    assert!(root.join("notes/x").exists());
  }

  #[test]
  fn move_refuses_root_and_non_folders() {
    let (_dir, root) = vault();
    write_binary(&root, "a.pdf", b"p", false).unwrap();
    fs::write(root.join("plain"), "x").unwrap();
    for bad in ["", "."] {
      assert_eq!(move_path(&root, bad, "X").unwrap_err().code, ErrorCode::InvalidPath, "from {bad:?}");
      assert_eq!(move_path(&root, "a.pdf", bad).unwrap_err().code, ErrorCode::InvalidPath, "to {bad:?}");
    }
    assert_eq!(move_path(&root, "plain", "other").unwrap_err().code, ErrorCode::InvalidPath);
    assert!(root.join("plain").exists());
  }

  #[test]
  fn refused_overwrite_keeps_original_bytes() {
    let (_dir, root) = vault();
    write_binary(&root, "a.pdf", b"keep", false).unwrap();
    assert_eq!(write_binary(&root, "a.pdf", b"new", false).unwrap_err().code, ErrorCode::Conflict);
    fs::create_dir(root.join("d.pdf")).unwrap();
    assert!(write_binary(&root, "d.pdf", b"new", true).is_err());
    assert_eq!(read_binary(&root, "a.pdf").unwrap(), b"keep");
    assert!(!root.join(".a.pdf.crystal-tmp").exists());
    assert!(!root.join(".d.pdf.crystal-tmp").exists());
  }

  #[cfg(unix)]
  #[test]
  fn overwrite_does_not_follow_dangling_symlink() {
    let (_dir, root) = vault();
    let (_outside_dir, outside) = vault();
    let target = outside.join("target");
    std::os::unix::fs::symlink(&target, root.join("x.pdf")).unwrap();

    write_binary(&root, "x.pdf", b"in", true).unwrap();
    assert!(!target.exists());
    assert_eq!(read_binary(&root, "x.pdf").unwrap(), b"in");
  }

  #[cfg(unix)]
  #[test]
  fn no_overwrite_refuses_symlink_entry() {
    let (_dir, root) = vault();
    let (_outside_dir, outside) = vault();
    let target = outside.join("target");
    std::os::unix::fs::symlink(&target, root.join("x.pdf")).unwrap();

    assert_eq!(write_binary(&root, "x.pdf", b"in", false).unwrap_err().code, ErrorCode::Conflict);
    assert!(!target.exists());
  }

  #[test]
  fn moves_pdfs_into_new_folders() {
    let (_dir, root) = vault();
    write_binary(&root, "a.pdf", b"p", false).unwrap();
    move_path(&root, "a.pdf", "New/Dir/a.pdf").unwrap();
    assert_eq!(read_binary(&root, "New/Dir/a.pdf").unwrap(), b"p");
    assert_eq!(move_path(&root, "New/Dir/a.pdf", "New/Dir/a.md").unwrap_err().code, ErrorCode::InvalidPath);
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
