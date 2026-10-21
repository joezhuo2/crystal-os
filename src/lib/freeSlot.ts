/**
 * The command palette's free-slot finder: "next 5h" looks for the first stretch
 * of that length inside the work window (Settings → The Engine) that no timed
 * event in The Horizon's calendar overlaps.
 */
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { busyIntervals, mergeIntervals, type CapacityWindow } from "@/lib/capacity";
import { toLocalDateStr } from "@/lib/utils";

/** How many days ahead, today included, the finder looks. */
export const FREE_SLOT_DAYS = 14;

/** "next 5h", "next 1.5 hours" → minutes, or null when the query is not one. */
export function parseFreeSlotQuery(query: string): number | null {
  const match = /^next\s+(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?$/i.exec(query.trim());
  if (!match) return null;
  const minutes = Math.round(Number(match[1]) * 60);
  return minutes > 0 ? minutes : null;
}

export type FreeSlot = { date: string; start: number; end: number };

/**
 * The first free `minutes` from `now` on, within the work window of each day,
 * over FREE_SLOT_DAYS days. The slot is exactly `minutes` long, starting where
 * the free stretch starts. Null when none fits.
 */
export function findFreeSlot({
  events,
  now,
  minutes,
  window,
  days = FREE_SLOT_DAYS,
}: {
  events: CalendarEvent[];
  now: Date;
  minutes: number;
  window: CapacityWindow;
  days?: number;
}): FreeSlot | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < days; i++) {
    const date = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    let cursor = i === 0 ? Math.max(window.start, nowMinutes) : window.start;
    const busy = mergeIntervals(busyIntervals(events, date));
    for (const b of [...busy, { start: window.end, end: window.end }]) {
      const gapEnd = Math.min(b.start, window.end);
      if (gapEnd - cursor >= minutes) return { date, start: cursor, end: cursor + minutes };
      cursor = Math.max(cursor, b.end);
      if (cursor >= window.end) break;
    }
  }
  return null;
}
