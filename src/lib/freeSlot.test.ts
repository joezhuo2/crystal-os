import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { findFreeSlot, parseFreeSlotQuery } from "./freeSlot";

const WINDOW = { start: 9 * 60, end: 17 * 60 };
const NOW = new Date(2026, 9, 5, 8, 0);

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e",
  calendarId: "primary",
  summary: "Meeting",
  description: "",
  location: "",
  allDay: false,
  startDate: "2026-10-05",
  startTime: "10:00",
  endDate: "2026-10-05",
  endTime: "11:00",
  startISO: "",
  endISO: "",
  recurrence: null,
  recurringEventId: null,
  htmlLink: "",
  ...over,
});

describe("parseFreeSlotQuery", () => {
  it("reads hours, decimals and spelled-out units", () => {
    expect(parseFreeSlotQuery("next 5h")).toBe(300);
    expect(parseFreeSlotQuery("Next 1.5 hours")).toBe(90);
    expect(parseFreeSlotQuery("next 2 hrs")).toBe(120);
  });

  it("ignores anything else", () => {
    expect(parseFreeSlotQuery("next")).toBeNull();
    expect(parseFreeSlotQuery("next 0h")).toBeNull();
    expect(parseFreeSlotQuery("next meeting")).toBeNull();
    expect(parseFreeSlotQuery("add next 5h")).toBeNull();
  });
});

describe("findFreeSlot", () => {
  it("starts at the window when the day is empty", () => {
    expect(findFreeSlot({ events: [], now: NOW, minutes: 120, window: WINDOW })).toEqual({
      date: "2026-10-05",
      start: 540,
      end: 660,
    });
  });

  it("skips gaps too short and lands after the event", () => {
    const events = [event()];
    expect(findFreeSlot({ events, now: NOW, minutes: 90, window: WINDOW })).toEqual({
      date: "2026-10-05",
      start: 660,
      end: 750,
    });
  });

  it("counts only the time left today, then moves to the next day", () => {
    const late = new Date(2026, 9, 5, 14, 0);
    expect(findFreeSlot({ events: [], now: late, minutes: 300, window: WINDOW })).toEqual({
      date: "2026-10-06",
      start: 540,
      end: 840,
    });
  });

  it("ignores all-day events and returns null when nothing fits", () => {
    const events = [event({ allDay: true, startTime: "", endTime: "" })];
    expect(findFreeSlot({ events, now: NOW, minutes: 480, window: WINDOW })?.start).toBe(540);
    expect(findFreeSlot({ events: [], now: NOW, minutes: 481, window: WINDOW })).toBeNull();
  });
});
