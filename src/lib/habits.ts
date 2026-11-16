/**
 * The Orbit's habit tracker: which habits are active on a day, streaks, the
 * Today card's grid and the per-habit numbers a review shows.
 *
 * Pure functions of their inputs (and an explicit `today`), like
 * orbitReview.ts. Days are local "YYYY-MM-DD" strings, compared as strings.
 */

import { addDays, toLocalDateStr } from "@/lib/utils";

export interface Habit {
  id: string;
  name: string;
  color: string;
  position: number;
  /** ISO timestamp. The habit counts from this local day on. */
  createdAt: string;
  /** ISO timestamp, or null while the habit is in use. It stops counting on this local day. */
  archivedAt: string | null;
  /** JS weekdays (0 = Sunday) the habit is for; empty or null means every day. */
  weekdays?: number[] | null;
  /** Times a week instead of fixed days; null when not used. */
  weeklyTarget?: number | null;
}

export interface HabitCheck {
  habitId: string;
  /** Local day it was done. */
  day: string;
}

/** Longest habit name, matching the check in 0004_habits.sql. */
export const HABIT_NAME_MAX = 40;

/** Names listed in a grid cell's tooltip before "+N more". */
export const TIP_NAMES_SHOWN = 3;

/**
 * Presets for the habit manager, from the Orbit's palette (ice, cyan, slate,
 * lavender-mauve, rust) plus a few that sit with it.
 */
export const HABIT_COLORS = [
  "hsl(190 95% 82%)", // ice
  "hsl(192 88% 66%)", // cyan
  "hsl(222 38% 58%)", // slate
  "hsl(285 34% 74%)", // mauve
  "hsl(12 60% 56%)", // rust
  "hsl(255 60% 76%)", // lavender
  "hsl(165 55% 62%)", // teal
  "hsl(38 80% 66%)", // amber
  "hsl(330 50% 70%)", // rose
] as const;

const dayOf = (iso: string) => toLocalDateStr(new Date(iso));
const parseDay = (day: string) => new Date(`${day}T12:00:00`);

