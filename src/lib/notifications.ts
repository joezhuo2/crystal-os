/**
 * Native notifications: desktop toasts for task due times, calendar
 * reminders, Pomodoro phase changes and Portal unread counts.
 *
 * The planners here are pure (what to say, and when), so they are tested
 * directly. `notify` delivers through tauri-plugin-notification on desktop
 * and the browser's Notification API on the web, and does nothing while Do
 * Not Disturb is on. Like platform.ts, nothing from `@tauri-apps/*` is
 * imported at module level, so the web bundle carries none of it.
 *
 * Tasks and events are checked by NotificationScheduler (mounted while signed
 * in); the Pomodoro and Portal bridges start with the page (main.tsx).
 */

import type { Task } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { notifySettings } from "@/lib/notifySettings";
import { isDesktop } from "@/lib/platform";
import { pomodoro, selectFocusMuted, type PomodoroState } from "@/lib/pomodoro";
import { portal, type PortalState } from "@/lib/portalStore";
import { cleanRepeat, taskFallsOnDate, toLocalDateStr } from "@/lib/utils";
import { awakeTasks } from "@/lib/snooze";

export interface PlannedAlert {
  /** Stable id for one reminder, so it is shown once however often plans run. */
  key: string;
  title: string;
  body: string;
}

/** A task due time is still announced this long after it passes (a throttled or sleeping timer, a late start). */
export const TASK_GRACE_MS = 10 * 60 * 1000;

const MINUTE = 60 * 1000;

function clockLabel(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

function dayNumber(dateStr: string): number {
  return Math.round(Date.parse(`${dateStr}T00:00:00Z`) / 86400000);
}

/**
 * Whether one of the task's occurrences ends on `date`. An occurrence ends
 * `endDate − startDate` days after it starts, so this asks whether one starts
 * that many days earlier.
 */
export function taskEndsOnDate(task: Pick<Task, "startDate" | "endDate" | "repeat">, date: string): boolean {
  const span = Math.max(0, dayNumber(task.endDate) - dayNumber(task.startDate));
  const start = addDays(date, -span);
  if (start === task.startDate) return true;
  const rule = cleanRepeat(task.repeat);
  if (!rule || rule.kind === "after") return false;
  // The same rule, one day long, falls on a date exactly when an occurrence starts there.
  return taskFallsOnDate({ startDate: task.startDate, endDate: task.startDate, repeat: task.repeat }, start);
}

/**
 * Open tasks whose end time (on today or yesterday, so a due time just before
 * midnight survives the date change) passed within TASK_GRACE_MS of `now`.
 */
export function taskDueAlerts(tasks: Task[], now: Date): PlannedAlert[] {
  const today = toLocalDateStr(now);
  const alerts: PlannedAlert[] = [];
  // A snoozed task stays quiet until it wakes.
  for (const task of awakeTasks(tasks, today)) {
    if (task.completed || !/^\d{2}:\d{2}$/.test(task.endTime)) continue;
    for (const date of [addDays(today, -1), today]) {
      const due = new Date(`${date}T${task.endTime}:00`);
      const late = now.getTime() - due.getTime();
      if (late < 0 || late > TASK_GRACE_MS || !taskEndsOnDate(task, date)) continue;
      alerts.push({
        key: `task:${task.id}:${date}`,
        title: `Due now: ${task.name}`,
        body: `Due at ${clockLabel(due)}${task.priority === "urgent" || task.priority === "high" ? ` · ${task.priority} priority` : ""}`,
      });
    }
  }
  return alerts;
}

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Timed events that start within `leadMinutes` of `now` and have not started
 * yet. All-day events get no reminder. Opening the app inside the window
 * still reminds, with the time actually left.
 */
export function eventAlerts(events: CalendarEvent[], now: Date, leadMinutes: number): PlannedAlert[] {
  const alerts: PlannedAlert[] = [];
  for (const event of events) {
    if (event.allDay) continue;
    const start = Date.parse(event.startISO);
    if (!Number.isFinite(start)) continue;
    const left = start - now.getTime();
    // A zero lead reminds as the event starts, inside the same grace as tasks.
    const inWindow = leadMinutes > 0 ? left > 0 && left <= leadMinutes * MINUTE : left <= 0 && -left <= TASK_GRACE_MS;
    if (!inWindow) continue;
    const mins = Math.ceil(left / MINUTE);
    const when = mins > 0 ? `In ${minutesLabel(mins)}, at ${clockLabel(new Date(start))}` : `Now, at ${clockLabel(new Date(start))}`;
    alerts.push({
      key: `event:${event.calendarId}:${event.id}:${event.startISO}`,
      title: event.summary || "(No title)",
      body: event.location ? `${when} · ${event.location}` : when,
    });
  }
  return alerts;
}

/** The toast for a phase that just ran out, or null when `next` is not that. */
export function pomodoroAlert(prev: PomodoroState, next: PomodoroState): PlannedAlert | null {
  // The store flips the phase and stops when time runs out; a manual reset
  // keeps the phase, and pausing keeps both.
  if (!prev.running || next.running || prev.phase === next.phase) return null;
  if (prev.phase === "focus") {
    return {
      key: "pomodoro",
      title: "Focus session done",
      body: `Time for a ${minutesLabel(Math.round(next.breakDuration / 60))} break.`,
    };
  }
  return {
    key: "pomodoro",
    title: "Break over",
    body: `Ready for ${minutesLabel(Math.round(next.workDuration / 60))} of focus?`,
  };
}

/**
 * One toast per app whose unread count went up between two Portal states.
 * The first title an app reports after loading only sets its baseline, and
 * apps with notifications off are skipped.
 */
export function portalAlerts(prev: PortalState, next: PortalState): PlannedAlert[] {
  const alerts: PlannedAlert[] = [];
  for (const app of next.apps) {
    if (app.notify === false || !(app.id in prev.reported)) continue;
    const before = prev.badges[app.id];
    const after = next.badges[app.id];
    if (after === undefined || after === before) continue;
    if (after === "dot") {
      if (before !== undefined) continue;
      alerts.push({ key: `portal:${app.id}`, title: app.name, body: "New activity" });
      continue;
    }
    const was = typeof before === "number" ? before : 0;
    if (after <= was) continue;
    const added = after - was;
    alerts.push({
      key: `portal:${app.id}`,
      title: app.name,
      body: `${added} new · ${after} unread`,
    });
  }
  return alerts;
}

// ── Delivery ──

const SENT_KEY = "crystal-os-notified";
/** Sent keys are forgotten after this, keeping the log small. */
const SENT_TTL_MS = 2 * 24 * 60 * 60 * 1000;

function readSent(): Record<string, number> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}");
    return data && typeof data === "object" ? (data as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/**
 * Marks each alert as shown and returns the ones that were not already. Kept
 * in localStorage, so a restart inside a reminder's window does not repeat it.
 */
export function takeUnsent(alerts: PlannedAlert[], now = Date.now()): PlannedAlert[] {
  if (alerts.length === 0) return [];
  const sent = readSent();
  for (const [key, at] of Object.entries(sent)) {
    if (typeof at !== "number" || now - at > SENT_TTL_MS) delete sent[key];
  }
  const fresh = alerts.filter((a) => !(a.key in sent));
  for (const alert of fresh) sent[alert.key] = now;
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(sent));
  } catch {
    // Storage blocked: reminders may repeat after a restart.
  }
  return fresh;
}

