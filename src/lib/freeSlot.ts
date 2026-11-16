/**
 * The command palette's free-slot finder: "next 5h" looks for the first stretch
 * of that length inside the work window (Settings → The Engine) that no timed
 * event in The Horizon's calendar overlaps.
 */
import type { Task } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { busyIntervals, mergeIntervals, type CapacityWindow } from "@/lib/capacity";
import { PRIORITY_RANK } from "@/lib/homeTasks";
import { fromMinutes } from "@/lib/timeGrid";
import { toLocalDateStr } from "@/lib/utils";

/** How many days ahead, today included, the finder looks. */
export const FREE_SLOT_DAYS = 14;

/** "next 5h", "next 1.5 hours" → minutes, or null when the query is not one. */
export function parseFreeSlotQuery(query: string): number | null {
  return parseFreeSlot(query)?.minutes ?? null;
}

export function parseFreeSlot(query: string): { minutes: number; days: number } | null {
  const q = query.trim();
  const match =
    /^next\s+(\d+(?:\.\d+)?)\s*(h)(?:ours?|rs?)?$/i.exec(q) ??
    /^free:\s*(\d+(?:\.\d+)?)\s*(h|m)(?:\s*<\s*(\d+)\s*d)?$/i.exec(q) ??
    /^find\s+(\d+(?:\.\d+)?)\s*(h)(?:ours?|rs?)?\s+free(\s+this\s+week)?$/i.exec(q);
  if (!match) return null;
  const minutes = Math.round(Number(match[1]) * (match[2].toLowerCase() === "h" ? 60 : 1));
  const within = match[3] === undefined ? FREE_SLOT_DAYS : Number(match[3]) || 7;
  return minutes > 0 ? { minutes, days: Math.min(FREE_SLOT_DAYS, Math.max(1, within)) } : null;
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

export type PlannedBlock = { task: Task; start: number; end: number };

export function planToday({
  tasks,
  events,
  now,
  window,
}: {
  tasks: Task[];
  events: CalendarEvent[];
  now: Date;
  window: CapacityWindow;
}): PlannedBlock[] {
  const today = toLocalDateStr(now);
  const blocked = new Set(events.filter((e) => e.startDate === today).map((e) => e.summary));
  const busy = [...events];
  const blocks: PlannedBlock[] = [];
  const queue = tasks
    .filter((t) => t.estimateMinutes && !blocked.has(t.name))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.startTime.localeCompare(b.startTime));
  for (const task of queue) {
    const slot = findFreeSlot({ events: busy, now, minutes: task.estimateMinutes!, window, days: 1 });
    if (!slot) continue;
    blocks.push({ task, start: slot.start, end: slot.end });
    busy.push({
      allDay: false,
      startDate: today,
      endDate: today,
      startTime: fromMinutes(slot.start),
      endTime: fromMinutes(slot.end),
    } as CalendarEvent);
  }
  return blocks;
}
