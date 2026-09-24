import { describe, expect, it } from "vitest";
import { normalizeRepeatDays, taskFallsOnDate } from "./utils";

describe("normalizeRepeatDays", () => {
  it("keeps positive whole days", () => {
    expect(normalizeRepeatDays(1)).toBe(1);
    expect(normalizeRepeatDays(7)).toBe(7);
  });

  it("rounds fractions down", () => {
    expect(normalizeRepeatDays(3.9)).toBe(3);
  });

  it("treats zero, negatives and sub-day fractions as no repeat", () => {
    expect(normalizeRepeatDays(0)).toBeUndefined();
    expect(normalizeRepeatDays(-3)).toBeUndefined();
    expect(normalizeRepeatDays(0.5)).toBeUndefined();
  });

  it("treats missing and non-numeric values as no repeat", () => {
    expect(normalizeRepeatDays(undefined)).toBeUndefined();
    expect(normalizeRepeatDays(null)).toBeUndefined();
    expect(normalizeRepeatDays(Number.NaN)).toBeUndefined();
    expect(normalizeRepeatDays(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizeRepeatDays("7")).toBeUndefined();
  });
});

describe("taskFallsOnDate", () => {
  const base = { startDate: "2026-09-01", endDate: "2026-09-01" };

  it("repeats every N days after the start", () => {
    const task = { ...base, repeatDays: 7 };
    expect(taskFallsOnDate(task, "2026-09-08")).toBe(true);
    expect(taskFallsOnDate(task, "2026-09-09")).toBe(false);
    expect(taskFallsOnDate(task, "2026-08-25")).toBe(false);
  });

  it("does not repeat with a zero or negative interval", () => {
    expect(taskFallsOnDate({ ...base, repeatDays: 0 }, "2026-09-08")).toBe(false);
    expect(taskFallsOnDate({ ...base, repeatDays: -3 }, "2026-09-04")).toBe(false);
    expect(taskFallsOnDate({ ...base, repeatDays: -3 }, "2026-09-01")).toBe(true);
  });
});
