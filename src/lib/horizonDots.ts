import type { Priority, Task } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { taskFallsOnDate } from "@/lib/utils";

export type HorizonDot = { key: string; time: string; color: string };

export const TASK_DOT_COLORS: Record<Priority, string> = {
  urgent: "#f87171",
  high: "#fb923c",
  medium: "#facc15",
  low: "#94a3b8",
};

export function taskColor(task: Task): string {
  return TASK_DOT_COLORS[task.priority] ?? TASK_DOT_COLORS.low;
}

/** Open tasks that fall on one day, ordered by time; earlier-started or untimed ones lead. */
export function tasksForDate(tasks: Task[], dateStr: string): Task[] {
  const timeOf = (t: Task) => (t.startDate < dateStr ? "" : t.startTime);
  return tasks
    .filter((t) => !t.completed && taskFallsOnDate(t, dateStr))
    .sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
}

/**
 * The dots for one day of the month grid: the calendar's events and the open
 * tasks that fall on it, in one list ordered by time. Anything that began on
 * an earlier day or has no time counts as all-day and leads the list.
 */
export function dotsForDate(
  dateStr: string,
  events: CalendarEvent[],
  tasks: Task[],
  eventColor: string,
): HorizonDot[] {
  const dots: HorizonDot[] = [];
  for (const e of events) {
    if (e.startDate > dateStr || e.endDate < dateStr) continue;
    const time = e.allDay || e.startDate < dateStr ? "" : e.startTime;
    dots.push({ key: `e-${e.id}`, time, color: eventColor });
  }
  for (const t of tasks) {
    if (t.completed || !taskFallsOnDate(t, dateStr)) continue;
    const time = t.startDate < dateStr ? "" : t.startTime;
    dots.push({ key: `t-${t.id}`, time, color: taskColor(t) });
  }
  return dots.sort((a, b) => a.time.localeCompare(b.time));
}
