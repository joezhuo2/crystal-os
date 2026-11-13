import { useSyncExternalStore } from "react";

export type Theme = "default" | "orbit";

export const THEME_KEY = "crystal-os-theme";
export const FLUX_LINES_KEY = "crystal-os-flux-lines";

export interface ThemeSettings {
  theme: Theme;
  fluxLines: boolean;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the change still applies for this session.
  }
}

function load(): ThemeSettings {
  return { theme: read(THEME_KEY) === "orbit" ? "orbit" : "default", fluxLines: read(FLUX_LINES_KEY) !== "0" };
}

let state: ThemeSettings = load();
const listeners = new Set<() => void>();

function set(next: ThemeSettings) {
  state = next;
  listeners.forEach((l) => l());
}

export const themeSettings = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setTheme(theme: Theme) {
    if (theme === state.theme) return;
    write(THEME_KEY, theme);
    set({ ...state, theme });
  },

  setFluxLines(on: boolean) {
    if (on === state.fluxLines) return;
    write(FLUX_LINES_KEY, on ? "1" : "0");
    set({ ...state, fluxLines: on });
  },

  _reset() {
    set(load());
  },
};

export function useThemeSettings() {
  return useSyncExternalStore(themeSettings.subscribe, themeSettings.getState);
}
