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
    dots.push({ key: `t-${t.id}`, time, color: TASK_DOT_COLORS[t.priority] ?? TASK_DOT_COLORS.low });
  }
  return dots.sort((a, b) => a.time.localeCompare(b.time));
}
