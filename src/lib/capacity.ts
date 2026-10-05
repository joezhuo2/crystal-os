/**
 * Time estimates and today's capacity for The Engine: how long today's open
 * tasks are expected to take against the free time left in the work window
 * once the calendar's timed events are taken out.
 *
 * Everything here is pure; useTodayCapacity (src/hooks/useTodayCapacity.ts)
 * feeds it the tasks, the events and the clock.
 */
import type { Task } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { taskFallsOnDate } from "@/lib/utils";

/** The quick picks in the task form, in minutes. */
export const ESTIMATE_PRESETS = [15, 30, 60, 120, 240] as const;
/** A day. An estimate longer than this is not one day's work. */
export const MAX_ESTIMATE = 1440;

/**
 * A whole number of minutes from 1 to MAX_ESTIMATE, or undefined for "no
 * estimate". Anything unreadable, zero or negative is no estimate.
 */
export function clampEstimate(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  const minutes = Math.round(n);
  if (minutes < 1) return undefined;
  return Math.min(MAX_ESTIMATE, minutes);
}

/** "15m", "1h", "1h 30m". */
export function formatEstimate(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "HH:MM" to minutes after midnight, or null when it is not a time. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export type Interval = { start: number; end: number };

/** Sorts and merges overlapping or touching intervals, dropping empty ones. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  return merged;
}

/**
 * The part of each timed event that falls on `today`, in minutes after
 * midnight. An event that started yesterday starts at 0; one that ends
 * tomorrow ends at 1440. All-day events are left out: they mark the day
 * rather than fill it.
 */
export function busyIntervals(events: CalendarEvent[], today: string): Interval[] {
  return events.flatMap((e) => {
    if (e.allDay || e.startDate > today || e.endDate < today) return [];
    const start = e.startDate < today ? 0 : timeToMinutes(e.startTime);
    const end = e.endDate > today ? 1440 : timeToMinutes(e.endTime);
    if (start === null || end === null || end <= start) return [];
    return [{ start, end }];
  });
}

export type CapacityWindow = { start: number; end: number };

export type TodayCapacity = {
  /** Sum of the estimates of today's open tasks. */
  plannedMinutes: number;
  /** Today's open tasks that have an estimate. */
  estimated: number;
  /** Today's open tasks without one: they add nothing to `plannedMinutes`. */
  unestimated: number;
  /** What is left of the work window from now, before events. */
  remainingWindowMinutes: number;
  /** Event time inside what is left of the window, overlaps counted once. */
  busyMinutes: number;
  /** remainingWindowMinutes − busyMinutes. */
  freeMinutes: number;
  /** freeMinutes − plannedMinutes: negative when today is over capacity. */
  slackMinutes: number;
  fits: boolean;
  /** Whether the work window has already ended for today. */
  windowOver: boolean;
};

/** A small, stable hash, so a message stays put between renders. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** `when` is set for upcoming tasks: "Tomorrow", "Thu" or "Oct 14". */
type SuggestionContext = { name: string; estimate?: string; free: string; when?: string };
type Wording = { needsEstimate: boolean; text: (c: SuggestionContext) => string };

/** The ways the Home Engine card offers the next task. Some need an estimate. */
const SUGGESTIONS: Wording[] = [
  { needsEstimate: false, text: (c) => `Want to start ${c.name}?` },
  { needsEstimate: false, text: (c) => `${c.free} free. How about ${c.name}?` },
  { needsEstimate: false, text: (c) => `Next up: ${c.name}. Ready when you are.` },
  { needsEstimate: false, text: (c) => `Good moment to knock out ${c.name}.` },
  { needsEstimate: true, text: (c) => `${c.name} takes about ${c.estimate}. It fits, want to start?` },
  { needsEstimate: true, text: (c) => `You have time for ${c.name} (${c.estimate}). Go?` },
];

export type TaskSuggestion = { task: Task; text: string };

/**
 * A nudge toward the next task for Home's Engine card. `tasks` are today's
 * open tasks, most pressing first: the first one whose estimate fits the free
 * time wins, else the first without an estimate. Nothing when there is no
 * free time left or nothing fits. The wording is picked from SUGGESTIONS by
 * the task, the day and the hour, so it holds still for an hour and changes
 * through the day.
 */
export function suggestNextTask(tasks: Task[], freeMinutes: number, seed: string): TaskSuggestion | null {
  return suggestFrom(tasks.map((task) => ({ task })), SUGGESTIONS, freeMinutes, seed);
}

/** The ways the card offers an upcoming task once today is clear. */
const UPCOMING_SUGGESTIONS: Wording[] = [
  { needsEstimate: false, text: (c) => `Today's clear. Get a head start on ${c.name}?` },
  { needsEstimate: false, text: (c) => `All done for today. ${c.name} is up ${c.when === "Tomorrow" ? "tomorrow" : `on ${c.when}`}.` },
  { needsEstimate: false, text: (c) => `${c.free} free and nothing due. Start on ${c.name} early?` },
  { needsEstimate: true, text: (c) => `Today's done. ${c.name} (${c.estimate}) would fit now.` },
];

/**
 * The same nudge once today's tasks are all done: `upcoming` is the card's
 * upcoming list (highest priority first, then earliest date), and the pick
 * follows the same fit rule as suggestNextTask.
 */
export function suggestUpcomingTask(
  upcoming: { task: Task; when: string }[],
  freeMinutes: number,
  seed: string,
): TaskSuggestion | null {
  return suggestFrom(upcoming, UPCOMING_SUGGESTIONS, freeMinutes, seed);
}

function suggestFrom(
  items: { task: Task; when?: string }[],
  wordings: Wording[],
  freeMinutes: number,
  seed: string,
): TaskSuggestion | null {
  if (freeMinutes <= 0) return null;
  const item =
    items.find(({ task: t }) => t.estimateMinutes !== undefined && t.estimateMinutes <= freeMinutes) ??
    items.find(({ task: t }) => t.estimateMinutes === undefined);
  if (!item) return null;
  const { task, when } = item;
  const options = wordings.filter((s) => !s.needsEstimate || task.estimateMinutes !== undefined);
  const pick = options[hash(`${task.id}|${seed}`) % options.length];
  return {
    task,
    text: pick.text({
      name: task.name,
      when,
      estimate: task.estimateMinutes !== undefined ? formatEstimate(task.estimateMinutes) : undefined,
      free: formatEstimate(freeMinutes),
    }),
  };
}

/** Today's open tasks: not completed and falling on `today`, repeats included. */
export function todaysOpenTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.completed && taskFallsOnDate(t, today));
}

