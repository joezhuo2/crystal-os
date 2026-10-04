/**
 * The Orbit's weekly and monthly reviews: which period is up for review, the
 * numbers in it, and the vault note it exports to.
 *
 * Pure functions of their inputs (and an explicit `now`), so the period
 * boundaries and the stats are unit-tested without a database. Days are local
 * "YYYY-MM-DD" strings throughout, compared as strings.
 */

import { overallRate, summarizeHabits, type Habit, type HabitCheck, type HabitSummary } from "@/lib/habits";
import { addDays, cleanRepeat, taskFallsOnDate, toLocalDateStr, type RepeatRule } from "@/lib/utils";

export type ReviewKind = "weekly" | "monthly";

/** The Orbit's React Query keys start with this; saving a completion or focus run refreshes them. */
export const ORBIT_QUERY_KEY = ["orbit"] as const;

/** A review becomes ready at this local hour on its last day. */
export const READY_HOUR = 18;

/** How many earlier periods the trend average covers. */
export const TREND_WINDOW: Record<ReviewKind, number> = { weekly: 4, monthly: 3 };

export interface ReviewPeriod {
  kind: ReviewKind;
  /** First day, inclusive. Weeks start on Monday. */
  start: string;
  /** Last day, inclusive: a Sunday, or the month's last day. */
  end: string;
  /** "2026-W40" or "2026-10": names the exported note and the ready badge. */
  key: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const parseDay = (day: string) => new Date(`${day}T12:00:00`);

/** Monday of the week holding `day`. */
function mondayOf(day: string): string {
  const weekday = parseDay(day).getDay(); // 0 = Sunday
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

function lastDayOfMonth(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex + 1, 0);
  return toLocalDateStr(d);
}

/** ISO 8601 week number and its year (the year that week's Thursday is in). */
export function isoWeek(day: string): { year: number; week: number } {
  const thursday = parseDay(addDays(mondayOf(day), 3));
  const year = thursday.getFullYear();
  const jan4 = toLocalDateStr(new Date(year, 0, 4));
  const firstThursday = addDays(mondayOf(jan4), 3);
  const diff = Math.round((thursday.getTime() - parseDay(firstThursday).getTime()) / 86_400_000);
  return { year, week: 1 + Math.round(diff / 7) };
}

function weekPeriod(monday: string): ReviewPeriod {
  const { year, week } = isoWeek(monday);
  return { kind: "weekly", start: monday, end: addDays(monday, 6), key: `${year}-W${pad2(week)}` };
}

function monthPeriod(year: number, monthIndex: number): ReviewPeriod {
  const d = new Date(year, monthIndex, 1);
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    kind: "monthly",
    start: `${y}-${pad2(m + 1)}-01`,
    end: lastDayOfMonth(y, m),
    key: `${y}-${pad2(m + 1)}`,
  };
}

/** The period that holds `day`. */
export function periodContaining(kind: ReviewKind, day: string): ReviewPeriod {
  if (kind === "weekly") return weekPeriod(mondayOf(day));
  const d = parseDay(day);
  return monthPeriod(d.getFullYear(), d.getMonth());
}

/** When a period's review is ready: 18:00 on its last day. */
export function readyAt(period: ReviewPeriod): Date {
  const d = parseDay(period.end);
  d.setHours(READY_HOUR, 0, 0, 0);
  return d;
}

/**
 * The newest period whose review is ready at `now`: the one ending this
 * Sunday (or this month) from 18:00 on its last day, and the one before until
 * then.
 */
export function latestReadyPeriod(kind: ReviewKind, now: Date = new Date()): ReviewPeriod {
  const current = periodContaining(kind, toLocalDateStr(now));
  return now >= readyAt(current) ? current : shiftPeriod(current, -1);
}

/**
 * The period still running at `now`, while its review is not ready yet (so it
 * sits one step past `latestReadyPeriod`); null once it is ready.
 */
export function inProgressPeriod(kind: ReviewKind, now: Date = new Date()): ReviewPeriod | null {
  const current = periodContaining(kind, toLocalDateStr(now));
  return now >= readyAt(current) ? null : current;
}

