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
 * Check whether a task falls on a given date, accounting for repeatDays.
 * A task with repeatDays=N generates occurrences every N days after startDate.
 * Each occurrence spans the same duration as the original (endDate − startDate).
 */
export function taskFallsOnDate(
  task: { startDate: string; endDate: string; repeatDays?: number },
  dateStr: string,
): boolean {
  // Original occurrence
  if (task.startDate <= dateStr && task.endDate >= dateStr) return true;

  // Repeating occurrences
  if (!task.repeatDays || task.repeatDays <= 0) return false;

  const start = new Date(task.startDate + "T12:00:00");
  const end = new Date(task.endDate + "T12:00:00");
  const target = new Date(dateStr + "T12:00:00");

  // Only future repeats (target must be after the original start)
  if (target < start) return false;

  const durationDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  const daysSinceStart = Math.round((target.getTime() - start.getTime()) / 86400000);
  const intervalDays = task.repeatDays;

  // Find the most recent repeat occurrence start on or before target
  const cycleIndex = Math.floor(daysSinceStart / intervalDays);
  const occurrenceStartDay = cycleIndex * intervalDays;
  const occurrenceEndDay = occurrenceStartDay + durationDays;

  return daysSinceStart >= occurrenceStartDay && daysSinceStart <= occurrenceEndDay;
}
