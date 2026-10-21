import { beforeEach, describe, expect, it } from "vitest";
import { HABIT_REMINDERS_KEY, habitReminders, parseHabitReminders } from "./habitReminders";

beforeEach(() => {
  localStorage.clear();
  habitReminders._reset();
});

describe("habitReminders", () => {
  it("drops malformed entries and clamps the daily count", () => {
    expect(parseHabitReminders('{"a":{"time":"08:30","perDay":99},"b":{"time":"8:30"},"c":null}')).toEqual({
      a: { time: "08:30", perDay: 24 },
    });
    expect(parseHabitReminders("not json")).toEqual({});
  });

  it("sets, updates and clears a reminder", () => {
    habitReminders.setTime("h1", "07:00");
    habitReminders.setPerDay("h1", "0");
    expect(habitReminders.getState()).toEqual({ h1: { time: "07:00", perDay: 0 } });
    expect(JSON.parse(localStorage.getItem(HABIT_REMINDERS_KEY)!)).toEqual({ h1: { time: "07:00", perDay: 0 } });
    habitReminders.setTime("h1", null);
    expect(habitReminders.getState()).toEqual({});
  });
});
