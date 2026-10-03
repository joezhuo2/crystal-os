import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useState } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Delay a rapidly-changing value, so search-as-you-type doesn't fire per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/** Return "YYYY-MM-DD" in the user's **local** timezone (not UTC). */
export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A repeat interval as a whole number of days, or undefined when it
 * does not repeat. Zero, negatives, fractions below one and anything that is
 * not a finite number all mean "no repeat", so a bad value typed into the form
 * or already stored in Supabase can never half-enable a repeat.
 */
export function normalizeRepeatDays(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const days = Math.floor(value);
  return days > 0 ? days : undefined;
}

/**
 * How a task recurs.
 * - `days`: every N days after the start date.
 * - `weekly`: on the chosen weekdays (0 = Sunday … 6 = Saturday).
 * - `monthly`: on the start date's day of the month, or the month's last day
 *   when it is shorter (a task started on the 31st lands on Feb 28/29).
 * - `after`: N days after it is completed. Only the current occurrence is on
 *   the calendar; completing it moves the task forward (see completionUpdates).
 */
export type RepeatRule =
  | { kind: "days"; every: number }
  | { kind: "weekly"; weekdays: number[] }
  | { kind: "monthly" }
  | { kind: "after"; every: number };

export type RepeatKind = RepeatRule["kind"];

const REPEAT_KINDS: readonly RepeatKind[] = ["days", "weekly", "monthly", "after"];

/** Weekdays as sorted, unique whole numbers 0–6; anything else is dropped. */
export function normalizeWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = value.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

/**
 * A repeat rule from its stored parts, or undefined when the parts don't add
 * up to a working repeat. A missing kind with a day count is a row saved before
 * repeat kinds existed, which only knew "every N days".
 */
export function normalizeRepeat(kind: unknown, days: unknown, weekdays: unknown): RepeatRule | undefined {
  const k: unknown = kind == null ? "days" : kind;
  if (typeof k !== "string" || !REPEAT_KINDS.includes(k as RepeatKind)) return undefined;
  switch (k as RepeatKind) {
    case "days":
    case "after": {
      const every = normalizeRepeatDays(days);
      return every ? { kind: k as "days" | "after", every } : undefined;
    }
    case "weekly": {
      const list = normalizeWeekdays(weekdays);
      return list.length ? { kind: "weekly", weekdays: list } : undefined;
    }
    case "monthly":
      return { kind: "monthly" };
  }
}

/** The same rule passed back through normalizeRepeat, so bad values can't leak in. */
export function cleanRepeat(rule: RepeatRule | undefined | null): RepeatRule | undefined {
  if (!rule) return undefined;
  return normalizeRepeat(
    rule.kind,
    "every" in rule ? rule.every : undefined,
    "weekdays" in rule ? rule.weekdays : undefined,
  );
}

// Dates as whole-day counts in UTC, so DST shifts never add or drop a day.
const DAY_MS = 86400000;
const dayNumber = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** `dateStr` moved by `days` (negative goes back). */
export function addDays(dateStr: string, days: number): string {
  return fromDayNumber(dayNumber(dateStr) + days);
}

/**
 * Check whether a task falls on a given date, accounting for its repeat rule.
 * Each repeat spans the same duration as the original (endDate − startDate),
 * and repeats only ever come after the original start.
 */
export function taskFallsOnDate(
  task: { startDate: string; endDate: string; repeat?: RepeatRule },
  dateStr: string,
): boolean {
  // Original occurrence
  if (task.startDate <= dateStr && task.endDate >= dateStr) return true;

  const rule = cleanRepeat(task.repeat);
  // An "after completion" task has no fixed schedule: only the pending
  // occurrence exists until it is done.
  if (!rule || rule.kind === "after") return false;

  const start = dayNumber(task.startDate);
  const target = dayNumber(dateStr);
  if (target < start) return false;
  const duration = Math.max(0, dayNumber(task.endDate) - start);

  switch (rule.kind) {
    case "days": {
      const since = target - start;
      const occurrenceStart = Math.floor(since / rule.every) * rule.every;
      return since <= occurrenceStart + duration;
    }
    case "weekly": {
      // Reaching here means the target is past the original end, so every
      // candidate start below is after the original start. Weekdays cycle
      // every 7 days, so a week of candidates is enough.
      for (let back = 0; back <= Math.min(duration, 6); back++) {
        const weekday = new Date((target - back) * DAY_MS).getUTCDay();
        if (rule.weekdays.includes(weekday)) return true;
      }
      return false;
    }
    case "monthly": {
      const dayOfMonth = Number(task.startDate.slice(8, 10));
      const t = new Date(target * DAY_MS);
      // Walk back through enough months to cover an occurrence that started
      // earlier and is still running on the target date.
      for (let back = 0; back <= Math.ceil(duration / 28) + 1; back++) {
        const month = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - back, 1));
        const y = month.getUTCFullYear();
        const m = month.getUTCMonth();
        const occurrenceStart = Date.UTC(y, m, Math.min(dayOfMonth, daysInMonth(y, m))) / DAY_MS;
        if (occurrenceStart > start && occurrenceStart <= target && target <= occurrenceStart + duration) return true;
      }
      return false;
    }
  }
}

/**
 * The updates that mark a task done on `today`. Most tasks are simply
 * completed; an "after completion" task instead moves on to its next
 * occurrence, N days from today, keeping its length.
 */
export function completionUpdates(
  task: { startDate: string; endDate: string; repeat?: RepeatRule },
  today: string,
): { completed: true } | { startDate: string; endDate: string } {
  const rule = cleanRepeat(task.repeat);
  if (rule?.kind !== "after") return { completed: true };
  const duration = Math.max(0, dayNumber(task.endDate) - dayNumber(task.startDate));
  const startDate = addDays(today, rule.every);
  return { startDate, endDate: addDays(startDate, duration) };
}

/**
 * Whether an open task's end date has passed. Scheduled repeats recur rather
 * than lapse, so only one-off tasks and "after completion" chores (which wait
 * for you) can be overdue.
 */
export function isTaskOverdue(
  task: { endDate: string; completed: boolean; repeat?: RepeatRule },
  today: string,
): boolean {
  if (task.completed || task.endDate >= today) return false;
  const rule = cleanRepeat(task.repeat);
  return !rule || rule.kind === "after";
}

/** The dates that move a task to start today, keeping its length. */
export function rescheduleToToday(
  task: { startDate: string; endDate: string },
  today: string,
): { startDate: string; endDate: string } {
  const duration = Math.max(0, dayNumber(task.endDate) - dayNumber(task.startDate));
  return { startDate: today, endDate: addDays(today, duration) };
}

/** Short description of a repeat for list rows, e.g. "Mon, Wed, Fri". */
export function describeRepeat(rule: RepeatRule | undefined, startDate: string): string {
  const clean = cleanRepeat(rule);
  if (!clean) return "";
  switch (clean.kind) {
    case "days":
      return clean.every === 1 ? "Daily" : `Every ${clean.every} days`;
    case "weekly":
      return clean.weekdays.length === 7 ? "Daily" : clean.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", ");
    case "monthly":
      return `Monthly on the ${ordinal(Number(startDate.slice(8, 10)))}`;
    case "after":
      return `${clean.every} day${clean.every === 1 ? "" : "s"} after done`;
  }
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}
