/**
 * Webview side of the Nebula native module (src-tauri/src/harness/). Desktop
 * only: nothing from `@tauri-apps/*` loads until a function here is called.
 */
import type { ProbeResult } from "./modelRouter";
import type { Effort, Mode, NebulaConfig } from "./types";

let tauriCore: Promise<typeof import("@tauri-apps/api/core")> | undefined;
let tauriEvent: Promise<typeof import("@tauri-apps/api/event")> | undefined;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  tauriCore ??= import("@tauri-apps/api/core");
  const core = await tauriCore;
  try {
    return await core.invoke<T>(cmd, args);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  tauriEvent ??= import("@tauri-apps/api/event");
  const mod = await tauriEvent;
  return mod.listen<T>(event, (e) => handler(e.payload));
}

export interface EnvStatus {
  node: string | null;
  claude: string | null;
  dshVersion: string;
  runtimeInstalled: boolean;
  keys: KeyStatus;
}

export interface KeyStatus {
  nvidia: boolean;
  omniroute: boolean;
}

export interface McpServerSummary {
  name: string;
  source: string;
  transport: "stdio" | "http";
  status: "ready" | "unavailable" | "unsupported" | "disabled";
  reason: string | null;
  envKeys: string[];
}

export interface DiscoverySummary {
  servers: McpServerSummary[];
  skillDirs: string[];
}

export interface Started {
  procId: number;
  reused: boolean;
}

export interface ClaudeStartOpts {
  chatId: string;
  cwd: string;
  model: string;
  effort: Effort;
  mode: Mode;
  sessionId: string;
  resume: boolean;
}

export interface LineEvent {
  procId: number;
  line: string;
}

export interface ExitEvent {
  procId: number;
  kind: "dsh" | "claude";
  key: string;
  code: number | null;
}

export const harnessNative = {
  envStatus: () => invoke<EnvStatus>("harness_env_status"),
  installRuntime: () => invoke<void>("harness_install_runtime"),
  getConfig: () => invoke<NebulaConfig>("harness_get_config"),
  setConfig: (config: NebulaConfig) => invoke<void>("harness_set_config", { config }),
  setKey: (provider: "nvidia" | "omniroute", key: string | null) => invoke<KeyStatus>("harness_set_key", { provider, key }),
  discover: (cwd?: string) => invoke<DiscoverySummary>("harness_discover", { cwd: cwd ?? null }),
  probe: (provider: "nvidia" | "omniroute") => invoke<ProbeResult>("harness_probe", { provider }),
  dshStart: (workspace: string) => invoke<Started>("harness_dsh_start", { workspace }),
  acpOpenSession: (procId: number, rpcId: number, cwd: string, sessionId: string | null, withMcp: boolean) =>
    invoke<string[]>("harness_acp_open_session", { procId, rpcId, cwd, sessionId, withMcp }),
  claudeStart: (opts: ClaudeStartOpts) => invoke<Started>("harness_claude_start", { opts }),
  send: (procId: number, line: string) => invoke<void>("harness_send", { procId, line }),
  kill: (procId: number) => invoke<void>("harness_kill", { procId }),
  reset: () => invoke<void>("harness_reset"),
  pickFolder: (start?: string) => invoke<string | null>("harness_pick_folder", { start: start ?? null }),
  createProject: (root: string, name: string) => invoke<string>("harness_create_project", { root, name }),
  stateLoad: () => invoke<string | null>("harness_state_load"),
  stateSave: (json: string) => invoke<void>("harness_state_save", { json }),
  chatLoad: (id: string) => invoke<string | null>("harness_chat_load", { id }),
  chatSave: (id: string, json: string) => invoke<void>("harness_chat_save", { id, json }),
  chatDelete: (id: string) => invoke<void>("harness_chat_delete", { id }),
  onLine: (handler: (event: LineEvent) => void) => listen<LineEvent>("harness://line", handler),
  onExit: (handler: (event: ExitEvent) => void) => listen<ExitEvent>("harness://exit", handler),
  onInstall: (handler: (line: string) => void) => listen<string>("harness://install", handler),
};

export type HarnessNative = typeof harnessNative;
