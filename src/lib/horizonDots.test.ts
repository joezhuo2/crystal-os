import { describe, expect, it } from "vitest";
import type { Task } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { dotsForDate, TASK_DOT_COLORS } from "./horizonDots";

const event = (id: string, startTime: string, over: Partial<CalendarEvent> = {}) =>
  ({ id, startDate: "2026-10-15", endDate: "2026-10-15", startTime, endTime: "", allDay: false, ...over }) as CalendarEvent;
const task = (id: string, startTime: string, over: Partial<Task> = {}) =>
  ({
    id,
    name: id,
    startDate: "2026-10-15",
    endDate: "2026-10-15",
    startTime,
    endTime: "",
    priority: "high",
    categoryId: "",
    completed: false,
    ...over,
  }) as Task;

describe("dotsForDate", () => {
  it("interleaves events and tasks by time", () => {
    const dots = dotsForDate("2026-10-15", [event("a", "09:00"), event("c", "15:00")], [task("b", "12:00")], "#00f");
    expect(dots.map((d) => d.key)).toEqual(["e-a", "t-b", "e-c"]);
  });

  it("colours a task by priority and skips completed tasks", () => {
    const dots = dotsForDate(
      "2026-10-15",
      [],
      [task("u", "", { priority: "urgent" }), task("done", "", { completed: true })],
      "#00f",
    );
    expect(dots).toEqual([{ key: "t-u", time: "", color: TASK_DOT_COLORS.urgent }]);
  });

  it("puts all-day entries first", () => {
    const dots = dotsForDate("2026-10-15", [event("a", "08:00")], [task("b", "")], "#00f");
    expect(dots.map((d) => d.key)).toEqual(["t-b", "e-a"]);
  });
});