/**
 * Today's planned work against today's free time. `nowMinutes` is the clock
 * in minutes after midnight: the window only counts from there, so free time
 * runs down through the day.
 */
export function todayCapacity({
  tasks,
  events,
  today,
  nowMinutes,
  window,
}: {
  tasks: Task[];
  events: CalendarEvent[];
  today: string;
  nowMinutes: number;
  window: CapacityWindow;
}): TodayCapacity {
  const open = todaysOpenTasks(tasks, today);
  let plannedMinutes = 0;
  let estimated = 0;
  for (const t of open) {
    if (t.estimateMinutes) {
      plannedMinutes += t.estimateMinutes;
      estimated++;
    }
  }

  const from = Math.max(window.start, Math.min(nowMinutes, window.end));
  const remainingWindowMinutes = Math.max(0, window.end - from);
  const busyMinutes = mergeIntervals(
    busyIntervals(events, today).map((i) => ({ start: Math.max(i.start, from), end: Math.min(i.end, window.end) })),
  ).reduce((sum, i) => sum + (i.end - i.start), 0);
  const freeMinutes = Math.max(0, remainingWindowMinutes - busyMinutes);
  const slackMinutes = freeMinutes - plannedMinutes;

  return {
    plannedMinutes,
    estimated,
    unestimated: open.length - estimated,
    remainingWindowMinutes,
    busyMinutes,
    freeMinutes,
    slackMinutes,
    fits: slackMinutes >= 0,
    windowOver: nowMinutes >= window.end,
  };
}
