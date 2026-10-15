/**
 * Performance settings, shared by Settings, the view loader, the Portal
 * unloader, and the query client. Persisted in localStorage; every change
 * applies at once.
 */

import { useSyncExternalStore } from "react";

export const PERF_MODE_KEY = "crystal-os-performance-mode";
export const UNLOAD_DELAY_KEY = "crystal-os-portal-unload-delay";
export const LAZY_VIEWS_KEY = "crystal-os-perf-lazy-views";
export const FREE_CACHE_KEY = "crystal-os-perf-free-cache";
export const CACHE_MINUTES_KEY = "crystal-os-perf-cache-minutes";
export const REDUCE_TRANSITIONS_KEY = "crystal-os-perf-no-transitions";
export const STILL_BACKDROPS_KEY = "crystal-os-perf-still-backdrops";

/** Seconds a Portal app with "Keep loaded" off may stay hidden before it is unloaded. */
export const DEFAULT_UNLOAD_DELAY = 60;
export const MAX_UNLOAD_DELAY = 3600;

/** Minutes unused data is kept when freeing cached data is on; CACHE_MINUTES_OFF is the time when it is off. */
export const DEFAULT_CACHE_MINUTES = 1;
export const MAX_CACHE_MINUTES = 60;
export const CACHE_MINUTES_OFF = 5;

export interface PerfSettings {
  /** Master switch: true only while all four switches below are on. */
  performanceMode: boolean;
  /** Load the main views only when first opened, with no fetching ahead. */
  lazyViews: boolean;
  /** Drop data no view is using after `cacheMinutes` instead of five minutes. */
  freeCache: boolean;
  /** Minutes, 1 to MAX_CACHE_MINUTES. Used only while `freeCache` is on. */
  cacheMinutes: number;
  /** Page transitions and CSS animations jump to their end state. */
  reduceTransitions: boolean;
  /** The page backdrops hold still. */
  stillBackdrops: boolean;
  /** Seconds, 0 to MAX_UNLOAD_DELAY. */
  unloadDelay: number;
}

type Switch = "lazyViews" | "freeCache" | "reduceTransitions" | "stillBackdrops";

const SWITCH_KEYS: Record<Switch, string> = {
  lazyViews: LAZY_VIEWS_KEY,
  freeCache: FREE_CACHE_KEY,
  reduceTransitions: REDUCE_TRANSITIONS_KEY,
  stillBackdrops: STILL_BACKDROPS_KEY,
};

const SWITCHES = Object.keys(SWITCH_KEYS) as Switch[];

/** Whole seconds within range. Anything unreadable falls back to the default. */
export function clampUnloadDelay(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_UNLOAD_DELAY;
  return Math.min(MAX_UNLOAD_DELAY, Math.max(0, Math.round(n)));
}

/** Whole minutes within range. Anything unreadable falls back to the default. */
export function clampCacheMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_CACHE_MINUTES;
  return Math.min(MAX_CACHE_MINUTES, Math.max(1, Math.round(n)));
}

/** Milliseconds unused data stays cached under these settings. */
export function cacheTimeMs(s: Pick<PerfSettings, "freeCache" | "cacheMinutes">): number {
  return (s.freeCache ? s.cacheMinutes : CACHE_MINUTES_OFF) * 60_000;
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

function withMode(s: Omit<PerfSettings, "performanceMode">): PerfSettings {
  return { ...s, performanceMode: SWITCHES.every((k) => s[k]) };
}

function load(): PerfSettings {
  // Before the individual switches existed, one flag held all four.
  const legacy = read(PERF_MODE_KEY) === "1";
  const flag = (key: string) => {
    const v = read(key);
    return v === null ? legacy : v === "1";
  };
  const delay = read(UNLOAD_DELAY_KEY);
  const minutes = read(CACHE_MINUTES_KEY);
  return withMode({
    lazyViews: flag(LAZY_VIEWS_KEY),
    freeCache: flag(FREE_CACHE_KEY),
    cacheMinutes: minutes === null ? DEFAULT_CACHE_MINUTES : clampCacheMinutes(minutes),
    reduceTransitions: flag(REDUCE_TRANSITIONS_KEY),
    stillBackdrops: flag(STILL_BACKDROPS_KEY),
    unloadDelay: delay === null ? DEFAULT_UNLOAD_DELAY : clampUnloadDelay(delay),
  });
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

  /** Turns all four switches on or off together. */
  setPerformanceMode(on: boolean) {
    if (on === state.performanceMode && SWITCHES.every((k) => state[k] === on)) return;
    write(PERF_MODE_KEY, on ? "1" : "0");
    for (const k of SWITCHES) write(SWITCH_KEYS[k], on ? "1" : "0");
    set(withMode({ ...state, lazyViews: on, freeCache: on, reduceTransitions: on, stillBackdrops: on }));
  },

  setSwitch(key: Switch, on: boolean) {
    if (state[key] === on) return;
    write(SWITCH_KEYS[key], on ? "1" : "0");
    set(withMode({ ...state, [key]: on }));
  },

  setCacheMinutes(value: unknown) {
    const cacheMinutes = clampCacheMinutes(value);
    if (cacheMinutes === state.cacheMinutes) return;
    write(CACHE_MINUTES_KEY, String(cacheMinutes));
    set(withMode({ ...state, cacheMinutes }));
  },

  setUnloadDelay(value: unknown) {
    const unloadDelay = clampUnloadDelay(value);
    if (unloadDelay === state.unloadDelay) return;
    write(UNLOAD_DELAY_KEY, String(unloadDelay));
    set(withMode({ ...state, unloadDelay }));
  },

  /** Test hook: reload from storage. */
  _reset() {
    set(load());
  },
};

export function usePerfSettings() {
  return useSyncExternalStore(perfSettings.subscribe, perfSettings.getState);
}
