import { useSyncExternalStore } from "react";

export const SAVED_PROMPTS_KEY = "crystal-os-nebula-saved-prompts";

export interface SavedPrompt {
  id: string;
  title: string;
  body: string;
}

export type PromptsByProject = Record<string, SavedPrompt[]>;

export function parseSavedPrompts(raw: string | null): PromptsByProject {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: PromptsByProject = {};
    for (const [projectId, list] of Object.entries(data)) {
      if (!Array.isArray(list)) continue;
      const prompts = list.filter(
        (p): p is SavedPrompt => !!p && typeof p.id === "string" && typeof p.title === "string" && typeof p.body === "string",
      );
      if (prompts.length) out[projectId] = prompts;
    }
    return out;
  } catch {
    return {};
  }
}

function load(): PromptsByProject {
  try {
    return parseSavedPrompts(localStorage.getItem(SAVED_PROMPTS_KEY));
  } catch {
    return {};
  }
}

let state = load();
let pending: string | null = null;
const listeners = new Set<() => void>();

function commit(next: PromptsByProject) {
  state = next;
  try {
    localStorage.setItem(SAVED_PROMPTS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

const NONE: SavedPrompt[] = [];

export const savedPrompts = {
  getState: () => state,
  forProject: (projectId: string) => state[projectId] ?? NONE,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  add(projectId: string, title: string, body: string): SavedPrompt | null {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return null;
    const prompt = { id: crypto.randomUUID(), title: t, body: b };
    commit({ ...state, [projectId]: [...(state[projectId] ?? []), prompt] });
    return prompt;
  },

  update(projectId: string, id: string, title: string, body: string) {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b || !state[projectId]?.some((p) => p.id === id)) return;
    commit({ ...state, [projectId]: state[projectId].map((p) => (p.id === id ? { ...p, title: t, body: b } : p)) });
  },

  remove(projectId: string, id: string) {
    const list = state[projectId];
    if (!list?.some((p) => p.id === id)) return;
    const rest = list.filter((p) => p.id !== id);
    const next = { ...state };
    if (rest.length) next[projectId] = rest;
    else delete next[projectId];
    commit(next);
  },

  removeProject(projectId: string) {
    if (!(projectId in state)) return;
    const next = { ...state };
    delete next[projectId];
    commit(next);
  },

  queueInsert(body: string) {
    pending = body;
    listeners.forEach((l) => l());
  },

  takeInsert(): string | null {
    const body = pending;
    pending = null;
    return body;
  },

  getPending: () => pending,

  _reset() {
    state = load();
    pending = null;
    listeners.forEach((l) => l());
  },
};

export function useSavedPrompts() {
  return useSyncExternalStore(savedPrompts.subscribe, savedPrompts.getState);
}

export function usePendingInsert() {
  return useSyncExternalStore(savedPrompts.subscribe, savedPrompts.getPending);
}
