/**
 * Ordering for the Home tab's Engine widget: today's open tasks, and the
 * upcoming list it falls back to once today is clear.
 */
import type { Priority, Task } from "@/contexts/AppContext";
import { taskFallsOnDate, toLocalDateStr } from "@/lib/utils";

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** A priority the table doesn't know sorts after every known one. */
const rank = (p: Priority) => PRIORITY_RANK[p] ?? 4;

/** How far ahead the Engine looks for upcoming tasks once today is clear. */
export const UPCOMING_DAYS = 14;

/** The dates after `today`, up to UPCOMING_DAYS out. */
export function upcomingDates(today: string): string[] {
  const base = new Date(`${today}T12:00:00`);
  return Array.from({ length: UPCOMING_DAYS }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i + 1);
    return toLocalDateStr(d);
  });
}

export type UpcomingTask = { task: Task; date: string };

/**
 * Each open task's next date within UPCOMING_DAYS of `today`, highest priority
 * first, then earliest date, then earliest start time.
 */
export function upcomingTasks(tasks: Task[], today: string): UpcomingTask[] {
  const dates = upcomingDates(today);
  return tasks
    .filter((t) => !t.completed)
    .flatMap((task) => {
      const date = dates.find((d) => taskFallsOnDate(task, d));
      return date ? [{ task, date }] : [];
    })
    .sort(
      (a, b) =>
        rank(a.task.priority) - rank(b.task.priority) ||
        a.date.localeCompare(b.date) ||
        a.task.startTime.localeCompare(b.task.startTime),
    );
}