/** Active habits first in their manager order; ties by creation. */
export function sortHabits<T extends Pick<Habit, "position" | "createdAt">>(habits: T[]): T[] {
  return [...habits].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/** Whether a habit counts on `day`: created by then and not yet archived. */
export function isActiveOn(habit: Pick<Habit, "createdAt" | "archivedAt">, day: string): boolean {
  if (dayOf(habit.createdAt) > day) return false;
  return !habit.archivedAt || day < dayOf(habit.archivedAt);
}

/** The days each habit was done, by habit id. */
export function indexChecks(checks: HabitCheck[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const c of checks) {
    let days = index.get(c.habitId);
    if (!days) index.set(c.habitId, (days = new Set()));
    days.add(c.day);
  }
  return index;
}

const NONE = new Set<string>();
const NO_REST = (_day: string) => false;

type Schedule = Pick<Habit, "weekdays" | "weeklyTarget">;

/** Done days in the Monday-to-Sunday week holding `day`. */
export function weekCount(days: Set<string>, day: string): number {
  const monday = mondayOf(day);
  let n = 0;
  for (let i = 0; i < 7; i++) if (days.has(addDays(monday, i))) n++;
  return n;
}

/** Whether the habit is expected on `day`: done then, on one of its weekdays, or still short of its weekly target. */
export function scheduledOn(habit: Schedule, day: string, days: Set<string>): boolean {
  if (days.has(day)) return true;
  if (habit.weeklyTarget) return weekCount(days, day) < habit.weeklyTarget;
  return !habit.weekdays?.length || habit.weekdays.includes(parseDay(day).getDay());
}

export const isDueOn = (habit: Schedule & Pick<Habit, "createdAt" | "archivedAt">, day: string, days: Set<string>) =>
  isActiveOn(habit, day) && scheduledOn(habit, day, days);

/** The habits expected today, and how many of them are done. */
export function dueToday(habits: Habit[], checks: HabitCheck[], today: string): { due: Habit[]; done: number } {
  const index = indexChecks(checks);
  const due = habits.filter((h) => isDueOn(h, today, index.get(h.id) ?? NONE));
  return { due, done: due.filter((h) => index.get(h.id)?.has(today)).length };
}

/**
 * The days a habit may be left unticked without breaking its streak: the
 * weekdays it is not for, or any day of a week that met its weekly target
 * (and of this week, which is not over).
 */
export function restDays(habit: Schedule, days: Set<string>, today: string): (day: string) => boolean {
  if (habit.weeklyTarget) {
    const target = habit.weeklyTarget;
    const thisWeek = mondayOf(today);
    return (day) => mondayOf(day) === thisWeek || weekCount(days, day) >= target;
  }
  const on = habit.weekdays;
  return on?.length ? (day) => !on.includes(parseDay(day).getDay()) : NO_REST;
}

/** Done days in a row ending on `end`, skipping rest days. 0 when `end` is a missed day. */
export function streakEndingAt(days: Set<string>, end: string, rest = NO_REST): number {
  let first = end;
  for (const d of days) if (d < first) first = d;
  let n = 0;
  for (let d = end; d >= first; d = addDays(d, -1)) {
    if (days.has(d)) n++;
    else if (!rest(d)) break;
  }
  return n;
}

/**
 * The streak as of `today`: today is not over yet, so until it is ticked the
 * streak runs up to yesterday instead of dropping to 0.
 */
export function currentStreak(days: Set<string>, today: string, rest = NO_REST): number {
  return streakEndingAt(days, days.has(today) ? today : addDays(today, -1), rest);
}

/** Longest run of done days inside `start`–`end`; rest days neither add to a run nor end it. */
export function longestRun(days: Set<string>, start: string, end: string, rest = NO_REST): number {
  let best = 0;
  let run = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (days.has(d)) run++;
    else if (!rest(d)) run = 0;
    if (run > best) best = run;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The Today card's grid
 * ------------------------------------------------------------------ */

export interface HabitDay {
  day: string;
  /** Habits done that day, in manager order. */
  done: Pick<Habit, "id" | "name" | "color">[];
  /** Habits active that day (for a day still to come: the ones active today). */
  total: number;
  isToday: boolean;
  future: boolean;
}

/** One day's tally. */
export function habitDay(day: string, habits: Habit[], index: Map<string, Set<string>>, today: string): HabitDay {
  const future = day > today;
  const on = (h: Habit) => isActiveOn(h, future ? today : day) && scheduledOn(h, day, index.get(h.id) ?? NONE);
  const active = sortHabits(habits).filter(on);
  return {
    day,
    done: future ? [] : active.filter((h) => index.get(h.id)?.has(day)).map(({ id, name, color }) => ({ id, name, color })),
    total: active.length,
    isToday: day === today,
    future,
  };
}

/** Monday of the week holding `day`. */
function mondayOf(day: string): string {
  const weekday = parseDay(day).getDay(); // 0 = Sunday
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * The cells for the week or month holding `today`, Monday first. The month
 * is a calendar: null pads the days before the 1st and after the last day,
 * so every row is a whole week.
 */
export function habitGrid(
  kind: "weekly" | "monthly",
  today: string,
  habits: Habit[],
  checks: HabitCheck[],
): (HabitDay | null)[] {
  const index = indexChecks(checks);
  if (kind === "weekly") {
    const monday = mondayOf(today);
    return Array.from({ length: 7 }, (_, i) => habitDay(addDays(monday, i), habits, index, today));
  }
  const first = `${today.slice(0, 8)}01`;
  const t = parseDay(first);
  const last = toLocalDateStr(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  const cells: (HabitDay | null)[] = [];
  for (let d = mondayOf(first); d < first; d = addDays(d, 1)) cells.push(null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(habitDay(d, habits, index, today));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** 0–1: how much of a cell is lit. */
export const dayShare = (cell: Pick<HabitDay, "done" | "total">) => (cell.total ? cell.done.length / cell.total : 0);

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

export interface HabitSummary {
  id: string;
  name: string;
  color: string;
  /** Days done in the period. */
  done: number;
  /** Days the habit was active in the period, up to today. */
  active: number;
  /** done / active, 0–100, rounded. */
  rate: number;
  /** Longest run inside the period. */
  longest: number;
  /** Streak on the period's last day (or today, while the period runs). */
  streakAtEnd: number;
}

/** Each habit active in the period, in manager order. Habits with no active day are left out. */
export function summarizeHabits(
  period: { start: string; end: string },
  habits: Habit[],
  checks: HabitCheck[],
  today: string,
): HabitSummary[] {
  const index = indexChecks(checks);
  const running = period.end >= today;
  const last = running ? today : period.end;
  const out: HabitSummary[] = [];
  for (const h of sortHabits(habits)) {
    const days = index.get(h.id) ?? NONE;
    let active = 0;
    let done = 0;
    const weeks = new Map<string, { days: number; done: number }>();
    for (let d = period.start; d <= last; d = addDays(d, 1)) {
      if (!isActiveOn(h, d)) continue;
      if (h.weeklyTarget) {
        const monday = mondayOf(d);
        const week = weeks.get(monday) ?? { days: 0, done: 0 };
        weeks.set(monday, week);
        week.days++;
        if (days.has(d)) week.done++;
        continue;
      }
      if (!scheduledOn(h, d, days)) continue;
      active++;
      if (days.has(d)) done++;
    }
    // A weekly target expects that many days of each week (fewer in a part week).
    for (const week of weeks.values()) {
      const expected = Math.min(h.weeklyTarget ?? 0, week.days);
      active += expected;
      done += Math.min(week.done, expected);
    }
    if (!active) continue;
    const rest = restDays(h, days, today);
    out.push({
      id: h.id,
      name: h.name,
      color: h.color,
      done,
      active,
      rate: Math.round((done / active) * 100),
      longest: longestRun(days, period.start, last, rest),
      streakAtEnd: running ? currentStreak(days, today, rest) : streakEndingAt(days, period.end, rest),
    });
  }
  return out;
}

/** Share of active habit-days done across all habits, 0–100; 0 when nothing was active. */
export function overallRate(summaries: Pick<HabitSummary, "done" | "active">[]): number {
  const active = summaries.reduce((s, h) => s + h.active, 0);
  const done = summaries.reduce((s, h) => s + h.done, 0);
  return active ? Math.round((done / active) * 100) : 0;
}
