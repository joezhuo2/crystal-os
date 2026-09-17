/**
 * Nebula tab state: projects, chat index, open transcripts, token totals,
 * default chat options, and the backdrop theme. Same module-store pattern as
 * `portalStore.ts`. Engines are driven by `session.ts`; this module only holds
 * and persists state.
 */
import { addCounts, mergeLedgers } from "./tokenLedger";
import type {
  ChatFile,
  ChatMessage,
  ChatMeta,
  Effort,
  Ledger,
  Mode,
  NebulaConfig,
  NebulaTheme,
  ProjectRecord,
  StateFile,
  Tier,
} from "./types";
import { DEFAULT_THEME } from "./types";
import type { DiscoverySummary, EnvStatus } from "./native";

export const THEME_KEY = "crystal-os-nebula-theme";
export const PREFS_KEY = "crystal-os-nebula-prefs";
export const ACTIVE_KEY = "crystal-os-nebula-active-chat";

export interface ChatRuntime {
  loaded: boolean;
  messages: ChatMessage[];
  tokens: Ledger;
  running: boolean;
  /** Stop was pressed and the engine has not finished yet. */
  stopping: boolean;
  /** Dismissible warning shown above the transcript (e.g. MCP servers dropped). */
  banner: string | null;
}

export interface Prefs {
  tier: Tier;
  effort: Effort;
  mode: Mode;
}

export interface HarnessState {
  hydrated: boolean;
  env: EnvStatus | null;
  config: NebulaConfig | null;
  discovery: DiscoverySummary | null;
  projects: ProjectRecord[];
  chats: ChatMeta[];
  allTime: Ledger;
  /** Totals per project id, kept after its chats are deleted. */
  projectTokens: Record<string, Ledger>;
  activeChatId: string | null;
  runtime: Record<string, ChatRuntime>;
  prefs: Prefs;
  theme: NebulaTheme;
  installing: boolean;
  installLog: string[];
}

export interface Persistence {
  saveState(json: string): Promise<void>;
  saveChat(id: string, json: string): Promise<void>;
  deleteChat(id: string): Promise<void>;
}

const DEFAULT_PREFS: Prefs = { tier: "medium", effort: "high", mode: "auto" };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the change still applies for this session.
  }
}

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

export function parseTheme(raw: string | null): NebulaTheme {
  try {
    const t = raw ? JSON.parse(raw) : null;
    if (!t || typeof t !== "object") return DEFAULT_THEME;
    const colors = Array.isArray(t.colors) && t.colors.length === 3 && t.colors.every(isHex) ? (t.colors as [string, string, string]) : DEFAULT_THEME.colors;
    return {
      colors,
      swirlSpeed: clamp(t.swirlSpeed, 0, 3, DEFAULT_THEME.swirlSpeed),
      stars: {
        enabled: typeof t.stars?.enabled === "boolean" ? t.stars.enabled : DEFAULT_THEME.stars.enabled,
        density: clamp(t.stars?.density, 0, 1, DEFAULT_THEME.stars.density),
      },
    };
  } catch {
    return DEFAULT_THEME;
  }
}

const TIER_IDS: Tier[] = ["low", "medium", "high"];
const EFFORT_IDS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const MODE_IDS: Mode[] = ["auto", "manual", "plan"];

