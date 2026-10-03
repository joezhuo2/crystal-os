/**
 * Layout for the Horizon's week and day views: which dates a view shows, and
 * where each timed event sits in a day column, side by side when they overlap.
 */
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { addDays } from "@/lib/utils";

export const MINUTES_PER_DAY = 24 * 60;

/** "HH:MM" as minutes after midnight; anything unparseable is midnight. */
export function toMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return 0;
  return Math.min(MINUTES_PER_DAY, Number(match[1]) * 60 + Number(match[2]));
}

/** Minutes after midnight as "HH:MM". */
export function fromMinutes(minutes: number): string {
  const m = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The Sunday-to-Saturday week holding `date`, matching the month grid. */
export function weekDates(date: string): string[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const sunday = addDays(date, -weekday);
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

export interface PlacedEvent {
  event: CalendarEvent;
  /** Clipped to this day: an event that started yesterday starts at 0 here. */
  startMin: number;
  endMin: number;
  /** Which of `columns` side-by-side lanes it takes. */
  column: number;
  columns: number;
}

/** Shortest block drawn, so a five-minute event is still clickable. */
export const MIN_BLOCK_MINUTES = 20;

/**
 * A day's events split into all-day ones (shown in the strip above the grid)
 * and timed ones placed in lanes. Events that overlap share the width of the
 * column; each run of overlapping events is laid out on its own, so one busy
 * morning doesn't squeeze the afternoon.
 */
export function layoutDay(
  events: CalendarEvent[],
  date: string,
): { allDay: CalendarEvent[]; timed: PlacedEvent[] } {
  const onDay = events.filter((e) => e.startDate <= date && e.endDate >= date);
  const allDay = onDay.filter((e) => e.allDay);

  const spans = onDay
    .filter((e) => !e.allDay)
    .map((event) => {
      const startMin = event.startDate < date ? 0 : toMinutes(event.startTime);
      const rawEnd = event.endDate > date ? MINUTES_PER_DAY : toMinutes(event.endTime);
      const endMin = Math.min(MINUTES_PER_DAY, Math.max(rawEnd, startMin + MIN_BLOCK_MINUTES));
      return { event, startMin, endMin };
    })
    // An event that ended exactly at midnight leaves nothing on the next day.
    .filter((s) => !(s.event.startDate < date && s.endMin <= 0))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const timed: PlacedEvent[] = [];
  let cluster: PlacedEvent[] = [];
  let lanes: number[] = []; // end minute of the last event in each lane
  let clusterEnd = -1;

  const closeCluster = () => {
    for (const placed of cluster) placed.columns = lanes.length;
    timed.push(...cluster);
    cluster = [];
    lanes = [];
  };

  for (const span of spans) {
    if (span.startMin >= clusterEnd) closeCluster();
    let column = lanes.findIndex((end) => end <= span.startMin);
    if (column === -1) {
      column = lanes.length;
      lanes.push(span.endMin);
    } else {
      lanes[column] = span.endMin;
    }
    cluster.push({ ...span, column, columns: 0 });
    clusterEnd = Math.max(clusterEnd, span.endMin);
  }
  closeCluster();

  return { allDay, timed };
}

/** Snap a click's minute offset down to the nearest `step` minutes. */
export function snapMinutes(minutes: number, step = 30): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY - step, Math.floor(minutes / step) * step));
}
