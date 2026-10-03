//! Finds the user's Claude skills and local MCP servers so DeepSeek chats get
//! the same tools as Claude Code.
//!
//! Read-only. Sources, lowest precedence first (a later server with the same
//! name replaces an earlier one):
//! 1. enabled Claude Code plugins' `.mcp.json`
//! 2. Claude Desktop's `claude_desktop_config.json`
//! 3. `~/.claude.json` user-level `mcpServers`
//! 4. `~/.claude.json` project entry for the chat folder
//!
//! claude.ai cloud connectors are not reachable from here: their OAuth lives
//! on claude.ai.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

#[derive(Clone, Debug, PartialEq)]
pub enum Transport {
  Stdio { command: String, args: Vec<String>, env: BTreeMap<String, String> },
  Http { url: String, headers: BTreeMap<String, String> },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
  Ready,
  Unavailable,
  Unsupported,
  Disabled,
}

#[derive(Clone, Debug)]
pub struct Server {
  pub name: String,
  pub source: String,
  pub transport: Transport,
  pub status: Status,
  pub reason: Option<String>,
}

/// What the webview may see: no env values or header values.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSummary {
  pub name: String,
  pub source: String,
  pub transport: &'static str,
  pub status: Status,
  pub reason: Option<String>,
  pub env_keys: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySummary {
  pub servers: Vec<ServerSummary>,
  pub skill_dirs: Vec<String>,
}

pub struct Discovery {
  pub servers: Vec<Server>,
  pub skill_dirs: Vec<String>,
}

pub struct Roots {
  /// The user's home directory (`%USERPROFILE%`).
  pub home: PathBuf,
  /// `%APPDATA%`, where Claude Desktop keeps its config.
  pub appdata: Option<PathBuf>,
}

