/**
 * When a start time changes, the end follows it: one hour later. Used by the
 * task form and the Horizon's event form, which both edit a start and end
 * together.
 */
import { fromMinutes, MINUTES_PER_DAY, toMinutes } from "@/lib/timeGrid";
import { addDays } from "@/lib/utils";

export const DEFAULT_DURATION_MINUTES = 60;

const TIME_RE = /^\d{1,2}:\d{2}/;

/**
 * The end date and time one hour after `startTime` on `startDate`. Past
 * midnight the end rolls onto the next day. A cleared or unparseable start
 * returns null, so the caller leaves the end alone.
 */
export function endAfterStart(
  startDate: string,
  startTime: string,
): { endDate: string; endTime: string } | null {
  if (!TIME_RE.test(startTime)) return null;
  const total = toMinutes(startTime) + DEFAULT_DURATION_MINUTES;
  const rolls = total >= MINUTES_PER_DAY;
  return {
    endDate: rolls && startDate ? addDays(startDate, 1) : startDate,
    endTime: fromMinutes(total % MINUTES_PER_DAY),
  };
}

/** Applies a new start time to a form, moving the end to follow it. */
export function withStartTime<
  F extends { startDate: string; startTime: string; endDate: string; endTime: string },
>(form: F, startTime: string): F {
  const end = endAfterStart(form.startDate, startTime);
  return end ? { ...form, startTime, ...end } : { ...form, startTime };
}
