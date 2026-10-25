import { useSyncExternalStore } from "react";

export const PROJECT_INSTRUCTIONS_KEY = "crystal-os-nebula-project-instructions";
export const INSTRUCTIONS_MAX_CHARS = 8000;
export const INSTRUCTIONS_PREAMBLE = "Project instructions from the user (follow them for this whole conversation):";

export type InstructionsByProject = Record<string, string>;

export function parseProjectInstructions(raw: string | null): InstructionsByProject {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: InstructionsByProject = {};
    for (const [projectId, text] of Object.entries(data)) {
      if (typeof text === "string" && text.trim()) out[projectId] = text;
    }
    return out;
  } catch {
    return {};
  }
}

export function withInstructions(instructions: string | undefined, prompt: string): string {
  const text = instructions?.trim();
  return text ? `${INSTRUCTIONS_PREAMBLE}\n${text}\n\n${prompt}` : prompt;
}

function load(): InstructionsByProject {
  try {
    return parseProjectInstructions(localStorage.getItem(PROJECT_INSTRUCTIONS_KEY));
  } catch {
    return {};
  }
}

let state = load();
const listeners = new Set<() => void>();

function commit(next: InstructionsByProject) {
  state = next;
  try {
    localStorage.setItem(PROJECT_INSTRUCTIONS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

export const projectInstructions = {
  getState: () => state,
  forProject: (projectId: string) => state[projectId] ?? "",

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  set(projectId: string, text: string) {
    const t = text.trim().slice(0, INSTRUCTIONS_MAX_CHARS);
    if (!t) return this.removeProject(projectId);
    commit({ ...state, [projectId]: t });
  },

  removeProject(projectId: string) {
    if (!(projectId in state)) return;
    const next = { ...state };
    delete next[projectId];
    commit(next);
  },

  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useProjectInstructions() {
  return useSyncExternalStore(projectInstructions.subscribe, projectInstructions.getState);
}
