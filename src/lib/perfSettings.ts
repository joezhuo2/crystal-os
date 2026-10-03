/**
 * Performance settings, shared by Settings, the view loader, the Portal
 * unloader, and the query client. Persisted in localStorage; every change
 * applies at once.
 */

import { useSyncExternalStore } from "react";

export const PERF_MODE_KEY = "crystal-os-performance-mode";
export const UNLOAD_DELAY_KEY = "crystal-os-portal-unload-delay";

/** Seconds a Portal app with "Keep loaded" off may stay hidden before it is unloaded. */
export const DEFAULT_UNLOAD_DELAY = 60;
export const MAX_UNLOAD_DELAY = 3600;

export interface PerfSettings {
  /**
   * Loads the main views only when first opened, drops cached data sooner,
   * and turns off page transitions and backdrop animation.
   */
  performanceMode: boolean;
  /** Seconds, 0 to MAX_UNLOAD_DELAY. */
  unloadDelay: number;
}

/** Whole seconds within range. Anything unreadable falls back to the default. */
export function clampUnloadDelay(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_UNLOAD_DELAY;
  return Math.min(MAX_UNLOAD_DELAY, Math.max(0, Math.round(n)));
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

function load(): PerfSettings {
  const delay = read(UNLOAD_DELAY_KEY);
  return {
    performanceMode: read(PERF_MODE_KEY) === "1",
    unloadDelay: delay === null ? DEFAULT_UNLOAD_DELAY : clampUnloadDelay(delay),
  };
}

let state: PerfSettings = load();
const listeners = new Set<() => void>();

function set(next: PerfSettings) {
  state = next;
  listeners.forEach((l) => l());
}

export const perfSettings = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setPerformanceMode(on: boolean) {
    if (on === state.performanceMode) return;
    write(PERF_MODE_KEY, on ? "1" : "0");
    set({ ...state, performanceMode: on });
  },

  setUnloadDelay(value: unknown) {
    const unloadDelay = clampUnloadDelay(value);
    if (unloadDelay === state.unloadDelay) return;
    write(UNLOAD_DELAY_KEY, String(unloadDelay));
    set({ ...state, unloadDelay });
  },

  /** Test hook: reload from storage. */
  _reset() {
    set(load());
  },
};

export function usePerfSettings() {
  return useSyncExternalStore(perfSettings.subscribe, perfSettings.getState);
}
