//! The Nebula's diff review: what a run changed in the project folder, per
//! file, and the git operations behind Revert and Commit. Every call runs the
//! user's own `git` with the folder as its working directory; file paths come
//! from `git status` and are passed after `--`, so they are never read as
//! options.

use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;

/// Untracked files are shown whole; past this they are cut short.
const MAX_NEW_FILE_BYTES: usize = 200_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
  path: String,
  /// The two porcelain status letters, e.g. " M", "A ", "??", "R ".
  status: String,
  /// For a rename, where the file was.
  orig_path: Option<String>,
}

fn git(cwd: &Path, args: &[&str]) -> Result<String, String> {
  let env = crate::terminal::fresh_env();
  let bin = super::which(&env, "git").ok_or("Git was not found on PATH")?;
  let mut command = Command::new(bin);
  command
    .args(args)
    .current_dir(cwd)
    .env_clear()
    .envs(env.iter().map(|(k, v)| (k, v)))
    .stdin(Stdio::null());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
  }
  let out = command.output().map_err(|e| format!("Could not run git: {e}"))?;
  if out.status.success() {
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
  } else {
    Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
  }
}

/// A path from the webview must be one `git status` could have given: relative and inside the folder.
fn inside(path: &str) -> Result<&str, String> {
  let p = Path::new(path);
  if path.is_empty() || p.is_absolute() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
    return Err(format!("Not a file in this project: {path}"));
  }
  Ok(path)
}

fn parse_status(out: &str) -> Vec<ChangedFile> {
  let mut entries = out.split('\0').filter(|e| !e.is_empty());
  let mut files = Vec::new();
  while let Some(entry) = entries.next() {
    if entry.len() < 4 {
      continue;
    }
    let status = entry[..2].to_string();
    let path = entry[3..].to_string();
    // -z puts a rename's old path in the next entry.
    let orig_path = if status.contains('R') || status.contains('C') { entries.next().map(str::to_string) } else { None };
    files.push(ChangedFile { path, status, orig_path });
  }
  files
}

/// The changed files, or an error when the folder is not a git repository.
#[tauri::command]
pub async fn harness_git_status(cwd: String) -> Result<Vec<ChangedFile>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let dir = super::existing_dir(&cwd)?;
    git(&dir, &["status", "--porcelain=v1", "-z", "--untracked-files=all"]).map(|out| parse_status(&out))
  })
  .await
  .map_err(|e| e.to_string())?
}

/// One file's unified diff against HEAD; an untracked file comes back as one big addition.
#[tauri::command]
pub async fn harness_git_diff(cwd: String, path: String, untracked: bool) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let dir = super::existing_dir(&cwd)?;
    let path = inside(&path)?;
    if !untracked {
      return git(&dir, &["diff", "--no-color", "--no-ext-diff", "HEAD", "--", path]);
    }
    let bytes = std::fs::read(dir.join(path)).map_err(|e| format!("Could not read {path}: {e}"))?;
    if bytes.contains(&0) {
      return Ok(format!("+++ b/{path}\nBinary file\n"));
    }
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_NEW_FILE_BYTES)]);
    let lines: Vec<String> = text.lines().map(|l| format!("+{l}")).collect();
    let cut = if bytes.len() > MAX_NEW_FILE_BYTES { "\n… (cut short)" } else { "" };
    Ok(format!("+++ b/{path}\n@@ -0,0 +1,{} @@\n{}{cut}\n", lines.len(), lines.join("\n")))
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Puts one file back as it is in HEAD. A new file is deleted; a renamed one goes back to its old name.
#[tauri::command]
pub async fn harness_git_revert(cwd: String, path: String, orig_path: Option<String>, untracked: bool) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    let dir = super::existing_dir(&cwd)?;
    let path = inside(&path)?;
    let in_head = !untracked && git(&dir, &["cat-file", "-e", &format!("HEAD:{path}")]).is_ok();
    if in_head {
      git(&dir, &["restore", "--source=HEAD", "--staged", "--worktree", "--", path])?;
    } else {
      if !untracked {
        git(&dir, &["rm", "--cached", "--quiet", "--", path])?;
      }
      let file: PathBuf = dir.join(path);
      if file.exists() {
        std::fs::remove_file(&file).map_err(|e| format!("Could not delete {path}: {e}"))?;
      }
    }
    if let Some(orig) = orig_path.as_deref() {
      git(&dir, &["restore", "--source=HEAD", "--staged", "--worktree", "--", inside(orig)?])?;
    }
    Ok(())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Stages exactly `paths` and commits them, leaving any other change alone. Returns the new commit's short hash.
#[tauri::command]
pub async fn harness_git_commit(cwd: String, paths: Vec<String>, message: String) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let dir = super::existing_dir(&cwd)?;
    if paths.is_empty() || message.trim().is_empty() {
      return Err("Pick at least one file and write a message".into());
    }
    let paths = paths.iter().map(|p| inside(p)).collect::<Result<Vec<_>, _>>()?;
    let mut add = vec!["add", "-A", "--"];
    add.extend(paths.iter().copied());
    git(&dir, &add)?;
    let mut commit = vec!["commit", "-m", message.trim(), "--"];
    commit.extend(paths.iter().copied());
    git(&dir, &commit)?;
    git(&dir, &["rev-parse", "--short", "HEAD"]).map(|h| h.trim().to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_porcelain_with_renames() {
    let files = parse_status(" M src/a.ts\0?? new file.md\0R  b.ts\0old/b.ts\0");
    let got: Vec<_> = files.iter().map(|f| (f.status.as_str(), f.path.as_str(), f.orig_path.as_deref())).collect();
    assert_eq!(got, vec![(" M", "src/a.ts", None), ("??", "new file.md", None), ("R ", "b.ts", Some("old/b.ts"))]);
  }

  #[test]
  fn refuses_paths_outside_the_folder() {
    assert!(inside("src/a.ts").is_ok());
    assert!(inside("../secret").is_err());
    assert!(inside("C:/Windows/x").is_err());
    assert!(inside("/etc/passwd").is_err());
    assert!(inside("").is_err());
  }
}
