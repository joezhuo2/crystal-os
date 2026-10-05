/**
 * Notification settings, shared by Settings and the notification scheduler
 * (src/lib/notifications.ts). Persisted in localStorage as one JSON object;
 * every change applies at once.
 */

import { useSyncExternalStore } from "react";

export const NOTIFY_SETTINGS_KEY = "crystal-os-notifications";

/** Minutes before a calendar event that its reminder shows, by default. */
export const DEFAULT_EVENT_LEAD = 30;
/** A day: reminders further ahead than this are not useful as toasts. */
export const MAX_EVENT_LEAD = 1440;

export interface NotifySettings {
  /** Silences every notification without changing the per-kind switches. */
  doNotDisturb: boolean;
  /** A toast when a task reaches its end time. */
  tasks: boolean;
  /** A toast `eventLead` minutes before each timed calendar event. */
  calendar: boolean;
  /** Minutes, 0 to MAX_EVENT_LEAD. 0 reminds when the event starts. */
  eventLead: number;
  /** A toast when a focus or break phase runs out. */
  pomodoro: boolean;
  /** A toast when a Portal app's unread count goes up (apps can opt out one by one). */
  portal: boolean;
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  doNotDisturb: false,
  tasks: true,
  calendar: true,
  eventLead: DEFAULT_EVENT_LEAD,
  pomodoro: true,
  portal: true,
};

/** Whole minutes within range. Anything unreadable falls back to the default. */
export function clampEventLead(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_EVENT_LEAD;
  return Math.min(MAX_EVENT_LEAD, Math.max(0, Math.round(n)));
}

/** Reads stored settings, keeping the default for any field that is missing or malformed. */
export function parseNotifySettings(raw: string | null): NotifySettings {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const stored = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const flag = (key: Exclude<keyof NotifySettings, "eventLead">) =>
    typeof stored[key] === "boolean" ? (stored[key] as boolean) : DEFAULT_NOTIFY_SETTINGS[key];
  return {
    doNotDisturb: flag("doNotDisturb"),
    tasks: flag("tasks"),
    calendar: flag("calendar"),
    eventLead: "eventLead" in stored ? clampEventLead(stored.eventLead) : DEFAULT_EVENT_LEAD,
    pomodoro: flag("pomodoro"),
    portal: flag("portal"),
  };
}

function load(): NotifySettings {
  try {
    return parseNotifySettings(localStorage.getItem(NOTIFY_SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_NOTIFY_SETTINGS };
  }
}

let state: NotifySettings = load();
const listeners = new Set<() => void>();

function set(next: NotifySettings) {
  state = next;
  try {
    localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

export const notifySettings = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Turns one switch on or off. */
  setFlag(key: Exclude<keyof NotifySettings, "eventLead">, on: boolean) {
    if (state[key] === on) return;
    set({ ...state, [key]: on });
  },

  setEventLead(value: unknown) {
    const eventLead = clampEventLead(value);
    if (eventLead === state.eventLead) return;
    set({ ...state, eventLead });
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useNotifySettings() {
  return useSyncExternalStore(notifySettings.subscribe, notifySettings.getState);
}
