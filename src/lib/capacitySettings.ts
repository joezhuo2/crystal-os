/**
 * The Engine's work window: the hours of the day that count as free time for
 * the "fits today?" bar (src/lib/capacity.ts). Persisted in localStorage as
 * one JSON object, per device; every change applies at once.
 */

import { useSyncExternalStore } from "react";
import { timeToMinutes, type CapacityWindow } from "@/lib/capacity";

export const CAPACITY_SETTINGS_KEY = "crystal-os-capacity";

export interface CapacitySettings {
  /** "HH:MM", when the work window opens. */
  dayStart: string;
  /** "HH:MM", when it closes. Always after dayStart. */
  dayEnd: string;
}

export const DEFAULT_CAPACITY_SETTINGS: CapacitySettings = { dayStart: "09:00", dayEnd: "17:00" };

/**
 * Reads stored settings. A missing or malformed time, or a window that does
 * not end after it starts, falls back to the default window as a whole.
 */
export function parseCapacitySettings(raw: string | null): CapacitySettings {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const stored = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const dayStart = typeof stored.dayStart === "string" ? stored.dayStart : "";
  const dayEnd = typeof stored.dayEnd === "string" ? stored.dayEnd : "";
  const start = timeToMinutes(dayStart);
  const end = timeToMinutes(dayEnd);
  if (start === null || end === null || end <= start) return { ...DEFAULT_CAPACITY_SETTINGS };
  return { dayStart, dayEnd };
}

/** The window in minutes after midnight. */
export function capacityWindow(settings: CapacitySettings): CapacityWindow {
  return { start: timeToMinutes(settings.dayStart) ?? 540, end: timeToMinutes(settings.dayEnd) ?? 1020 };
}

function load(): CapacitySettings {
  try {
    return parseCapacitySettings(localStorage.getItem(CAPACITY_SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_CAPACITY_SETTINGS };
  }
}

let state: CapacitySettings = load();
const listeners = new Set<() => void>();

function set(next: CapacitySettings) {
  state = next;
  try {
    localStorage.setItem(CAPACITY_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

export const capacitySettings = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Sets one end of the window. Returns false, changing nothing, when the
   * window would no longer end after it starts.
   */
  setTime(key: keyof CapacitySettings, time: string): boolean {
    const next = { ...state, [key]: time };
    const start = timeToMinutes(next.dayStart);
    const end = timeToMinutes(next.dayEnd);
    if (start === null || end === null || end <= start) return false;
    if (next[key] !== state[key]) set(next);
    return true;
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useCapacitySettings() {
  return useSyncExternalStore(capacitySettings.subscribe, capacitySettings.getState);
}