/** The period `delta` steps after (or before, when negative) this one. */
export function shiftPeriod(period: ReviewPeriod, delta: number): ReviewPeriod {
  if (period.kind === "weekly") return weekPeriod(addDays(period.start, delta * 7));
  const d = parseDay(period.start);
  return monthPeriod(d.getFullYear(), d.getMonth() + delta);
}

/** Every day of a period, in order. */
export function daysOf(period: { start: string; end: string }): string[] {
  const days: string[] = [];
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) days.push(d);
  return days;
}

const inPeriod = (day: string | null | undefined, p: { start: string; end: string }) =>
  !!day && day >= p.start && day <= p.end;

/** Local day of an ISO timestamp. */
export function dayOfInstant(iso: string): string {
  return toLocalDateStr(new Date(iso));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Sep 28 – Oct 4, 2026" or "October 2026". */
export function periodLabel(period: ReviewPeriod): string {
  const s = parseDay(period.start);
  const e = parseDay(period.end);
  if (period.kind === "monthly") return `${MONTHS_LONG[s.getMonth()]} ${s.getFullYear()}`;
  const left = `${MONTHS[s.getMonth()]} ${s.getDate()}`;
  const right = s.getMonth() === e.getMonth() ? `${e.getDate()}` : `${MONTHS[e.getMonth()]} ${e.getDate()}`;
  return `${left} – ${right}, ${e.getFullYear()}`;
}

/** "week" or "month", for copy like "vs last week". */
export const unitOf = (kind: ReviewKind) => (kind === "weekly" ? "week" : "month");

/** Vault path the review exports to. */
export function exportPath(period: ReviewPeriod): string {
  return period.kind === "weekly" ? `Reviews/Weekly/${period.key}.md` : `Reviews/Monthly/${period.key}.md`;
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

export interface CompletionRecord {
  title: string;
  /** ISO timestamp. */
  completedAt: string;
}

export interface FocusRecord {
  /** ISO timestamp the run ended; it counts on that day. */
  endedAt: string;
  seconds: number;
}

export interface ReviewTask {
  name: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  completed: boolean;
  repeat?: RepeatRule;
  /** ISO timestamp. */
  createdAt?: string;
}

export interface ReviewTransaction {
  amount: number;
  type: "income" | "expense";
  /** "YYYY-MM-DD". */
  date: string;
}

export interface ReviewNote {
  title: string;
  path: string;
  /** Local day the note was written ("YYYY-MM-DD"). */
  created: string | null;
}

export interface ReviewEvent {
  summary: string;
  startDate: string;
  startTime: string;
  allDay: boolean;
}

export interface ReviewData {
  completions: CompletionRecord[];
  focus: FocusRecord[];
  tasks: ReviewTask[];
  transactions: ReviewTransaction[];
  notes: ReviewNote[];
  /** Calendar events in the period after the reviewed one. */
  events: ReviewEvent[];
  /** Every habit, archived ones included, and their check-offs. */
  habits?: Habit[];
  habitChecks?: HabitCheck[];
  /** Local day the review is built on; a running period only counts habit days up to it. Defaults to now. */
  today?: string;
}

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

export interface PeriodStats {
  done: number;
  added: number;
  focusMinutes: number;
  income: number;
  expenses: number;
  notes: number;
  /** Share of active habit-days done, 0–100 (0 with no habits). */
  habitRate: number;
}

const habitSummaries = (period: { start: string; end: string }, data: ReviewData) =>
  summarizeHabits(period, data.habits ?? [], data.habitChecks ?? [], data.today ?? toLocalDateStr());

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The headline numbers for one period, also used for the trend baselines. */
export function periodStats(period: { start: string; end: string }, data: ReviewData): PeriodStats {
  let income = 0;
  let expenses = 0;
  for (const tx of data.transactions) {
    if (!inPeriod(tx.date, period)) continue;
    if (tx.type === "income") income += tx.amount;
    else expenses += tx.amount;
  }
  const seconds = data.focus
    .filter((f) => inPeriod(dayOfInstant(f.endedAt), period))
    .reduce((sum, f) => sum + f.seconds, 0);
  return {
    done: data.completions.filter((c) => inPeriod(dayOfInstant(c.completedAt), period)).length,
    added: data.tasks.filter((t) => t.createdAt && inPeriod(dayOfInstant(t.createdAt), period)).length,
    focusMinutes: Math.round(seconds / 60),
    income: round2(income),
    expenses: round2(expenses),
    notes: data.notes.filter((n) => inPeriod(n.created, period)).length,
    habitRate: overallRate(habitSummaries(period, data)),
  };
}

export interface AgendaItem {
  day: string;
  title: string;
  /** "HH:MM", or "" for all-day items and tasks without a time. */
  time: string;
  kind: "event" | "task";
  repeats?: boolean;
}

/**
 * What is coming up in `period`: calendar events, and each open task once, on
 * its first day in the period (a repeating task is marked as such rather than
 * listed every day it recurs).
 */
export function buildAgenda(period: { start: string; end: string }, data: Pick<ReviewData, "events" | "tasks">): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const e of data.events) {
    if (!inPeriod(e.startDate, period)) continue;
    items.push({ day: e.startDate, title: e.summary || "(No title)", time: e.allDay ? "" : e.startTime, kind: "event" });
  }
  const days = daysOf(period);
  for (const t of data.tasks) {
    const rule = cleanRepeat(t.repeat);
    const scheduled = rule && rule.kind !== "after";
    if (t.completed && !scheduled) continue;
    const day = days.find((d) => taskFallsOnDate(t, d));
    if (!day) continue;
    items.push({ day, title: t.name, time: t.startTime && day === t.startDate ? t.startTime : "", kind: "task", repeats: !!rule });
  }
  return items.sort(
    (a, b) => a.day.localeCompare(b.day) || (a.time || "99").localeCompare(b.time || "99") || a.title.localeCompare(b.title),
  );
}

