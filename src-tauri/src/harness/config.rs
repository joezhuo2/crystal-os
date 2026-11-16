//! Nebula configuration and the files it generates for DeepSeek Harness.
//!
//! Everything dsh reads lives in its own home, `<app config>/dsh`, so the
//! user's `~/.dsh` is never touched. The generated files are JSON documents
//! (JSON is valid YAML): serde_json handles all escaping, so Windows paths and
//! arbitrary model ids cannot break the YAML that dsh parses.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::atomic_write;

pub const NVIDIA_KEY_REF: &str = "NVIDIA_API_KEY";
pub const OMNIROUTE_KEY_REF: &str = "OMNIROUTE_API_KEY";
/// Written when the user has not set an OmniRoute key, so a local OmniRoute
/// that needs no auth still works. Reported as "not set".
const OMNIROUTE_PLACEHOLDER: &str = "crystal-os-no-key";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct NimModels {
  pub kimi: String,
  pub deepseek: String,
  pub nemotron: String,
}

impl Default for NimModels {
  fn default() -> Self {
    NimModels {
      kimi: "moonshotai/kimi-k3".into(),
      deepseek: "deepseek-ai/deepseek-v4-flash-0731".into(),
      nemotron: "nvidia/nemotron-3-ultra-550b-a55b".into(),
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct NebulaConfig {
  pub omniroute_base_url: String,
  pub omniroute_model: String,
  pub nim_base_url: String,
  pub nim_models: NimModels,
  pub claude_model: String,
  pub projects_root: String,
  pub disabled_mcp: Vec<String>,
}

impl Default for NebulaConfig {
  fn default() -> Self {
    let projects_root = std::env::var("USERPROFILE")
      .or_else(|_| std::env::var("HOME"))
      .map(|home| Path::new(&home).join("Documents").join("Projects"))
      .map(|p| forward_slashes(&p))
      .unwrap_or_default();
    NebulaConfig {
      omniroute_base_url: "http://localhost:20128/v1".into(),
      omniroute_model: "auto/coding".into(),
      nim_base_url: "https://integrate.api.nvidia.com/v1".into(),
      nim_models: NimModels::default(),
      claude_model: "opus".into(),
      projects_root,
      disabled_mcp: Vec::new(),
    }
  }
}

pub fn forward_slashes(path: &Path) -> String {
  path.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_string()
}

fn valid_url(url: &str) -> bool {
  (url.starts_with("http://") || url.starts_with("https://")) && url.len() <= 512 && !url.contains(char::is_whitespace)
}

fn valid_model_id(id: &str) -> bool {
  !id.is_empty() && id.len() <= 128 && !id.contains(char::is_whitespace)
}

impl NebulaConfig {
  pub fn validate(&self) -> Result<(), String> {
    for url in [&self.omniroute_base_url, &self.nim_base_url].into_iter().filter(|u| !u.trim().is_empty()) {
      if !valid_url(url) {
        return Err(format!("Invalid endpoint URL: {url}"));
      }
    }
    let models = [&self.nim_models.kimi, &self.nim_models.deepseek, &self.nim_models.nemotron];
    let omniroute = (!self.omniroute_model.trim().is_empty()).then_some(&self.omniroute_model);
    if let Some(bad) = models.into_iter().chain(omniroute).find(|m| !valid_model_id(m)) {
      return Err(format!("Invalid model id: {bad}"));
    }
    if !super::claude::valid_model(&self.claude_model) {
      return Err(format!("Invalid Claude model name: {}", self.claude_model));
    }
    if self.projects_root.is_empty() || !Path::new(&self.projects_root).is_absolute() {
      return Err("Projects folder must be an absolute path".into());
    }
    Ok(())
  }
}

pub type MasterEnv = BTreeMap<String, String>;

const ENV_NAMES: [&str; 6] = ["NVIDIA_API_KEY", "NVIDIA_BASE_URL", "NVIDIA_MODEL", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL", "OMNIROUTE_MODEL"];

pub fn parse_master_env(content: &str) -> MasterEnv {
  let mut out = MasterEnv::new();
  for line in content.lines().map(str::trim_start).filter(|l| !l.starts_with('#')) {
    let Some((key, value)) = line.split_once('=') else { continue };
    let (key, value) = (key.trim(), value.trim().trim_matches(['"', '\'']));
    if ENV_NAMES.contains(&key) {
      if value.is_empty() {
        out.remove(key);
      } else {
        out.insert(key.to_string(), value.to_string());
      }
    }
  }
  out
}

fn blank_or(own: &str, master: Option<&String>, ok: fn(&str) -> bool, default: &str) -> String {
  if !own.trim().is_empty() {
    return own.to_string();
  }
  master.filter(|v| ok(v)).cloned().unwrap_or_else(|| default.to_string())
}

impl NebulaConfig {
  pub fn resolved(&self, env: &MasterEnv) -> NebulaConfig {
    let defaults = NebulaConfig::default();
    NebulaConfig {
      omniroute_base_url: blank_or(&self.omniroute_base_url, env.get("OMNIROUTE_BASE_URL"), valid_url, &defaults.omniroute_base_url),
      omniroute_model: blank_or(&self.omniroute_model, env.get("OMNIROUTE_MODEL"), valid_model_id, &defaults.omniroute_model),
      nim_base_url: blank_or(&self.nim_base_url, env.get("NVIDIA_BASE_URL"), valid_url, &defaults.nim_base_url),
      ..self.clone()
    }
  }
}

pub fn load(path: &Path) -> NebulaConfig {
  std::fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default()
}

pub fn save(path: &Path, config: &NebulaConfig) -> Result<(), String> {
  config.validate()?;
  let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
  atomic_write(path, text.as_bytes())
}

/// The five Claude effort levels, mapped to what each endpoint accepts.
fn efforts(pairs: [&str; 5]) -> Value {
  let keys = ["low", "medium", "high", "xhigh", "max"];
  Value::Object(keys.iter().zip(pairs).map(|(k, v)| (k.to_string(), Value::String(v.to_string()))).collect())
}

pub fn dsh_settings(config: &NebulaConfig) -> Value {
  json!({
    "llm-pi-ai": {
      "providers": {
        "omniroute": {
          "displayName": "OmniRoute",
          "apiKeyEnv": OMNIROUTE_KEY_REF,
          "api": "openai-completions",
          "baseURL": config.omniroute_base_url,
          "models": [{
            "id": config.omniroute_model,
            "name": format!("OmniRoute {}", config.omniroute_model),
            "reasoningEfforts": efforts(["low", "medium", "high", "xhigh", "max"])
          }]
        },
        "nvidia-nim": {
          "displayName": "NVIDIA NIM",
          "apiKeyEnv": NVIDIA_KEY_REF,
          "api": "openai-completions",
          "baseURL": config.nim_base_url,
          "models": [
            {
              "id": config.nim_models.kimi,
              "name": config.nim_models.kimi,
              "reasoningEfforts": efforts(["low", "medium", "high", "high", "high"])
            },
            {
              "id": config.nim_models.deepseek,
              "name": config.nim_models.deepseek,
              "compat": { "thinkingFormat": "deepseek" },
              "reasoningEfforts": efforts(["high", "high", "high", "max", "max"])
            },
            {
              "id": config.nim_models.nemotron,
              "name": config.nim_models.nemotron,
              "reasoningEfforts": efforts(["low", "medium", "high", "high", "high"])
            }
          ]
        }
      }
    }
  })
}

/// Home-level patch layer: applies to every profile, so it survives the acp
/// profile being initialized from its template on first boot.
pub fn dsh_patch(config: &NebulaConfig, skill_dirs: &[String]) -> Value {
  json!([
    { "id": "skill-filesystem", "config": { "customSkillDirs": skill_dirs, "watch": false } },
    { "id": "agent-default-model", "config": { "provider": "omniroute", "model": config.omniroute_model } },
    { "id": "acp", "config": { "provider": "omniroute", "model": config.omniroute_model } }
  ])
}

pub fn write_dsh_files(home: &Path, config: &NebulaConfig, env: &MasterEnv, skill_dirs: &[String]) -> Result<(), String> {
  std::fs::create_dir_all(home).map_err(|e| e.to_string())?;
  let config = &config.resolved(env);
  let settings = serde_json::to_string_pretty(&dsh_settings(config)).map_err(|e| e.to_string())?;
  atomic_write(&home.join("settings.yaml"), settings.as_bytes())?;
  let patch = serde_json::to_string_pretty(&dsh_patch(config, skill_dirs)).map_err(|e| e.to_string())?;
  atomic_write(&home.join("cordis.patch.yml"), patch.as_bytes())?;
  ensure_placeholder_keys(home)
}

/* ------------------------------------------------------------------ *
 * Credentials
 * ------------------------------------------------------------------ */

fn credentials_path(home: &Path) -> PathBuf {
  home.join(".credentials.yaml")
}

fn read_refs(home: &Path) -> BTreeMap<String, String> {
  let Ok(raw) = std::fs::read_to_string(credentials_path(home)) else { return BTreeMap::new() };
  let Ok(doc) = serde_json::from_str::<Value>(&raw) else {
    log::warn!("[nebula] credentials file is not JSON; it will be rewritten");
    return BTreeMap::new();
  };
  doc
    .get("refs")
    .and_then(Value::as_object)
    .map(|refs| refs.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect())
    .unwrap_or_default()
}

fn write_refs(home: &Path, refs: &BTreeMap<String, String>) -> Result<(), String> {
  let refs: Map<String, Value> = refs.iter().map(|(k, v)| (k.clone(), Value::String(v.clone()))).collect();
  let doc = json!({ "version": 1, "refs": refs });
  std::fs::create_dir_all(home).map_err(|e| e.to_string())?;
  atomic_write(&credentials_path(home), serde_json::to_string_pretty(&doc).unwrap().as_bytes())
}

fn ensure_placeholder_keys(home: &Path) -> Result<(), String> {
  let mut refs = read_refs(home);
  if refs.contains_key(OMNIROUTE_KEY_REF) {
    return Ok(());
  }
  refs.insert(OMNIROUTE_KEY_REF.into(), OMNIROUTE_PLACEHOLDER.into());
  write_refs(home, &refs)
}

pub fn key_ref(provider: &str) -> Option<&'static str> {
  match provider {
    "nvidia" => Some(NVIDIA_KEY_REF),
    "omniroute" => Some(OMNIROUTE_KEY_REF),
    _ => None,
  }
}

/// `None` removes the key (OmniRoute falls back to the no-auth placeholder).
pub fn set_key(home: &Path, provider: &str, value: Option<&str>) -> Result<(), String> {
  let name = key_ref(provider).ok_or_else(|| format!("Unknown provider: {provider}"))?;
  let mut refs = read_refs(home);
  match value.map(str::trim).filter(|v| !v.is_empty()) {
    Some(v) => {
      if v.contains(['\n', '\r']) || v.len() > 4096 {
        return Err("That does not look like an API key".into());
      }
      refs.insert(name.into(), v.into());
    }
    None if name == OMNIROUTE_KEY_REF => {
      refs.insert(name.into(), OMNIROUTE_PLACEHOLDER.into());
    }
    None => {
      refs.remove(name);
    }
  }
  write_refs(home, &refs)
}

/// The stored key for a provider, for Rust-side probes only. Never sent to JS.
pub fn get_key(home: &Path, provider: &str) -> Option<String> {
  let name = key_ref(provider)?;
  read_refs(home).remove(name).filter(|v| v != OMNIROUTE_PLACEHOLDER)
}

#[derive(Serialize)]
pub struct KeyStatus {
  pub nvidia: bool,
  pub omniroute: bool,
}

pub fn effective_key(home: &Path, provider: &str, env: &MasterEnv) -> Option<String> {
  get_key(home, provider).or_else(|| env.get(key_ref(provider)?).cloned())
}

/// Master keys to hand dsh via its environment, which it prefers over the credentials file.
pub fn fallback_key_env(home: &Path, env: &MasterEnv) -> Vec<(String, String)> {
  ["nvidia", "omniroute"]
    .into_iter()
    .filter(|p| get_key(home, p).is_none())
    .filter_map(|p| key_ref(p).and_then(|name| env.get(name).map(|v| (name.to_string(), v.clone()))))
    .collect()
}

pub fn key_status(home: &Path, env: &MasterEnv) -> KeyStatus {
  KeyStatus { nvidia: effective_key(home, "nvidia", env).is_some(), omniroute: effective_key(home, "omniroute", env).is_some() }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn generated_files_parse_and_keep_windows_paths() {
    let dir = tempfile::tempdir().unwrap();
    let config = NebulaConfig { projects_root: "C:/Users/Joe/Documents/Projects".into(), ..Default::default() };
    let skills = vec![forward_slashes(Path::new(r"C:\Users\Joe\.claude\skills\"))];
    write_dsh_files(dir.path(), &config, &MasterEnv::new(), &skills).unwrap();

    let settings: Value = serde_json::from_str(&std::fs::read_to_string(dir.path().join("settings.yaml")).unwrap()).unwrap();
    let nim = &settings["llm-pi-ai"]["providers"]["nvidia-nim"]["models"];
    assert_eq!(nim[0]["id"], "moonshotai/kimi-k3");
    assert_eq!(nim[1]["compat"]["thinkingFormat"], "deepseek");
    assert_eq!(nim[2]["reasoningEfforts"]["xhigh"], "high");

    let patch: Value = serde_json::from_str(&std::fs::read_to_string(dir.path().join("cordis.patch.yml")).unwrap()).unwrap();
    assert_eq!(patch[0]["config"]["customSkillDirs"][0], "C:/Users/Joe/.claude/skills");
  }

  #[test]
  fn keys_round_trip_without_exposing_placeholder() {
    let dir = tempfile::tempdir().unwrap();
    write_dsh_files(dir.path(), &NebulaConfig::default(), &MasterEnv::new(), &[]).unwrap();
    assert!(!key_status(dir.path(), &MasterEnv::new()).omniroute);
    set_key(dir.path(), "nvidia", Some("nvapi-test")).unwrap();
    set_key(dir.path(), "omniroute", Some("sk-local")).unwrap();
    assert!(key_status(dir.path(), &MasterEnv::new()).nvidia);
    assert_eq!(get_key(dir.path(), "omniroute").as_deref(), Some("sk-local"));
    set_key(dir.path(), "omniroute", None).unwrap();
    assert!(get_key(dir.path(), "omniroute").is_none());
    set_key(dir.path(), "nvidia", None).unwrap();
    assert!(!key_status(dir.path(), &MasterEnv::new()).nvidia);
    assert!(set_key(dir.path(), "openai", Some("x")).is_err());
  }

  #[test]
  fn validate_rejects_bad_values() {
    let mut config = NebulaConfig { projects_root: "C:/Projects".into(), ..Default::default() };
    assert!(config.validate().is_ok() || cfg!(not(windows)));
    config.nim_base_url = "ftp://x".into();
    assert!(config.validate().is_err());
  }

  fn master() -> MasterEnv {
    parse_master_env("# c\nNVIDIA_API_KEY=\"nv-master\"\nOMNIROUTE_API_KEY='om-master'\nNVIDIA_BASE_URL=https://nim.example/v1\nOMNIROUTE_BASE_URL=bad url\nOMNIROUTE_MODEL=my/model\nUNRELATED=1\n")
  }

  #[test]
  fn parses_only_master_names_and_strips_quotes() {
    let env = master();
    assert_eq!(env.get("NVIDIA_API_KEY").map(String::as_str), Some("nv-master"));
    assert_eq!(env.get("OMNIROUTE_API_KEY").map(String::as_str), Some("om-master"));
    assert!(!env.contains_key("UNRELATED"));
    assert!(parse_master_env("NVIDIA_API_KEY=\n").is_empty());
  }

  #[test]
  fn blank_endpoints_use_master_then_default_and_own_wins() {
    let blank = NebulaConfig { nim_base_url: " ".into(), omniroute_base_url: String::new(), omniroute_model: String::new(), ..Default::default() };
    let r = blank.resolved(&master());
    assert_eq!(r.nim_base_url, "https://nim.example/v1");
    assert_eq!(r.omniroute_base_url, NebulaConfig::default().omniroute_base_url);
    assert_eq!(r.omniroute_model, "my/model");
    let own = NebulaConfig { nim_base_url: "https://own/v1".into(), omniroute_model: "own".into(), ..Default::default() };
    let r = own.resolved(&master());
    assert_eq!((r.nim_base_url.as_str(), r.omniroute_model.as_str()), ("https://own/v1", "own"));
    assert_eq!(blank.resolved(&MasterEnv::new()).nim_base_url, NebulaConfig::default().nim_base_url);
  }

  #[test]
  fn keys_fall_back_to_master_only_when_own_is_unset() {
    let dir = tempfile::tempdir().unwrap();
    write_dsh_files(dir.path(), &NebulaConfig::default(), &MasterEnv::new(), &[]).unwrap();
    let env = master();
    assert!(key_status(dir.path(), &env).nvidia && key_status(dir.path(), &env).omniroute);
    assert_eq!(fallback_key_env(dir.path(), &env).len(), 2);
    set_key(dir.path(), "nvidia", Some("own")).unwrap();
    assert_eq!(effective_key(dir.path(), "nvidia", &env).as_deref(), Some("own"));
    assert_eq!(fallback_key_env(dir.path(), &env), vec![("OMNIROUTE_API_KEY".to_string(), "om-master".to_string())]);
    assert!(fallback_key_env(dir.path(), &MasterEnv::new()).is_empty());
  }

  #[test]
  fn validate_accepts_blank_endpoints() {
    let config = NebulaConfig { projects_root: "C:/Projects".into(), nim_base_url: String::new(), omniroute_base_url: String::new(), omniroute_model: String::new(), ..Default::default() };
    assert!(config.validate().is_ok() || cfg!(not(windows)));
  }
}
