import { describe, expect, it } from "vitest";
import {
  addDays,
  completionUpdates,
  describeRepeat,
  isTaskOverdue,
  normalizeRepeat,
  normalizeRepeatDays,
  normalizeWeekdays,
  rescheduleToToday,
  taskFallsOnDate,
  type RepeatRule,
} from "./utils";

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

describe("normalizeWeekdays", () => {
  it("sorts, dedupes and drops anything outside 0-6", () => {
    expect(normalizeWeekdays([5, 1, 3, 1, 7, -1, 2.5, "4"])).toEqual([1, 3, 5]);
  });

  it("treats a non-array as no weekdays", () => {
    expect(normalizeWeekdays(null)).toEqual([]);
  });
});

describe("normalizeRepeat", () => {
  it("reads a row saved before repeat kinds as every N days", () => {
    expect(normalizeRepeat(null, 7, null)).toEqual({ kind: "days", every: 7 });
    expect(normalizeRepeat(null, null, null)).toBeUndefined();
  });

  it("needs a day count for days and after", () => {
    expect(normalizeRepeat("after", 3, null)).toEqual({ kind: "after", every: 3 });
    expect(normalizeRepeat("after", 0, null)).toBeUndefined();
    expect(normalizeRepeat("days", -2, null)).toBeUndefined();
  });

  it("needs at least one weekday for weekly", () => {
    expect(normalizeRepeat("weekly", null, [1, 3, 5])).toEqual({ kind: "weekly", weekdays: [1, 3, 5] });
    expect(normalizeRepeat("weekly", null, [])).toBeUndefined();
  });

  it("accepts monthly on its own and rejects unknown kinds", () => {
    expect(normalizeRepeat("monthly", null, null)).toEqual({ kind: "monthly" });
    expect(normalizeRepeat("yearly", 1, null)).toBeUndefined();
  });
});

describe("taskFallsOnDate", () => {
  const base = { startDate: "2026-09-01", endDate: "2026-09-01" };
  const on = (repeat: RepeatRule | undefined, date: string, extra = {}) =>
    taskFallsOnDate({ ...base, ...extra, repeat }, date);

  it("repeats every N days after the start", () => {
    const repeat: RepeatRule = { kind: "days", every: 7 };
    expect(on(repeat, "2026-09-08")).toBe(true);
    expect(on(repeat, "2026-09-09")).toBe(false);
    expect(on(repeat, "2026-08-25")).toBe(false);
  });

  it("does not repeat with a zero or negative interval", () => {
    expect(on({ kind: "days", every: 0 }, "2026-09-08")).toBe(false);
    expect(on({ kind: "days", every: -3 }, "2026-09-04")).toBe(false);
    expect(on({ kind: "days", every: -3 }, "2026-09-01")).toBe(true);
  });

  // 2026-09-01 is a Tuesday.
  it("repeats weekly on the chosen weekdays only", () => {
    const repeat: RepeatRule = { kind: "weekly", weekdays: [1, 3, 5] }; // Mon, Wed, Fri
    expect(on(repeat, "2026-09-02")).toBe(true); // Wed
    expect(on(repeat, "2026-09-04")).toBe(true); // Fri
    expect(on(repeat, "2026-09-07")).toBe(true); // Mon
    expect(on(repeat, "2026-09-08")).toBe(false); // Tue
    expect(on(repeat, "2026-08-31")).toBe(false); // Mon before the start
  });

  it("keeps a weekly repeat's length", () => {
    const repeat: RepeatRule = { kind: "weekly", weekdays: [5] }; // Fri, two days long
    const extra = { endDate: "2026-09-02" };
    expect(on(repeat, "2026-09-04", extra)).toBe(true); // Fri
    expect(on(repeat, "2026-09-05", extra)).toBe(true); // Sat, day two of Fri's
    expect(on(repeat, "2026-09-06", extra)).toBe(false); // Sun
  });

  it("repeats monthly on the start's day of the month", () => {
    const repeat: RepeatRule = { kind: "monthly" };
    const extra = { startDate: "2026-09-15", endDate: "2026-09-15" };
    expect(on(repeat, "2026-10-15", extra)).toBe(true);
    expect(on(repeat, "2027-01-15", extra)).toBe(true);
    expect(on(repeat, "2026-10-16", extra)).toBe(false);
    expect(on(repeat, "2026-08-15", extra)).toBe(false);
  });

  it("moves a monthly repeat on the 31st to the last day of shorter months", () => {
    const repeat: RepeatRule = { kind: "monthly" };
    const extra = { startDate: "2026-01-31", endDate: "2026-01-31" };
    expect(on(repeat, "2026-02-28", extra)).toBe(true);
    expect(on(repeat, "2026-04-30", extra)).toBe(true);
    expect(on(repeat, "2026-05-31", extra)).toBe(true);
    expect(on(repeat, "2026-05-30", extra)).toBe(false);
    expect(on(repeat, "2028-02-29", extra)).toBe(true);
  });

  it("only shows the pending occurrence of an after-completion repeat", () => {
    const repeat: RepeatRule = { kind: "after", every: 3 };
    expect(on(repeat, "2026-09-01")).toBe(true);
    expect(on(repeat, "2026-09-04")).toBe(false);
  });
});