export interface Trend {
  id: keyof PeriodStats;
  label: string;
  value: number;
  previous: number;
  /** Average over the TREND_WINDOW periods before this one. */
  average: number;
  /** Whether a rise is good news (spending rising is not). */
  higherIsBetter: boolean;
  format: "count" | "minutes" | "money" | "percent";
}

export interface Review {
  period: ReviewPeriod;
  label: string;
  stats: PeriodStats;
  previous: PeriodStats;
  completedTitles: string[];
  addedTitles: string[];
  noteTitles: string[];
  /** Vault paths of the notes in noteTitles, same order. */
  notePaths: string[];
  /** Focus minutes on each day of the period. */
  focusByDay: { day: string; minutes: number }[];
  focusPerDay: number;
  /** Monthly only: average minutes per week of the month. */
  focusPerWeek: number;
  agenda: AgendaItem[];
  next: ReviewPeriod;
  /** Habits active in the period, in manager order. */
  habits: HabitSummary[];
  /** Habit completion is only listed when there are habits to measure. */
  trends: Trend[];
}

const TREND_DEFS: Omit<Trend, "value" | "previous" | "average">[] = [
  { id: "done", label: "Tasks completed", higherIsBetter: true, format: "count" },
  { id: "added", label: "Tasks added", higherIsBetter: true, format: "count" },
  { id: "focusMinutes", label: "Focus time", higherIsBetter: true, format: "minutes" },
  { id: "income", label: "Income", higherIsBetter: true, format: "money" },
  { id: "expenses", label: "Spending", higherIsBetter: false, format: "money" },
  { id: "notes", label: "Vault notes", higherIsBetter: true, format: "count" },
  { id: "habitRate", label: "Habit completion", higherIsBetter: true, format: "percent" },
];

/** The first day a review needs data from: the start of its trend window. */
export function dataStart(period: ReviewPeriod): string {
  return shiftPeriod(period, -TREND_WINDOW[period.kind]).start;
}