fn read_json(path: &Path) -> Option<Value> {
  serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn normalize_path_key(path: &str) -> String {
  path.replace('\\', "/").trim_end_matches('/').to_ascii_lowercase()
}

fn string_map(value: Option<&Value>) -> BTreeMap<String, String> {
  value
    .and_then(Value::as_object)
    .map(|obj| obj.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect())
    .unwrap_or_default()
}

/// Parses one `mcpServers` object. `plugin_root` expands `${CLAUDE_PLUGIN_ROOT}`.
fn parse_servers(obj: &Value, source: &str, plugin_root: Option<&str>) -> Vec<Server> {
  let Some(map) = obj.as_object() else { return Vec::new() };
  let expand = |s: &str| match plugin_root {
    Some(root) => s.replace("${CLAUDE_PLUGIN_ROOT}", root),
    None => s.to_string(),
  };
  map
    .iter()
    .filter_map(|(name, spec)| {
      let kind = spec.get("type").and_then(Value::as_str).unwrap_or("");
      let (transport, status, reason) = if let Some(command) = spec.get("command").and_then(Value::as_str) {
        let args = spec
          .get("args")
          .and_then(Value::as_array)
          .map(|a| a.iter().filter_map(Value::as_str).map(&expand).collect())
          .unwrap_or_default();
        let env = string_map(spec.get("env")).into_iter().map(|(k, v)| (k, expand(&v))).collect();
        (Transport::Stdio { command: expand(command), args, env }, Status::Ready, None)
      } else if let Some(url) = spec.get("url").and_then(Value::as_str) {
        let transport = Transport::Http { url: expand(url), headers: string_map(spec.get("headers")) };
        if kind == "sse" {
          (transport, Status::Unsupported, Some("SSE transport is not supported by DeepSeek Harness".to_string()))
        } else {
          (transport, Status::Ready, None)
        }
      } else {
        return None;
      };
      Some(Server { name: name.clone(), source: source.to_string(), transport, status, reason })
    })
    .collect()
}

struct Plugin {
  name: String,
  root: PathBuf,
}

fn enabled_plugins(home: &Path) -> Vec<Plugin> {
  let claude = home.join(".claude");
  let enabled = read_json(&claude.join("settings.json"))
    .and_then(|s| s.get("enabledPlugins").cloned())
    .and_then(|v| v.as_object().cloned())
    .unwrap_or_default();
  let installed = read_json(&claude.join("plugins").join("installed_plugins.json"))
    .and_then(|v| v.get("plugins").cloned())
    .and_then(|v| v.as_object().cloned())
    .unwrap_or_default();
  enabled
    .iter()
    .filter(|(_, on)| on.as_bool() == Some(true))
    .filter_map(|(name, _)| {
      let installs = installed.get(name)?.as_array()?;
      let root = installs
        .iter()
        .filter_map(|i| i.get("installPath").and_then(Value::as_str))
        .map(PathBuf::from)
        .find(|p| p.is_dir())?;
      Some(Plugin { name: name.clone(), root })
    })
    .collect()
}

fn has_skills(dir: &Path) -> bool {
  std::fs::read_dir(dir)
    .map(|entries| entries.filter_map(Result::ok).any(|e| e.path().join("SKILL.md").is_file()))
    .unwrap_or(false)
}

pub fn skill_dirs(roots: &Roots) -> Vec<String> {
  let mut dirs = vec![roots.home.join(".claude").join("skills")];
  dirs.extend(enabled_plugins(&roots.home).into_iter().map(|p| p.root.join("skills")));
  let mut out: Vec<String> = Vec::new();
  for dir in dirs.into_iter().filter(|d| has_skills(d)) {
    let s = super::config::forward_slashes(&dir);
    if !out.contains(&s) {
      out.push(s);
    }
  }
  out
}

fn collect_servers(roots: &Roots, cwd: Option<&Path>) -> Vec<Server> {
  let mut all = Vec::new();
  for plugin in enabled_plugins(&roots.home) {
    let root = super::config::forward_slashes(&plugin.root);
    for file in [".mcp.json", "mcp.json"] {
      if let Some(doc) = read_json(&plugin.root.join(file)) {
        let obj = doc.get("mcpServers").cloned().unwrap_or(doc);
        all.extend(parse_servers(&obj, &format!("plugin {}", plugin.name), Some(&root)));
        break;
      }
    }
  }
  if let Some(appdata) = &roots.appdata {
    if let Some(doc) = read_json(&appdata.join("Claude").join("claude_desktop_config.json")) {
      all.extend(parse_servers(doc.get("mcpServers").unwrap_or(&Value::Null), "Claude Desktop", None));
    }
  }
  if let Some(doc) = read_json(&roots.home.join(".claude.json")) {
    all.extend(parse_servers(doc.get("mcpServers").unwrap_or(&Value::Null), "Claude Code (user)", None));
    if let (Some(cwd), Some(projects)) = (cwd, doc.get("projects").and_then(Value::as_object)) {
      let want = normalize_path_key(&cwd.to_string_lossy());
      // Keys that differ only in case or slash style are the same folder on
      // Windows; merge all of them.
      for (key, project) in projects {
        if normalize_path_key(key) == want {
          all.extend(parse_servers(project.get("mcpServers").unwrap_or(&Value::Null), "Claude Code (project)", None));
        }
      }
    }
  }

  let mut merged: Vec<Server> = Vec::new();
  for server in all {
    if let Some(existing) = merged.iter_mut().find(|s| s.name == server.name) {
      log::warn!("[nebula] MCP server '{}' from {} replaces the one from {}", server.name, server.source, existing.source);
      *existing = server;
    } else {
      merged.push(server);
    }
  }
  merged
}

/// Resolves a stdio command to something node can spawn without a shell.
/// `.cmd` / `.bat` shims (npx, uvx wrappers) run through `cmd.exe /d /c`.
fn resolve_command(command: &str, args: &[String], env: &[(String, String)]) -> Result<(String, Vec<String>), String> {
  let path = Path::new(command);
  let resolved = if path.is_absolute() {
    path.is_file().then(|| path.to_path_buf())
  } else {
    super::which(env, command)
  };
  let resolved = resolved.ok_or_else(|| format!("'{command}' was not found on PATH"))?;
  let ext = resolved.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
  if ext == "cmd" || ext == "bat" {
    let system_root = super::env_get(env, "SystemRoot").unwrap_or(r"C:\Windows");
    let cmd = Path::new(system_root).join("System32").join("cmd.exe");
    let mut wrapped = vec!["/d".to_string(), "/c".to_string(), resolved.to_string_lossy().into_owned()];
    wrapped.extend(args.iter().cloned());
    return Ok((cmd.to_string_lossy().into_owned(), wrapped));
  }
  Ok((resolved.to_string_lossy().into_owned(), args.to_vec()))
}

pub fn discover(roots: &Roots, cwd: Option<&Path>, env: &[(String, String)], disabled: &[String]) -> Discovery {
  let mut servers = collect_servers(roots, cwd);
  for server in &mut servers {
    if server.status != Status::Ready {
      continue;
    }
    if disabled.contains(&server.name) {
      server.status = Status::Disabled;
      continue;
    }
    if let Transport::Stdio { command, args, env: own_env } = &mut server.transport {
      // A server that declares its own PATH is resolved against it.
      let lookup: Vec<(String, String)> = match own_env.iter().find(|(k, _)| k.eq_ignore_ascii_case("PATH")) {
        Some((_, path)) => vec![("PATH".into(), path.clone()), ("PATHEXT".into(), super::env_get(env, "PATHEXT").unwrap_or(".COM;.EXE;.BAT;.CMD").into())],
        None => env.to_vec(),
      };
      match resolve_command(command, args, &lookup) {
        Ok((program, full_args)) => {
          *command = program;
          *args = full_args;
        }
        Err(reason) => {
          server.status = Status::Unavailable;
          server.reason = Some(reason);
        }
      }
    }
  }
  Discovery { servers, skill_dirs: skill_dirs(roots) }
}

pub fn summarize(discovery: &Discovery) -> DiscoverySummary {
  DiscoverySummary {
    servers: discovery
      .servers
      .iter()
      .map(|s| ServerSummary {
        name: s.name.clone(),
        source: s.source.clone(),
        transport: match s.transport {
          Transport::Stdio { .. } => "stdio",
          Transport::Http { .. } => "http",
        },
        status: s.status.clone(),
        reason: s.reason.clone(),
        env_keys: match &s.transport {
          Transport::Stdio { env, .. } => env.keys().cloned().collect(),
          Transport::Http { headers, .. } => headers.keys().cloned().collect(),
        },
      })
      .collect(),
    skill_dirs: discovery.skill_dirs.clone(),
  }
}

fn pairs(map: &BTreeMap<String, String>) -> Value {
  Value::Array(map.iter().map(|(k, v)| json!({ "name": k, "value": v })).collect())
}

/// ACP `mcpServers` entries for every ready server.
pub fn acp_servers(discovery: &Discovery) -> Vec<Value> {
  discovery
    .servers
    .iter()
    .filter(|s| s.status == Status::Ready)
    .map(|s| match &s.transport {
      Transport::Stdio { command, args, env } => json!({ "name": s.name, "command": command, "args": args, "env": pairs(env) }),
      Transport::Http { url, headers } => json!({ "type": "http", "name": s.name, "url": url, "headers": pairs(headers) }),
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn write(path: &Path, value: Value) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, serde_json::to_string(&value).unwrap()).unwrap();
  }

  fn fixture() -> (tempfile::TempDir, Roots, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    let appdata = dir.path().join("appdata");
    let plugin_root = dir.path().join("plugins").join("demo");
    let bin = dir.path().join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("tool.exe"), b"").unwrap();
    std::fs::write(bin.join("npx.cmd"), b"").unwrap();

    write(&home.join(".claude").join("settings.json"), json!({ "enabledPlugins": { "demo@mkt": true, "off@mkt": false } }));
    write(
      &home.join(".claude").join("plugins").join("installed_plugins.json"),
      json!({ "version": 2, "plugins": { "demo@mkt": [{ "installPath": plugin_root.to_string_lossy() }] } }),
    );
    write(&plugin_root.join(".mcp.json"), json!({ "mcpServers": { "Devtools": { "command": "npx", "args": ["-y", "${CLAUDE_PLUGIN_ROOT}/x"] } } }));
    std::fs::create_dir_all(plugin_root.join("skills").join("alpha")).unwrap();
    std::fs::write(plugin_root.join("skills").join("alpha").join("SKILL.md"), "---\nname: alpha\n---").unwrap();
    std::fs::create_dir_all(home.join(".claude").join("skills").join("empty")).unwrap();

    write(
      &appdata.join("Claude").join("claude_desktop_config.json"),
      json!({ "mcpServers": { "obsidian": { "command": "tool", "env": { "API_TOKEN": "secret" } }, "ghost": { "command": "missing-binary" } } }),
    );
    write(
      &home.join(".claude.json"),
      json!({
        "mcpServers": { "remote": { "type": "http", "url": "https://mcp.example/x", "headers": { "Authorization": "Bearer t" } }, "old": { "type": "sse", "url": "https://x" } },
        "projects": {
          "c:/Work/App": { "mcpServers": { "lower": { "command": "tool" } } },
          "C:\\Work\\App\\": { "mcpServers": { "upper": { "command": "tool" }, "obsidian": { "command": "tool" } } }
        }
      }),
    );
    let roots = Roots { home, appdata: Some(appdata) };
    (dir, roots, bin)
  }

  #[test]
  fn merges_sources_and_resolves_commands() {
    let (_dir, roots, bin) = fixture();
    let env = vec![("PATH".to_string(), bin.to_string_lossy().into_owned()), ("PATHEXT".to_string(), ".EXE;.CMD".to_string())];
    let found = discover(&roots, Some(Path::new("C:/work/app")), &env, &["remote".to_string()]);
    let by_name = |n: &str| found.servers.iter().find(|s| s.name == n).unwrap();

    // Plugin server keeps name case and runs its .cmd shim through cmd.exe.
    let devtools = by_name("Devtools");
    assert_eq!(devtools.status, Status::Ready);
    match &devtools.transport {
      Transport::Stdio { command, args, .. } => {
        assert!(command.to_ascii_lowercase().ends_with("cmd.exe"));
        assert_eq!(args[0], "/d");
        assert!(args[2].ends_with("npx.cmd"));
        assert!(!args.iter().any(|a| a.contains("${CLAUDE_PLUGIN_ROOT}")));
      }
      _ => panic!("stdio expected"),
    }
    // Both case variants of the project key are merged.
    assert!(found.servers.iter().any(|s| s.name == "lower"));
    assert!(found.servers.iter().any(|s| s.name == "upper"));
    // The project entry replaces Claude Desktop's obsidian.
    assert_eq!(by_name("obsidian").source, "Claude Code (project)");
    assert_eq!(by_name("ghost").status, Status::Unavailable);
    assert_eq!(by_name("old").status, Status::Unsupported);
    assert_eq!(by_name("remote").status, Status::Disabled);

    assert_eq!(found.skill_dirs.len(), 1);
    assert!(found.skill_dirs[0].ends_with("/skills"));
    assert!(!found.skill_dirs[0].contains('\\'));

    let acp = acp_servers(&found);
    assert!(acp.iter().all(|s| s["name"] != "ghost" && s["name"] != "remote"));
    let summary = summarize(&found);
    let text = serde_json::to_string(&summary).unwrap();
    assert!(!text.contains("Bearer t"));
    assert!(text.contains("Authorization"));
  }
}