describe("completionUpdates", () => {
  it("completes a one-off or scheduled repeat", () => {
    const task = { startDate: "2026-09-01", endDate: "2026-09-01" };
    expect(completionUpdates(task, "2026-09-03")).toEqual({ completed: true });
    expect(completionUpdates({ ...task, repeat: { kind: "weekly", weekdays: [1] } }, "2026-09-03")).toEqual({ completed: true });
  });

  it("moves an after-completion repeat to N days from today, keeping its length", () => {
    const task = { startDate: "2026-09-01", endDate: "2026-09-02", repeat: { kind: "after", every: 3 } as const };
    expect(completionUpdates(task, "2026-09-05")).toEqual({ startDate: "2026-09-08", endDate: "2026-09-09" });
  });
});

describe("addDays", () => {
  it("crosses month, year and DST boundaries by whole days", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("describeRepeat", () => {
  it("labels each kind", () => {
    expect(describeRepeat({ kind: "days", every: 1 }, "2026-09-01")).toBe("Daily");
    expect(describeRepeat({ kind: "days", every: 3 }, "2026-09-01")).toBe("Every 3 days");
    expect(describeRepeat({ kind: "weekly", weekdays: [1, 3, 5] }, "2026-09-01")).toBe("Mon, Wed, Fri");
    expect(describeRepeat({ kind: "monthly" }, "2026-09-22")).toBe("Monthly on the 22nd");
    expect(describeRepeat({ kind: "after", every: 1 }, "2026-09-01")).toBe("1 day after done");
    expect(describeRepeat(undefined, "2026-09-01")).toBe("");
  });
});

describe("isTaskOverdue", () => {
  const task = { startDate: "2026-09-20", endDate: "2026-09-21", completed: false };

  it("flags open one-off tasks past their end date", () => {
    expect(isTaskOverdue(task, "2026-09-22")).toBe(true);
    expect(isTaskOverdue(task, "2026-09-21")).toBe(false);
    expect(isTaskOverdue({ ...task, completed: true }, "2026-09-22")).toBe(false);
  });

  it("never flags scheduled repeats, but does flag after-completion chores", () => {
    expect(isTaskOverdue({ ...task, repeat: { kind: "weekly", weekdays: [1] } }, "2026-09-30")).toBe(false);
    expect(isTaskOverdue({ ...task, repeat: { kind: "after", every: 3 } }, "2026-09-30")).toBe(true);
  });
});

describe("rescheduleToToday", () => {
  it("starts the task today and keeps its length", () => {
    expect(rescheduleToToday({ startDate: "2026-09-20", endDate: "2026-09-22" }, "2026-09-30")).toEqual({
      startDate: "2026-09-30",
      endDate: "2026-10-02",
    });
  });
});
