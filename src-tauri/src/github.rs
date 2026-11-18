use std::process::{Command, Stdio};

const FIELDS: &str = "number,title,url,repository,updatedAt";

fn search(kind: &str, filter: &str) -> Result<serde_json::Value, String> {
  let env = crate::terminal::fresh_env();
  let bin = crate::harness::which(&env, "gh").ok_or("GitHub CLI (gh) was not found on PATH")?;
  let mut command = Command::new(bin);
  command
    .args(["search", kind, filter, "--state=open", "--limit=30", "--json", FIELDS])
    .env_clear()
    .envs(env.iter().map(|(k, v)| (k, v)))
    .env("GH_PROMPT_DISABLED", "1")
    .env("NO_COLOR", "1")
    .stdin(Stdio::null());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
  }
  let out = command.output().map_err(|e| format!("Could not run gh: {e}"))?;
  if !out.status.success() {
    return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
  }
  serde_json::from_slice(&out.stdout).map_err(|e| format!("gh returned unreadable output: {e}"))
}

#[tauri::command]
pub async fn github_inbox() -> Result<serde_json::Value, String> {
  tauri::async_runtime::spawn_blocking(|| {
    Ok(serde_json::json!({
      "reviews": search("prs", "--review-requested=@me")?,
      "issues": search("issues", "--assignee=@me")?,
    }))
  })
  .await
  .map_err(|e| e.to_string())?
}
