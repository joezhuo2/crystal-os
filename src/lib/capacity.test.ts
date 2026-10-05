import { describe, expect, it } from "vitest";
import type { Task } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import {
  busyIntervals,
  clampEstimate,
  formatEstimate,
  MAX_ESTIMATE,
  mergeIntervals,
  suggestNextTask,
  timeToMinutes,
  todayCapacity,
} from "./capacity";

const TODAY = "2026-10-05";
const WINDOW = { start: 9 * 60, end: 17 * 60 };

let nextId = 0;

const task = (over: Partial<Task> = {}): Task => ({
  id: `t${nextId++}`,
  name: "Task",
  startDate: TODAY,
  startTime: "09:00",
  endDate: TODAY,
  endTime: "10:00",
  priority: "medium",
  categoryId: "c1",
  completed: false,
  ...over,
});

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `e${nextId++}`,
  calendarId: "primary",
  summary: "Meeting",
  description: "",
  location: "",
  allDay: false,
  startDate: TODAY,
  startTime: "10:00",
  endDate: TODAY,
  endTime: "11:00",
  startISO: "",
  endISO: "",
  recurrence: null,
  recurringEventId: null,
  htmlLink: "",
  ...over,
});

describe("estimates", () => {
  it("clamps to whole minutes from 1 to a day, and reads blanks and zero as none", () => {
    expect(clampEstimate(45)).toBe(45);
    expect(clampEstimate("90")).toBe(90);
    expect(clampEstimate(29.6)).toBe(30);
    expect(clampEstimate(5000)).toBe(MAX_ESTIMATE);
    expect(clampEstimate(0)).toBeUndefined();
    expect(clampEstimate(-5)).toBeUndefined();
    expect(clampEstimate("")).toBeUndefined();
    expect(clampEstimate("abc")).toBeUndefined();
    expect(clampEstimate(null)).toBeUndefined();
    expect(clampEstimate(undefined)).toBeUndefined();
  });

  it("formats as minutes, hours, or both", () => {
    expect(formatEstimate(0)).toBe("0m");
    expect(formatEstimate(15)).toBe("15m");
    expect(formatEstimate(60)).toBe("1h");
    expect(formatEstimate(90)).toBe("1h 30m");
    expect(formatEstimate(245)).toBe("4h 5m");
  });

  it("reads HH:MM times and rejects anything else", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("0:05")).toBe(5);
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("")).toBeNull();
    expect(timeToMinutes("9am")).toBeNull();
  });
});

describe("busy time", () => {
  it("merges overlapping and touching intervals", () => {
    expect(
      mergeIntervals([
        { start: 600, end: 660 },
        { start: 540, end: 610 },
        { start: 660, end: 700 },
        { start: 800, end: 800 },
        { start: 900, end: 960 },
      ]),
    ).toEqual([
      { start: 540, end: 700 },
      { start: 900, end: 960 },
    ]);
  });

  it("leaves out all-day events and clips events that cross midnight", () => {
    expect(
      busyIntervals(
        [
          event({ allDay: true, startTime: "", endTime: "" }),
          event({ startDate: "2026-10-04", startTime: "22:00", endTime: "01:00" }),
          event({ startTime: "23:00", endDate: "2026-10-06", endTime: "02:00" }),
          event({ startDate: "2026-10-06", endDate: "2026-10-06" }),
        ],
        TODAY,
      ),
    ).toEqual([
      { start: 0, end: 60 },
      { start: 1380, end: 1440 },
    ]);
  });
});

