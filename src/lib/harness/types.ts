/**
 * Shared types for the Nebula tab (ADR 0003). Chats are stored by Crystal OS;
 * dsh and claude only hold the session ids needed to resume.
 */

export type Tier = "low" | "medium" | "high";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Mode = "auto" | "manual" | "plan";
export type Engine = "dsh" | "claude";

export const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: "low", label: "Low", hint: "OmniRoute auto/coding" },
  { id: "medium", label: "Medium", hint: "Your NVIDIA NIM models in order, then OmniRoute" },
  { id: "high", label: "High", hint: "Claude Code" },
];

export const EFFORTS: { id: Effort; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
  { id: "max", label: "Max" },
];

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Runs tools without asking" },
  { id: "manual", label: "Manual", hint: "Asks before edits and commands" },
  { id: "plan", label: "Plan", hint: "Reads and plans, changes nothing" },
];

export function engineFor(tier: Tier): Engine {
  return tier === "high" ? "claude" : "dsh";
}

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";
export type PermissionStatus = "pending" | "allowed" | "denied" | "cancelled";

export type Block =
  | { kind: "text"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "tool"; id: string; title: string; toolKind?: string; status: ToolStatus; input?: string; output?: string }
  | { kind: "permission"; id: string; title: string; detail?: string; status: PermissionStatus }
  | { kind: "notice"; tone: "info" | "warning" | "error"; text: string }
  | { kind: "handoff"; from: Engine; to: Engine };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  engine?: Engine;
  /** Display model id that produced an assistant message. */
  model?: string;
  blocks: Block[];
  createdAt: number;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** True when any part of these counts is an estimate. */
  estimated: boolean;
}

/** Totals keyed by display model id. */
export type Ledger = Record<string, TokenCounts>;

/** How full the model's context window was after the latest step of a chat. */
export interface ContextUsage {
  /** Tokens in the context at that step. */
  used: number;
  /** The model's context window, or null when the engine does not say and the model is unknown. */
  size: number | null;
  /** Display model id the snapshot came from. */
  model: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface ChatMeta {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  tier: Tier;
  effort: Effort;
  mode: Mode;
  dshSessionId?: string;
  claudeSessionId?: string;
  /** Engine that answered last; switching engines inserts a handoff. */
  lastEngine?: Engine;
}

export interface ChatFile {
  version: 1;
  id: string;
  messages: ChatMessage[];
  tokens: Ledger;
  /** Missing in files written before v0.6.6. */
  context?: ContextUsage;
}

export interface StateFile {
  version: 1;
  projects: ProjectRecord[];
  chats: ChatMeta[];
  tokens: Ledger;
  /** Totals per project id. Missing in files written before v0.6.0; rebuilt from chat files. */
  projectTokens?: Record<string, Ledger>;
}

export interface NebulaTheme {
  colors: [string, string, string];
  /** Swirl speed multiplier; 0 freezes the nebula. */
  swirlSpeed: number;
  stars: { enabled: boolean; density: number };
}

export const DEFAULT_THEME: NebulaTheme = {
  colors: ["#6d28d9", "#db2777", "#0ea5e9"],
  swirlSpeed: 1,
  stars: { enabled: true, density: 0.5 },
};

/** Mirrors `NebulaConfig` in src-tauri/src/harness/config.rs. */
export interface NebulaConfig {
  omnirouteBaseUrl: string;
  omnirouteModel: string;
  nimBaseUrl: string;
  nimModels: { kimi: string; deepseek: string; nemotron: string };
  claudeModel: string;
  projectsRoot: string;
  disabledMcp: string[];
}
