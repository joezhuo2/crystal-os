import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import type { Task } from "@/contexts/AppContext";
import { findFreeSlot, parseFreeSlot, parseFreeSlotQuery, planToday } from "./freeSlot";

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

describe("parseFreeSlot", () => {
  it("reads free:1h<7d, minutes, and the spelled-out form", () => {
    expect(parseFreeSlot("free:1h<7d")).toEqual({ minutes: 60, days: 7 });
    expect(parseFreeSlot("free: 30m < 3d")).toEqual({ minutes: 30, days: 3 });
    expect(parseFreeSlot("free:2h")).toEqual({ minutes: 120, days: 14 });
    expect(parseFreeSlot("Find 1 h free this week")).toEqual({ minutes: 60, days: 7 });
    expect(parseFreeSlot("find 1.5 hours free")).toEqual({ minutes: 90, days: 14 });
    expect(parseFreeSlot("next 5h")).toEqual({ minutes: 300, days: 14 });
  });

  it("caps the days at the range the palette loads, and ignores the rest", () => {
    expect(parseFreeSlot("free:1h<90d")?.days).toBe(14);
    expect(parseFreeSlot("free:0h")).toBeNull();
    expect(parseFreeSlot("free time")).toBeNull();
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

describe("planToday", () => {
  const task = (id: string, estimateMinutes: number | undefined, priority: Task["priority"] = "medium"): Task => ({
    id,
    name: id,
    startDate: "2026-10-05",
    startTime: "09:00",
    endDate: "2026-10-05",
    endTime: "10:00",
    priority,
    categoryId: "c",
    completed: false,
    estimateMinutes,
  });
  const plan = (tasks: Task[], events: CalendarEvent[] = [event()]) =>
    planToday({ tasks, events, now: NOW, window: WINDOW }).map((b) => [b.task.id, b.start, b.end]);

  it("places the most pressing task first, around events and each other", () => {
    expect(plan([task("low", 60, "low"), task("urgent", 120, "urgent")])).toEqual([
      ["urgent", 11 * 60, 13 * 60],
      ["low", 9 * 60, 10 * 60],
    ]);
  });

  it("skips tasks with no estimate, already blocked today, or that do not fit", () => {
    expect(
      plan([task("none", undefined), task("Meeting", 30), task("huge", 600), task("fits", 30)]),
    ).toEqual([["fits", 9 * 60, 9 * 60 + 30]]);
  });
});