describe("todayCapacity", () => {
  it("adds up today's open estimates and counts the ones without", () => {
    const c = todayCapacity({
      tasks: [
        task({ estimateMinutes: 60 }),
        task({ estimateMinutes: 30 }),
        task(),
        task({ estimateMinutes: 120, completed: true }),
        task({ estimateMinutes: 240, startDate: "2026-10-06", endDate: "2026-10-06" }),
      ],
      events: [],
      today: TODAY,
      nowMinutes: 8 * 60,
      window: WINDOW,
    });
    expect(c).toMatchObject({
      plannedMinutes: 90,
      estimated: 2,
      unestimated: 1,
      freeMinutes: 480,
      slackMinutes: 390,
      fits: true,
    });
  });

  it("counts a repeating task on the days it falls on", () => {
    const c = todayCapacity({
      tasks: [
        task({ startDate: "2026-10-01", endDate: "2026-10-01", estimateMinutes: 45, repeat: { kind: "days", every: 1 } }),
      ],
      events: [],
      today: TODAY,
      nowMinutes: 0,
      window: WINDOW,
    });
    expect(c.plannedMinutes).toBe(45);
  });

  it("takes overlapping events out of the window once", () => {
    const c = todayCapacity({
      tasks: [],
      events: [
        event({ startTime: "10:00", endTime: "11:30" }),
        event({ startTime: "11:00", endTime: "12:00" }),
        event({ startTime: "16:30", endTime: "18:00" }),
        event({ startTime: "07:00", endTime: "08:00" }),
      ],
      today: TODAY,
      nowMinutes: 0,
      window: WINDOW,
    });
    expect(c.busyMinutes).toBe(150);
    expect(c.freeMinutes).toBe(330);
  });

  it("counts only what is left of the window from now", () => {
    const c = todayCapacity({
      tasks: [task({ estimateMinutes: 180 })],
      events: [event({ startTime: "10:00", endTime: "13:00" })],
      today: TODAY,
      nowMinutes: 12 * 60,
      window: WINDOW,
    });
    // 12:00–17:00 is 5h, and the event's last hour falls in it.
    expect(c).toMatchObject({
      remainingWindowMinutes: 300,
      busyMinutes: 60,
      freeMinutes: 240,
      slackMinutes: 60,
      fits: true,
    });
  });

  it("just fits at zero slack and is over capacity past it", () => {
    const at = (estimates: number[]) =>
      todayCapacity({
        tasks: estimates.map((estimateMinutes) => task({ estimateMinutes })),
        events: [event({ startTime: "13:00", endTime: "15:00" })],
        today: TODAY,
        nowMinutes: 9 * 60,
        window: WINDOW,
      });
    expect(at([240, 120])).toMatchObject({ freeMinutes: 360, plannedMinutes: 360, slackMinutes: 0, fits: true });
    expect(at([240, 150])).toMatchObject({ slackMinutes: -30, fits: false });
  });

  it("has no free time once the window is over", () => {
    const c = todayCapacity({
      tasks: [task({ estimateMinutes: 30 })],
      events: [],
      today: TODAY,
      nowMinutes: 18 * 60,
      window: WINDOW,
    });
    expect(c).toMatchObject({ windowOver: true, freeMinutes: 0, slackMinutes: -30, fits: false });
  });
});

describe("suggestNextTask", () => {
  it("offers the first task whose estimate fits the free time", () => {
    const tasks = [
      task({ name: "Big", estimateMinutes: 300 }),
      task({ name: "Small", estimateMinutes: 30 }),
      task({ name: "Loose" }),
    ];
    const s = suggestNextTask(tasks, 60, "2026-10-05T10");
    expect(s?.task.name).toBe("Small");
    expect(s?.text).toContain("Small");
  });

  it("falls back to a task without an estimate when none fits", () => {
    const s = suggestNextTask([task({ name: "Big", estimateMinutes: 300 }), task({ name: "Loose" })], 60, "seed");
    expect(s?.task.name).toBe("Loose");
    expect(s?.text).not.toMatch(/takes about|You have time for/);
  });

  it("offers nothing without free time or anything that fits", () => {
    expect(suggestNextTask([task({ name: "Loose" })], 0, "seed")).toBeNull();
    expect(suggestNextTask([task({ estimateMinutes: 300 })], 60, "seed")).toBeNull();
    expect(suggestNextTask([], 60, "seed")).toBeNull();
  });

  it("keeps its wording for the same seed and varies it across seeds", () => {
    const t = task({ id: "fixed", name: "Read", estimateMinutes: 30 });
    expect(suggestNextTask([t], 120, "2026-10-05T10")?.text).toBe(suggestNextTask([t], 120, "2026-10-05T10")?.text);
    const texts = new Set(
      Array.from({ length: 24 }, (_, h) => suggestNextTask([t], 120, `2026-10-05T${h}`)?.text),
    );
    expect(texts.size).toBeGreaterThan(1);
  });
});
