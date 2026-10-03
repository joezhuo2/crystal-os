import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { fromMinutes, layoutDay, snapMinutes, toMinutes, weekDates } from "./timeGrid";

function event(id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    calendarId: "primary",
    summary: id,
    description: "",
    location: "",
    allDay: false,
    startDate: "2026-09-30",
    startTime: start,
    endDate: "2026-09-30",
    endTime: end,
    startISO: "",
    endISO: "",
    recurrence: null,
    recurringEventId: null,
    htmlLink: "",
    ...extra,
  };
}

const DAY = "2026-09-30";
const lanes = (date = DAY, ...events: CalendarEvent[]) =>
  layoutDay(events, date).timed.map((p) => [p.event.id, p.column, p.columns, p.startMin, p.endMin]);

describe("minutes", () => {
  it("round-trips HH:MM", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(fromMinutes(570)).toBe("09:30");
    expect(toMinutes("")).toBe(0);
  });

  it("snaps down to the half hour and stays inside the day", () => {
    expect(snapMinutes(599)).toBe(570);
    expect(snapMinutes(-10)).toBe(0);
    expect(snapMinutes(1439)).toBe(1410);
  });
});

describe("weekDates", () => {
  it("runs Sunday to Saturday around the date, across a month end", () => {
    // 2026-09-30 is a Wednesday.
    expect(weekDates(DAY)).toEqual([
      "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
    expect(weekDates("2026-09-27")[0]).toBe("2026-09-27");
  });
});

describe("layoutDay", () => {
  it("separates all-day events and drops events on other days", () => {
    const result = layoutDay(
      [event("allday", "", "", { allDay: true }), event("timed", "09:00", "10:00"), event("other", "09:00", "10:00", { startDate: "2026-10-01", endDate: "2026-10-01" })],
      DAY,
    );
    expect(result.allDay.map((e) => e.id)).toEqual(["allday"]);
    expect(result.timed.map((p) => p.event.id)).toEqual(["timed"]);
  });

  it("gives events that don't overlap the full width", () => {
    expect(lanes(DAY, event("a", "09:00", "10:00"), event("b", "10:00", "11:00"))).toEqual([
      ["a", 0, 1, 540, 600],
      ["b", 0, 1, 600, 660],
    ]);
  });

  it("puts overlapping events side by side and reuses freed lanes", () => {
    expect(
      lanes(DAY, event("a", "09:00", "11:00"), event("b", "09:30", "10:00"), event("c", "10:00", "10:30")),
    ).toEqual([
      ["a", 0, 2, 540, 660],
      ["b", 1, 2, 570, 600],
      ["c", 1, 2, 600, 630],
    ]);
  });

  it("lays each overlapping run out on its own", () => {
    const result = lanes(DAY, event("a", "09:00", "10:00"), event("b", "09:00", "10:00"), event("c", "14:00", "15:00"));
    expect(result.map(([id, , columns]) => [id, columns])).toEqual([["a", 2], ["b", 2], ["c", 1]]);
  });

  it("clips multi-day events to the day shown", () => {
    const overnight = event("late", "22:00", "02:00", { startDate: "2026-09-30", endDate: "2026-10-01" });
    expect(lanes(DAY, overnight)).toEqual([["late", 0, 1, 1320, 1440]]);
    expect(lanes("2026-10-01", overnight)).toEqual([["late", 0, 1, 0, 120]]);
  });

  it("gives very short events a clickable minimum height", () => {
    expect(lanes(DAY, event("blip", "09:00", "09:05"))[0][4]).toBe(560);
  });
});