export function buildReview(period: ReviewPeriod, data: ReviewData): Review {
  const stats = periodStats(period, data);
  const prior = Array.from({ length: TREND_WINDOW[period.kind] }, (_, i) => periodStats(shiftPeriod(period, -(i + 1)), data));
  const previous = prior[0];

  const days = daysOf(period);
  const focusSeconds = new Map<string, number>(days.map((d) => [d, 0]));
  for (const f of data.focus) {
    const day = dayOfInstant(f.endedAt);
    if (focusSeconds.has(day)) focusSeconds.set(day, (focusSeconds.get(day) ?? 0) + f.seconds);
  }
  const focusByDay = days.map((day) => ({ day, minutes: Math.round((focusSeconds.get(day) ?? 0) / 60) }));

  const sortedCompletions = data.completions
    .filter((c) => inPeriod(dayOfInstant(c.completedAt), period))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const added = data.tasks
    .filter((t) => t.createdAt && inPeriod(dayOfInstant(t.createdAt), period))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const notes = data.notes
    .filter((n) => inPeriod(n.created, period))
    .sort((a, b) => (a.created ?? "").localeCompare(b.created ?? "") || a.title.localeCompare(b.title));

  const next = shiftPeriod(period, 1);
  const habits = habitSummaries(period, data);
  const trends = TREND_DEFS.filter((def) => def.id !== "habitRate" || habits.length > 0).map((def) => ({
    ...def,
    value: stats[def.id],
    previous: previous[def.id],
    average: round2(prior.reduce((sum, s) => sum + s[def.id], 0) / prior.length),
  }));

  return {
    period,
    label: periodLabel(period),
    stats,
    previous,
    completedTitles: sortedCompletions.map((c) => c.title),
    addedTitles: added.map((t) => t.name),
    noteTitles: notes.map((n) => n.title),
    notePaths: notes.map((n) => n.path),
    focusByDay,
    focusPerDay: Math.round(stats.focusMinutes / days.length),
    focusPerWeek: Math.round((stats.focusMinutes / days.length) * 7),
    agenda: buildAgenda(next, data),
    next,
    habits,
    trends,
  };
}

