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
/** Minutes before a task's end time that its "Due soon" reminder shows, by default. */
export const DEFAULT_TASK_LEAD = 30;

type Flag = "doNotDisturb" | "tasks" | "calendar" | "pomodoro" | "portal" | "reviews" | "taskReminders" | "habitReminders" | "habitReminderStartup";

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
  /** A toast when a weekly, monthly or yearly review in The Orbit becomes ready. */
  reviews: boolean;
  /** A toast ahead of a task's due time, as set by the next three fields. */
  taskReminders: boolean;
  /** "dayStart": from the start of the day a task is due. "before": `taskLead` minutes before its end time. */
  taskReminderWhen: "dayStart" | "before";
  /** Minutes, 1 to MAX_EVENT_LEAD. */
  taskLead: number;
  /** "once": each reminder shows once. "everyLaunch": again on each launch while it applies. */
  taskReminderRepeat: "once" | "everyLaunch";
  /** A toast for a habit not ticked by the reminder time set on it in the habit manager. */
  habitReminders: boolean;
  /** Also a habit reminder on each launch, for habits past their time and not ticked, beyond the daily count. */
  habitReminderStartup: boolean;
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  doNotDisturb: false,
  tasks: true,
  calendar: true,
  eventLead: DEFAULT_EVENT_LEAD,
  pomodoro: true,
  portal: true,
  reviews: true,
  taskReminders: true,
  taskReminderWhen: "before",
  taskLead: DEFAULT_TASK_LEAD,
  taskReminderRepeat: "once",
  habitReminders: true,
  habitReminderStartup: false,
};

/** Whole minutes within range. Anything unreadable falls back to the default. */
export function clampEventLead(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_EVENT_LEAD;
  return Math.min(MAX_EVENT_LEAD, Math.max(0, Math.round(n)));
}

/** Like clampEventLead, but at least a minute: a zero lead would never remind. */
export function clampTaskLead(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_TASK_LEAD;
  return Math.min(MAX_EVENT_LEAD, Math.max(1, Math.round(n)));
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
  const flag = (key: Flag) =>
    typeof stored[key] === "boolean" ? (stored[key] as boolean) : DEFAULT_NOTIFY_SETTINGS[key];
  return {
    doNotDisturb: flag("doNotDisturb"),
    tasks: flag("tasks"),
    calendar: flag("calendar"),
    eventLead: "eventLead" in stored ? clampEventLead(stored.eventLead) : DEFAULT_EVENT_LEAD,
    pomodoro: flag("pomodoro"),
    portal: flag("portal"),
    reviews: flag("reviews"),
    taskReminders: flag("taskReminders"),
    taskReminderWhen: stored.taskReminderWhen === "dayStart" ? "dayStart" : "before",
    taskLead: "taskLead" in stored ? clampTaskLead(stored.taskLead) : DEFAULT_TASK_LEAD,
    taskReminderRepeat: stored.taskReminderRepeat === "everyLaunch" ? "everyLaunch" : "once",
    habitReminders: flag("habitReminders"),
    habitReminderStartup: flag("habitReminderStartup"),
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
  setFlag(key: Flag, on: boolean) {
    if (state[key] === on) return;
    set({ ...state, [key]: on });
  },

  setEventLead(value: unknown) {
    const eventLead = clampEventLead(value);
    if (eventLead === state.eventLead) return;
    set({ ...state, eventLead });
  },

  setTaskLead(value: unknown) {
    const taskLead = clampTaskLead(value);
    if (taskLead === state.taskLead) return;
    set({ ...state, taskLead });
  },

  setTaskReminderWhen(when: NotifySettings["taskReminderWhen"]) {
    if (when !== state.taskReminderWhen) set({ ...state, taskReminderWhen: when });
  },

  setTaskReminderRepeat(repeat: NotifySettings["taskReminderRepeat"]) {
    if (repeat !== state.taskReminderRepeat) set({ ...state, taskReminderRepeat: repeat });
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