type Permission = "granted" | "denied" | "default";

let permission: Promise<boolean> | null = null;

/** Asks once per session; a refusal is remembered by the OS or browser. */
function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    if (isDesktop()) {
      const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === "granted";
    }
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return ((await Notification.requestPermission()) as Permission) === "granted";
  })().catch((err) => {
    console.warn("[notifications] permission check failed:", err);
    permission = null;
    return false;
  });
  return permission;
}

/**
 * Shows a desktop notification, unless Do Not Disturb is on. `force` skips
 * that check, for the test button in Settings. Resolves false when nothing
 * was shown.
 */
export async function notify(alert: Pick<PlannedAlert, "title" | "body">, force = false): Promise<boolean> {
  if (!force && notifySettings.getState().doNotDisturb) return false;
  if (!(await ensurePermission())) return false;
  try {
    if (isDesktop()) {
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      sendNotification({ title: alert.title, body: alert.body });
    } else {
      new Notification(alert.title, { body: alert.body });
    }
    return true;
  } catch (err) {
    console.warn("[notifications] could not show:", err);
    return false;
  }
}

/** Shows each alert that has not been shown before. */
export function deliver(alerts: PlannedAlert[]) {
  if (alerts.length === 0 || notifySettings.getState().doNotDisturb) return;
  for (const alert of takeUnsent(alerts)) void notify(alert);
}

/**
 * Pomodoro and Portal notifications, for the life of the page. Both stores
 * live outside React, so these do too. Returns a cleanup function.
 */
export function initNotificationBridges(): () => void {
  let lastPomodoro = pomodoro.getState();
  const stopPomodoro = pomodoro.subscribe(() => {
    const next = pomodoro.getState();
    const alert = pomodoroAlert(lastPomodoro, next);
    lastPomodoro = next;
    // Not logged as sent: every phase change is its own reminder.
    if (alert && notifySettings.getState().pomodoro) void notify(alert);
  });

  let lastPortal = portal.getState();
  const stopPortal = portal.subscribe(() => {
    const next = portal.getState();
    const alerts = portalAlerts(lastPortal, next);
    lastPortal = next;
    // While Crystal OS has focus the sidebar badge already says it, and a
    // running focus session mutes the Portal altogether.
    if (alerts.length === 0 || !notifySettings.getState().portal || document.hasFocus()) return;
    if (selectFocusMuted(pomodoro.getState())) return;
    for (const alert of alerts) void notify(alert);
  });

  return () => {
    stopPomodoro();
    stopPortal();
  };
}
