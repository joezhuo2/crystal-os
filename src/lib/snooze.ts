/**
 * Snoozing Engine tasks (v0.9.4).
 *
 * A snoozed task keeps its own dates; it is only hidden until it wakes:
 *   - `snoozedUntil` ("YYYY-MM-DD") hides it until the start of that day;
 *   - `someday` hides it with no date, until it is unsnoozed by hand.
 *
 * While hidden it is left out of The Engine's List and Board (it shows in the
 * Snoozed section instead), Home's Engine card and its nudges, the "fits
 * today?" bar and due-time notifications. A child task follows its parent: it
 * is snoozed exactly when the parent is, and cannot be snoozed on its own.
 * Completed tasks are never snoozed.
 */
import { addDays } from "@/lib/utils";

/** The fields these helpers read off a task. */
export type SnoozeLike = {
  id: string;
  completed: boolean;
  parentId?: string;
  snoozedUntil?: string;
  someday?: boolean;
};

/** The snooze fields of a task update. */
export type SnoozeUpdates = { snoozedUntil: string | undefined; someday: boolean | undefined };

/** Clears a task's snooze, dated or Someday. */
export const UNSNOOZE: SnoozeUpdates = { snoozedUntil: undefined, someday: undefined };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A stored snooze date, or undefined when it is missing or not a real date. */
export function cleanSnoozeDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const date = raw.slice(0, 10);
  if (!DATE_RE.test(date)) return undefined;
  const [y, m, d] = date.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? date : undefined;
}

/** Whether the task's own snooze hides it today, ignoring its parent. */
export function ownSnoozed(task: SnoozeLike, today: string): boolean {
  if (task.completed) return false;
  if (task.someday) return true;
  return !!task.snoozedUntil && task.snoozedUntil > today;
}

/**
 * Whether a task is hidden today. A child takes its parent's state; a child
 * whose parent is not in `byId` stands on its own.
 */
export function isSnoozed(task: SnoozeLike, today: string, byId: ReadonlyMap<string, SnoozeLike>): boolean {
  const parent = task.parentId ? byId.get(task.parentId) : undefined;
  if (parent) return !task.completed && ownSnoozed(parent, today);
  return ownSnoozed(task, today);
}

/** The tasks that are awake today, and the snoozed ones, both in list order. */
export function splitSnoozed<T extends SnoozeLike>(tasks: T[], today: string): { awake: T[]; snoozed: T[] } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const awake: T[] = [];
  const snoozed: T[] = [];
  for (const task of tasks) (isSnoozed(task, today, byId) ? snoozed : awake).push(task);
  return { awake, snoozed };
}

/** Only the tasks that are awake today. Returns `tasks` itself when nothing is snoozed. */
export function awakeTasks<T extends SnoozeLike>(tasks: T[], today: string): T[] {
  if (!tasks.some((t) => t.someday || t.snoozedUntil)) return tasks;
  return splitSnoozed(tasks, today).awake;
}

/** Whether a task can be snoozed: open, and not a child task. */
export function canSnooze(task: SnoozeLike): boolean {
  return !task.completed && !task.parentId;
}

/** The update that snoozes a task until `date`, or to Someday. */
export function snoozeUpdates(until: string | "someday"): SnoozeUpdates {
  return until === "someday" ? { snoozedUntil: undefined, someday: true } : { snoozedUntil: until, someday: undefined };
}

/** The snooze keys a task update needs to clear an existing snooze, or {} when there is none. */
export function clearedSnooze(task: SnoozeLike): Partial<SnoozeUpdates> {
  return task.snoozedUntil || task.someday ? UNSNOOZE : {};
}

const weekday = (date: string) => new Date(`${date}T12:00:00`).getDay();

/** Same day next month, clamped to the month's last day (Jan 31 → Feb 28). */
export function sameDayNextMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

export type SnoozePreset = { id: "tomorrow" | "weekend" | "next-week" | "next-month"; label: string; date: string };

/**
 * The quick picks, each strictly after today: tomorrow, the coming Saturday
 * (next week's on a weekend), the coming Monday, and the same day next month.
 */
export function snoozePresets(today: string): SnoozePreset[] {
  const day = weekday(today);
  const toSaturday = day === 6 ? 7 : 6 - day;
  const toMonday = ((8 - day) % 7) || 7;
  return [
    { id: "tomorrow", label: "Tomorrow", date: addDays(today, 1) },
    { id: "weekend", label: "This weekend", date: addDays(today, toSaturday) },
    { id: "next-week", label: "Next week", date: addDays(today, toMonday) },
    { id: "next-month", label: "Next month", date: sameDayNextMonth(today) },
  ];
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const LONG_DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** "Mon, Oct 12", with the year when it is not this year's. */
export function formatSnoozeDate(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00`);
  return (date.slice(0, 4) === today.slice(0, 4) ? SHORT_DATE : LONG_DATE).format(d);
}

/** "Until Mon, Oct 12" or "Someday", for a snoozed task's chip. */
export function snoozeLabel(task: SnoozeLike, today: string): string {
  if (task.someday) return "Someday";
  return task.snoozedUntil ? `Until ${formatSnoozeDate(task.snoozedUntil, today)}` : "";
}

/**
 * Snoozed tasks for the Snoozed section: dated ones soonest first, then
 * Someday. Children are left out (they show inside their parent).
 */
export function snoozedSections<T extends SnoozeLike>(snoozed: T[]): { dated: T[]; someday: T[] } {
  const top = snoozed.filter((t) => !t.parentId || !snoozed.some((p) => p.id === t.parentId));
  return {
    dated: top.filter((t) => !t.someday).sort((a, b) => (a.snoozedUntil ?? "").localeCompare(b.snoozedUntil ?? "")),
    someday: top.filter((t) => t.someday),
  };
}

/** Milliseconds from `now` to the next local midnight. */
export function msUntilMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