/* ------------------------------------------------------------------ *
 * Formatting and export
 * ------------------------------------------------------------------ */

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTrendValue(trend: Pick<Trend, "format">, value: number): string {
  if (trend.format === "money") return formatMoney(value);
  if (trend.format === "minutes") return formatMinutes(value);
  if (trend.format === "percent") return `${Math.round(value)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** "Mon, Oct 5" for an agenda day. */
export function agendaDayLabel(day: string): string {
  return parseDay(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "9:00 AM" for an "HH:MM" time. */
export function formatClockTime(time: string): string {
  return new Date(`2000-01-01T${time}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Week of the month (1–5) a day falls in, counting Monday-started weeks. */
export function weekOfPeriod(period: { start: string }, day: string): number {
  const first = mondayOf(period.start);
  const diff = Math.round((parseDay(mondayOf(day)).getTime() - parseDay(first).getTime()) / 86_400_000);
  return Math.floor(diff / 7) + 1;
}

export const REFLECTION_PROMPTS = ["What went well", "What didn't go well", "Focus for next"] as const;
export type ReflectionPrompt = (typeof REFLECTION_PROMPTS)[number];

export interface Reflection {
  prompt?: ReflectionPrompt | null;
  note?: string;
  /** The Habits card's note. */
  habitNote?: string;
}

/** The prompt as shown for this kind of review ("Focus for next week"). */
export function promptLabel(prompt: ReflectionPrompt, kind: ReviewKind): string {
  return prompt === "Focus for next" ? `Focus for next ${unitOf(kind)}` : prompt;
}

function arrow(delta: number): string {
  return delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
}

function trendLine(t: Trend, kind: ReviewKind): string {
  const fmt = (v: number) => formatTrendValue(t, v);
  const vsPrev = t.value - t.previous;
  const vsAvg = t.value - t.average;
  return `- **${t.label}:** ${fmt(t.value)} (${arrow(vsPrev)} ${fmt(Math.abs(vsPrev))} vs last ${unitOf(kind)}, ${arrow(vsAvg)} vs ${TREND_WINDOW[kind]}-${unitOf(kind)} average ${fmt(t.average)})`;
}

/** Pipes would end a table cell early. */
const cell = (text: string) => text.replace(/\|/g, "\\|");

function habitLines(review: Review, note: string | undefined): string[] {
  if (!review.habits.length) return [];
  const lines = [
    "## Habits",
    "",
    `**${review.stats.habitRate}%** of habit days done`,
    "",
    "| Habit | Done | Rate | Longest streak | Streak at end |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...review.habits.map((h) => `| ${cell(h.name)} | ${h.done}/${h.active} | ${h.rate}% | ${h.longest} | ${h.streakAtEnd} |`),
    "",
  ];
  if (note) lines.push("### Note", "", note, "");
  return lines;
}

const bullet = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- None");

/** The review as an Obsidian note, with the numbers in frontmatter for Dataview. */
export function toMarkdown(review: Review, reflection?: Reflection, now: Date = new Date()): string {
  const { period, stats, previous } = review;
  const unit = unitOf(period.kind);
  const title = `${period.kind === "weekly" ? "Weekly" : "Monthly"} review · ${review.label}`;
  const lines: string[] = [
    "---",
    `type: ${period.kind}-review`,
    `period: ${period.key}`,
    `start: ${period.start}`,
    `end: ${period.end}`,
    `created: ${toLocalDateStr(now)}`,
    `tasks_completed: ${stats.done}`,
    `tasks_added: ${stats.added}`,
    `focus_minutes: ${stats.focusMinutes}`,
    `income: ${stats.income}`,
    `expenses: ${stats.expenses}`,
    `net: ${round2(stats.income - stats.expenses)}`,
    `notes_added: ${stats.notes}`,
    ...(review.habits.length ? [`habits_completion: ${stats.habitRate}`] : []),
    "tags: [review, " + `${period.kind}-review]`,
    "---",
    "",
    `# ${title}`,
    "",
    "## Tasks",
    "",
    `**${stats.done} completed** · ${stats.added} added`,
    "",
    "### Completed",
    "",
    bullet(review.completedTitles),
    "",
    "### Added",
    "",
    bullet(review.addedTitles),
    "",
    "## Focus",
    "",
    `- Total: ${formatMinutes(stats.focusMinutes)}`,
    `- Per day: ${formatMinutes(review.focusPerDay)}`,
    ...(period.kind === "monthly" ? [`- Per week: ${formatMinutes(review.focusPerWeek)}`] : []),
    "",
    "## Money",
    "",
    `| | This ${unit} | Last ${unit} |`,
    "| --- | ---: | ---: |",
    `| Income | ${formatMoney(stats.income)} | ${formatMoney(previous.income)} |`,
    `| Spending | ${formatMoney(stats.expenses)} | ${formatMoney(previous.expenses)} |`,
    `| Net | ${formatMoney(stats.income - stats.expenses)} | ${formatMoney(previous.income - previous.expenses)} |`,
    "",
    ...habitLines(review, reflection?.habitNote?.trim()),
    `## Next ${unit}`,
    "",
    review.agenda.length
      ? review.agenda
          .map((a) => `- ${agendaDayLabel(a.day)}${a.time ? ` · ${formatClockTime(a.time)}` : ""} · ${a.title}${a.kind === "task" ? " (task)" : ""}`)
          .join("\n")
      : "- Nothing scheduled",
    "",
    "## Vault",
    "",
    `${stats.notes} ${stats.notes === 1 ? "note" : "notes"} added`,
    ...(review.noteTitles.length ? ["", bullet(review.notePaths.map((p, i) => `[[${p.replace(/\.md$/i, "")}|${review.noteTitles[i]}]]`))] : []),
    "",
    "## Trends",
    "",
    ...review.trends.map((t) => trendLine(t, period.kind)),
  ];

  const note = reflection?.note?.trim();
  if (reflection?.prompt || note) {
    lines.push("", "## Reflection", "");
    if (reflection?.prompt) lines.push(`### ${promptLabel(reflection.prompt, period.kind)}`, "");
    if (note) lines.push(note, "");
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
