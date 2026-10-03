//! Command line and environment for High-tier chats: a headless `claude` CLI
//! speaking stream-json on stdin/stdout.
//!
//! Only enums, ids, and paths go on the command line; prompts and handoff
//! summaries are written to stdin by the webview. The environment is scrubbed
//! of every `ANTHROPIC*` / `CLAUDE*` variable, and `--settings` points the CLI
//! back at api.anthropic.com, so a user-level gateway override (OmniRoute) in
//! `~/.claude/settings.json` does not apply to High (ADR 0003).

use std::path::{Path, PathBuf};

use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Effort {
  Low,
  Medium,
  High,
  Xhigh,
  Max,
}

impl Effort {
  pub fn as_str(self) -> &'static str {
    match self {
      Effort::Low => "low",
      Effort::Medium => "medium",
      Effort::High => "high",
      Effort::Xhigh => "xhigh",
      Effort::Max => "max",
    }
  }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
  Auto,
  Manual,
  Plan,
}

impl Mode {
  pub fn as_str(self) -> &'static str {
    match self {
      Mode::Auto => "auto",
      Mode::Manual => "manual",
      Mode::Plan => "plan",
    }
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeOpts {
  pub chat_id: String,
  pub cwd: String,
  pub model: String,
  pub effort: Effort,
  pub mode: Mode,
  /// Claude session id. With `resume` the session is continued, otherwise a
  /// new session is created with this id.
  pub session_id: String,
  #[serde(default)]
  pub resume: bool,
}

pub fn valid_model(model: &str) -> bool {
  !model.is_empty()
    && model.len() <= 64
    && model.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '[' | ']'))
}

pub fn valid_uuid(id: &str) -> bool {
  id.len() == 36
    && id.chars().enumerate().all(|(i, c)| match i {
      8 | 13 | 18 | 23 => c == '-',
      _ => c.is_ascii_hexdigit(),
    })
}

pub fn valid_chat_id(id: &str) -> bool {
  !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Settings layered over the user's via `--settings`: point back at Anthropic
/// and blank the gateway token and model aliases.
fn settings_override() -> String {
  serde_json::json!({
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
      "ANTHROPIC_AUTH_TOKEN": "",
      "ANTHROPIC_API_KEY": "",
      "ANTHROPIC_MODEL": "",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "",
      "ANTHROPIC_SMALL_FAST_MODEL": ""
    }
  })
  .to_string()
}

pub fn validate(opts: &ClaudeOpts) -> Result<PathBuf, String> {
  if !valid_chat_id(&opts.chat_id) {
    return Err("Invalid chat id".into());
  }
  if !valid_model(&opts.model) {
    return Err(format!("Invalid Claude model name: {}", opts.model));
  }
  if !valid_uuid(&opts.session_id) {
    return Err("Invalid Claude session id".into());
  }
  let cwd = PathBuf::from(&opts.cwd);
  if !cwd.is_absolute() || !cwd.is_dir() {
    return Err(format!("Folder does not exist: {}", opts.cwd));
  }
  Ok(cwd)
}

pub fn args(opts: &ClaudeOpts) -> Vec<String> {
  let mut args: Vec<String> = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-prompts",
    "host",
    "--permission-prompt-tool",
    "stdio",
    "--model",
    &opts.model,
    "--effort",
    opts.effort.as_str(),
    "--permission-mode",
    opts.mode.as_str(),
    "--settings",
  ]
  .iter()
  .map(|s| s.to_string())
  .collect();
  args.push(settings_override());
  if opts.resume {
    args.extend(["--resume".to_string(), opts.session_id.clone()]);
  } else {
    args.extend(["--session-id".to_string(), opts.session_id.clone()]);
  }
  args
}

pub fn scrub_env(env: Vec<(String, String)>) -> Vec<(String, String)> {
  env
    .into_iter()
    .filter(|(k, _)| {
      let upper = k.to_ascii_uppercase();
      !upper.starts_with("ANTHROPIC") && !upper.starts_with("CLAUDE")
    })
    .collect()
}

/// `claude.exe` on PATH, or the native installer's default location.
pub fn resolve_binary(env: &[(String, String)]) -> Option<PathBuf> {
  if let Some(found) = super::which(env, "claude") {
    return Some(found);
  }
  let home = super::env_get(env, "USERPROFILE").or_else(|| super::env_get(env, "HOME"))?;
  let candidate = Path::new(home).join(".local").join("bin").join(if cfg!(windows) { "claude.exe" } else { "claude" });
  candidate.is_file().then_some(candidate)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn opts(resume: bool) -> ClaudeOpts {
    ClaudeOpts {
      chat_id: "chat_1".into(),
      cwd: std::env::temp_dir().display().to_string(),
      model: "opus".into(),
      effort: Effort::Xhigh,
      mode: Mode::Manual,
      session_id: "2dac6298-0406-4eb2-aec4-cfe0f4bb59b9".into(),
      resume,
    }
  }

  #[test]
  fn builds_new_and_resume_args() {
    let new = args(&opts(false));
    assert!(new.windows(2).any(|w| w == ["--effort", "xhigh"]));
    assert!(new.windows(2).any(|w| w == ["--permission-mode", "manual"]));
    assert!(new.windows(2).any(|w| w == ["--session-id", "2dac6298-0406-4eb2-aec4-cfe0f4bb59b9"]));
    assert!(!new.contains(&"--resume".to_string()));
    let resume = args(&opts(true));
    assert!(resume.windows(2).any(|w| w[0] == "--resume"));
    let settings_at = new.iter().position(|a| a == "--settings").unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&new[settings_at + 1]).unwrap();
    assert_eq!(parsed["env"]["ANTHROPIC_BASE_URL"], "https://api.anthropic.com");
  }

  #[test]
  fn rejects_free_text() {
    assert!(!valid_model("opus --dangerously-skip-permissions"));
    assert!(!valid_uuid("not-a-uuid"));
    assert!(!valid_chat_id("../etc"));
    assert!(valid_model("claude-opus-5[1m]"));
    assert!(validate(&opts(false)).is_ok());
  }

  #[test]
  fn scrubs_anthropic_and_claude_vars() {
    let env = vec![
      ("PATH".to_string(), "x".to_string()),
      ("ANTHROPIC_BASE_URL".to_string(), "http://localhost:20128/v1".to_string()),
      ("CLAUDECODE".to_string(), "1".to_string()),
      ("claude_code_entrypoint".to_string(), "sdk".to_string()),
    ];
    let kept = scrub_env(env);
    assert_eq!(kept, vec![("PATH".to_string(), "x".to_string())]);
  }
}
