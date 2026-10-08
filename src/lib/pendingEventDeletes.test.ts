import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent, DeleteEventVars } from "@/hooks/useGoogleCalendar";
import { deletesEvent, flushPendingDeletes, isPendingDelete, scheduleDelete } from "./pendingEventDeletes";
import { UNDO_MS } from "./undo";

const event = (id: string, recurringEventId: string | null = null): CalendarEvent => ({
  id,
  calendarId: "primary",
  summary: id,
  description: "",
  location: "",
  allDay: false,
  startDate: "2026-10-08",
  startTime: "09:00",
  endDate: "2026-10-08",
  endTime: "10:00",
  startISO: "",
  endISO: "",
  recurrence: null,
  recurringEventId,
  htmlLink: "",
});

const single: DeleteEventVars = { calendarId: "primary", eventId: "a", scope: "single" };

describe("deletesEvent", () => {
  it("matches only the event itself for a single delete", () => {
    expect(deletesEvent(single, event("a"))).toBe(true);
    expect(deletesEvent(single, event("b"))).toBe(false);
  });

  it("matches the master and every instance for a series delete", () => {
    const vars: DeleteEventVars = { calendarId: "primary", eventId: "m_1", scope: "all", recurringEventId: "m" };
    expect(deletesEvent(vars, event("m_1", "m"))).toBe(true);
    expect(deletesEvent(vars, event("m_2", "m"))).toBe(true);
    expect(deletesEvent(vars, event("m"))).toBe(true);
    expect(deletesEvent(vars, event("x_1", "x"))).toBe(false);
  });

  it("leaves one instance's siblings alone", () => {
    const vars: DeleteEventVars = { calendarId: "primary", eventId: "m_1", scope: "single", recurringEventId: "m" };
    expect(deletesEvent(vars, event("m_2", "m"))).toBe(false);
  });

  it("ignores other calendars", () => {
    expect(deletesEvent(single, { ...event("a"), calendarId: "work" })).toBe(false);
  });
});

describe("scheduleDelete", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const handlers = () => ({
    send: vi.fn(() => Promise.resolve()),
    onSent: vi.fn(),
    onError: vi.fn(),
  });

  it("hides the event and sends after the Undo window", async () => {
    const h = handlers();
    scheduleDelete(single, h);
    expect(isPendingDelete(event("a"))).toBe(true);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(h.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.onSent).toHaveBeenCalled();
    expect(isPendingDelete(event("a"))).toBe(false);
  });

  it("never sends once cancelled", async () => {
    const h = handlers();
    const cancel = scheduleDelete(single, h);
    expect(cancel()).toBe(true);
    expect(isPendingDelete(event("a"))).toBe(false);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("cannot cancel a delete already sent", async () => {
    const h = handlers();
    const cancel = scheduleDelete(single, h);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(cancel()).toBe(false);
  });

  it("reports a failed delete and shows the event again", async () => {
    const h = { ...handlers(), send: vi.fn(() => Promise.reject(new Error("boom"))) };
    scheduleDelete(single, h);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(isPendingDelete(event("a"))).toBe(false);
  });

  it("sends every held delete at once on flush, and only once", async () => {
    const h = handlers();
    scheduleDelete(single, h);
    await flushPendingDeletes();
    expect(h.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});
