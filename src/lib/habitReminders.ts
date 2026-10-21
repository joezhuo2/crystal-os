/**
 * Per-habit reminder times, set in the habit manager and read by the
 * notification scheduler. Kept on this device in localStorage, like the
 * notification switches: a reminder is a desktop toast, not habit data.
 */

import { useSyncExternalStore } from "react";

export const HABIT_REMINDERS_KEY = "crystal-os-habit-reminders";

/** Most reminders a day a habit can be set to; 0 means no limit. */
export const MAX_HABIT_REMINDERS_PER_DAY = 24;

export interface HabitReminder {
  /** Local "HH:MM" of the first reminder. */
  time: string;
  /** Reminders a day while the habit is not ticked, an hour apart. 0 keeps going until midnight. */
  perDay: number;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function clampPerDay(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_HABIT_REMINDERS_PER_DAY, Math.max(0, Math.round(n)));
}

/** Stored reminders by habit id; entries that are malformed are dropped. */
export function parseHabitReminders(raw: string | null): Record<string, HabitReminder> {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const out: Record<string, HabitReminder> = {};
  if (!data || typeof data !== "object") return out;
  for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
    const r = value as Partial<HabitReminder> | null;
    if (r && typeof r.time === "string" && TIME.test(r.time)) out[id] = { time: r.time, perDay: clampPerDay(r.perDay) };
  }
  return out;
}

function load(): Record<string, HabitReminder> {
  try {
    return parseHabitReminders(localStorage.getItem(HABIT_REMINDERS_KEY));
  } catch {
    return {};
  }
}

let state = load();
const listeners = new Set<() => void>();

function set(next: Record<string, HabitReminder>) {
  state = next;
  try {
    localStorage.setItem(HABIT_REMINDERS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

export const habitReminders = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Sets a habit's reminder time, or clears its reminder with null. */
  setTime(habitId: string, time: string | null) {
    const { [habitId]: current, ...rest } = state;
    if (time === null) {
      if (current) set(rest);
      return;
    }
    if (!TIME.test(time) || current?.time === time) return;
    set({ ...rest, [habitId]: { time, perDay: current?.perDay ?? 1 } });
  },

  setPerDay(habitId: string, value: unknown) {
    const current = state[habitId];
    const perDay = clampPerDay(value);
    if (!current || current.perDay === perDay) return;
    set({ ...state, [habitId]: { ...current, perDay } });
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useHabitReminders() {
  return useSyncExternalStore(habitReminders.subscribe, habitReminders.getState);
}