function parsePrefs(raw: string | null): Prefs {
  try {
    const p = raw ? JSON.parse(raw) : {};
    return {
      tier: TIER_IDS.includes(p.tier) ? p.tier : DEFAULT_PREFS.tier,
      effort: EFFORT_IDS.includes(p.effort) ? p.effort : DEFAULT_PREFS.effort,
      mode: MODE_IDS.includes(p.mode) ? p.mode : DEFAULT_PREFS.mode,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export interface ParsedState extends Pick<StateFile, "projects" | "chats" | "tokens"> {
  /** null when the file predates per-project totals and they must be rebuilt. */
  projectTokens: Record<string, Ledger> | null;
}

export function parseStateFile(raw: string | null): ParsedState {
  try {
    const doc = raw ? JSON.parse(raw) : null;
    if (!doc || doc.version !== 1) return { projects: [], chats: [], tokens: {}, projectTokens: {} };
    const projects = Array.isArray(doc.projects) ? doc.projects.filter((p: ProjectRecord) => p && typeof p.id === "string" && typeof p.path === "string") : [];
    const chats = Array.isArray(doc.chats)
      ? doc.chats
          .filter((c: ChatMeta) => c && typeof c.id === "string" && projects.some((p: ProjectRecord) => p.id === c.projectId))
          .map((c: ChatMeta) => ({
            ...c,
            tier: TIER_IDS.includes(c.tier) ? c.tier : DEFAULT_PREFS.tier,
            effort: EFFORT_IDS.includes(c.effort) ? c.effort : DEFAULT_PREFS.effort,
            mode: MODE_IDS.includes(c.mode) ? c.mode : DEFAULT_PREFS.mode,
            pinned: Boolean(c.pinned),
          }))
      : [];
    const projectTokens = doc.projectTokens && typeof doc.projectTokens === "object" ? doc.projectTokens : null;
    return { projects, chats, tokens: doc.tokens && typeof doc.tokens === "object" ? doc.tokens : {}, projectTokens };
  } catch {
    return { projects: [], chats: [], tokens: {}, projectTokens: {} };
  }
}

export function parseChatFile(raw: string | null): Pick<ChatFile, "messages" | "tokens"> {
  try {
    const doc = raw ? JSON.parse(raw) : null;
    if (!doc || doc.version !== 1) return { messages: [], tokens: {} };
    return { messages: Array.isArray(doc.messages) ? doc.messages : [], tokens: doc.tokens && typeof doc.tokens === "object" ? doc.tokens : {} };
  } catch {
    return { messages: [], tokens: {} };
  }
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

function initial(): HarnessState {
  return {
    hydrated: false,
    env: null,
    config: null,
    discovery: null,
    projects: [],
    chats: [],
    allTime: {},
    projectTokens: {},
    activeChatId: null,
    runtime: {},
    prefs: parsePrefs(read(PREFS_KEY)),
    theme: parseTheme(read(THEME_KEY)),
    installing: false,
    installLog: [],
  };
}

let state: HarnessState = initial();
const listeners = new Set<() => void>();
let persistence: Persistence | null = null;

function set(next: HarnessState) {
  state = next;
  listeners.forEach((l) => l());
}

function patchRuntime(id: string, fn: (rt: ChatRuntime) => ChatRuntime) {
  const current = state.runtime[id] ?? { loaded: false, messages: [], tokens: {}, running: false, stopping: false, banner: null };
  set({ ...state, runtime: { ...state.runtime, [id]: fn(current) } });
}

function saveState() {
  if (!persistence || !state.hydrated) return;
  const doc: StateFile = { version: 1, projects: state.projects, chats: state.chats, tokens: state.allTime, projectTokens: state.projectTokens };
  persistence.saveState(JSON.stringify(doc)).catch((err) => console.warn("[nebula] could not save state", err));
}

export const harness = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setPersistence(p: Persistence | null) {
    persistence = p;
  },

  /** Returns true when per-project totals must be rebuilt with `backfillProjectTokens`. */
  hydrate(raw: string | null): boolean {
    const parsed = parseStateFile(raw);
    const active = read(ACTIVE_KEY);
    set({
      ...state,
      hydrated: true,
      projects: parsed.projects,
      chats: parsed.chats,
      allTime: parsed.tokens,
      projectTokens: parsed.projectTokens ?? {},
      activeChatId: parsed.chats.some((c) => c.id === active) ? active : null,
    });
    return parsed.projectTokens === null && parsed.chats.length > 0;
  },

  /** Rebuilds per-project totals from saved chat files (state files written before they existed). */
  backfillProjectTokens(files: { chatId: string; raw: string | null }[]) {
    let projectTokens = state.projectTokens;
    for (const { chatId, raw } of files) {
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) continue;
      const { tokens } = parseChatFile(raw);
      if (Object.keys(tokens).length) projectTokens = { ...projectTokens, [chat.projectId]: mergeLedgers(projectTokens[chat.projectId] ?? {}, tokens) };
    }
    set({ ...state, projectTokens });
    saveState();
  },

  setEnv(env: EnvStatus | null) {
    set({ ...state, env });
  },

  setConfig(config: NebulaConfig | null) {
    set({ ...state, config });
  },

  setDiscovery(discovery: DiscoverySummary | null) {
    set({ ...state, discovery });
  },

  setInstalling(installing: boolean) {
    set({ ...state, installing, installLog: installing ? [] : state.installLog });
  },

  appendInstallLog(line: string) {
    set({ ...state, installLog: [...state.installLog.slice(-199), line] });
  },

  /* Projects */

  addProject(name: string, path: string): ProjectRecord {
    const existing = state.projects.find((p) => p.path.toLowerCase() === path.toLowerCase());
    if (existing) return existing;
    const project: ProjectRecord = { id: newId(), name, path, createdAt: Date.now() };
    set({ ...state, projects: [...state.projects, project] });
    saveState();
    return project;
  },

  /** Removes the project from Nebula (its folder is left alone) with its chats. */
  removeProject(id: string): string[] {
    const removed = state.chats.filter((c) => c.projectId === id).map((c) => c.id);
    const runtime = { ...state.runtime };
    removed.forEach((chatId) => delete runtime[chatId]);
    const projectTokens = { ...state.projectTokens };
    delete projectTokens[id];
    set({
      ...state,
      projects: state.projects.filter((p) => p.id !== id),
      projectTokens,
      chats: state.chats.filter((c) => c.projectId !== id),
      runtime,
      activeChatId: removed.includes(state.activeChatId ?? "") ? null : state.activeChatId,
    });
    removed.forEach((chatId) => persistence?.deleteChat(chatId).catch(() => undefined));
    saveState();
    return removed;
  },

  /* Chats */

  createChat(projectId: string): ChatMeta {
    const now = Date.now();
    const chat: ChatMeta = { id: newId(), projectId, title: "New chat", createdAt: now, updatedAt: now, pinned: false, ...state.prefs };
    set({
      ...state,
      chats: [...state.chats, chat],
      activeChatId: chat.id,
      runtime: { ...state.runtime, [chat.id]: { loaded: true, messages: [], tokens: {}, running: false, stopping: false, banner: null } },
    });
    write(ACTIVE_KEY, chat.id);
    saveState();
    return chat;
  },

  /** Folder clicked: open the project's unused chat, or start one. */
  openProjectChat(projectId: string): ChatMeta {
    const unused = selectProjectChats(state, projectId).find((c) => isUnusedChat(state, c));
    if (!unused) return harness.createChat(projectId);
    harness.setActiveChat(unused.id);
    return unused;
  },

  setActiveChat(id: string | null) {
    set({ ...state, activeChatId: id });
    write(ACTIVE_KEY, id);
  },

  loadChat(id: string, raw: string | null) {
    const parsed = parseChatFile(raw);
    patchRuntime(id, (rt) => (rt.loaded ? rt : { ...rt, loaded: true, messages: parsed.messages, tokens: parsed.tokens }));
  },

  updateChat(id: string, patch: Partial<Omit<ChatMeta, "id" | "projectId" | "createdAt">>) {
    set({ ...state, chats: state.chats.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    saveState();
  },

  renameChat(id: string, title: string) {
    const trimmed = title.trim().slice(0, 120);
    if (trimmed) harness.updateChat(id, { title: trimmed });
  },

  togglePin(id: string) {
    const chat = state.chats.find((c) => c.id === id);
    if (chat) harness.updateChat(id, { pinned: !chat.pinned });
  },

  deleteChat(id: string) {
    const runtime = { ...state.runtime };
    delete runtime[id];
    set({
      ...state,
      chats: state.chats.filter((c) => c.id !== id),
      runtime,
      activeChatId: state.activeChatId === id ? null : state.activeChatId,
    });
    if (state.activeChatId === null) write(ACTIVE_KEY, null);
    persistence?.deleteChat(id).catch(() => undefined);
    saveState();
  },

  /**
   * Changes a chat's tier, effort, or mode (and the defaults for new chats).
   * Tier and effort cannot change while a turn is running; returns false then.
   */
  setChatOptions(id: string | null, options: Partial<Prefs>): boolean {
    const running = id ? Boolean(state.runtime[id]?.running) : false;
    if (running && (options.tier !== undefined || options.effort !== undefined)) return false;
    const prefs = { ...state.prefs, ...options };
    write(PREFS_KEY, JSON.stringify(prefs));
    set({ ...state, prefs });
    if (id) harness.updateChat(id, options);
    return true;
  },

  setRunning(id: string, running: boolean) {
    patchRuntime(id, (rt) => ({ ...rt, running, stopping: running ? rt.stopping : false }));
  },

  setStopping(id: string, stopping: boolean) {
    patchRuntime(id, (rt) => ({ ...rt, stopping }));
  },

  setBanner(id: string, banner: string | null) {
    patchRuntime(id, (rt) => ({ ...rt, banner }));
  },

  appendMessage(id: string, message: ChatMessage) {
    patchRuntime(id, (rt) => ({ ...rt, messages: [...rt.messages, message] }));
    const chat = state.chats.find((c) => c.id === id);
    if (chat) {
      const firstUser = message.role === "user" && chat.title === "New chat";
      const text = message.blocks.find((b) => b.kind === "text");
      harness.updateChat(id, {
        updatedAt: Date.now(),
        ...(firstUser && text && text.kind === "text" ? { title: text.text.replace(/\s+/g, " ").trim().slice(0, 60) || chat.title } : {}),
      });
    }
  },

  updateMessage(id: string, messageId: string, fn: (message: ChatMessage) => ChatMessage) {
    patchRuntime(id, (rt) => ({ ...rt, messages: rt.messages.map((m) => (m.id === messageId ? fn(m) : m)) }));
  },

  /** Rewrites every message (used to cancel pending permission cards). */
  mapMessages(id: string, fn: (message: ChatMessage) => ChatMessage) {
    patchRuntime(id, (rt) => ({ ...rt, messages: rt.messages.map(fn) }));
  },

  addTokens(id: string, ledger: Ledger) {
    if (Object.keys(ledger).length === 0) return;
    patchRuntime(id, (rt) => ({ ...rt, tokens: mergeLedgers(rt.tokens, ledger) }));
    const projectId = state.chats.find((c) => c.id === id)?.projectId;
    const projectTokens = projectId ? { ...state.projectTokens, [projectId]: mergeLedgers(state.projectTokens[projectId] ?? {}, ledger) } : state.projectTokens;
    set({ ...state, allTime: mergeLedgers(state.allTime, ledger), projectTokens });
    saveState();
  },

  resetAllTime() {
    set({ ...state, allTime: {} });
    saveState();
  },

  /** Saves one chat's transcript. Called at every committed message. */
  persistChat(id: string) {
    const rt = state.runtime[id];
    if (!persistence || !rt?.loaded) return;
    const doc: ChatFile = { version: 1, id, messages: rt.messages, tokens: rt.tokens };
    persistence.saveChat(id, JSON.stringify(doc)).catch((err) => console.warn("[nebula] could not save chat", err));
  },

  /* Theme */

  setTheme(patch: Partial<NebulaTheme>) {
    const theme = parseTheme(JSON.stringify({ ...state.theme, ...patch, stars: { ...state.theme.stars, ...(patch.stars ?? {}) } }));
    write(THEME_KEY, JSON.stringify(theme));
    set({ ...state, theme });
  },

  resetTheme() {
    write(THEME_KEY, null);
    set({ ...state, theme: DEFAULT_THEME });
  },

  /** Test helper: reload from storage and forget everything else. */
  _reset() {
    persistence = null;
    state = initial();
    listeners.forEach((l) => l());
  },
};

export { addCounts, newId };

/** Chats in a project: pinned first, then most recently active. */
export function selectProjectChats(s: HarnessState, projectId: string): ChatMeta[] {
  return s.chats
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

/** A chat nobody has typed into yet (safe to reuse instead of creating another). */
export function isUnusedChat(s: HarnessState, chat: ChatMeta): boolean {
  const rt = s.runtime[chat.id];
  return chat.title === "New chat" && !chat.pinned && chat.updatedAt === chat.createdAt && !rt?.running && !rt?.messages.length;
}

export function selectProjectTokens(s: HarnessState, projectId: string): Ledger {
  return s.projectTokens[projectId] ?? {};
}

export function selectActiveChat(s: HarnessState): ChatMeta | null {
  return s.chats.find((c) => c.id === s.activeChatId) ?? null;
}
