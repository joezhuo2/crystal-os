import { describe, expect, it } from "vitest";
import {
  currentStreak,
  habitGrid,
  isActiveOn,
  longestRun,
  overallRate,
  sortHabits,
  streakEndingAt,
  summarizeHabits,
  type Habit,
  type HabitCheck,
} from "./habits";
import { buildReview, toMarkdown, type ReviewData } from "./orbitReview";

const iso = (day: string, time = "12:00") => new Date(`${day}T${time}:00`).toISOString();

const habit = (id: string, created: string, extra: Partial<Habit> = {}): Habit => ({
  id,
  name: id,
  color: "hsl(190 95% 82%)",
  position: 0,
  createdAt: iso(created),
  archivedAt: null,
  ...extra,
});

const checks = (habitId: string, ...days: string[]): HabitCheck[] => days.map((day) => ({ habitId, day }));

describe("active days", () => {
  it("counts from the creation day until the archive day", () => {
    const h = habit("read", "2026-10-02", { archivedAt: iso("2026-10-05", "09:00") });
    expect(isActiveOn(h, "2026-10-01")).toBe(false);
    expect(isActiveOn(h, "2026-10-02")).toBe(true);
    expect(isActiveOn(h, "2026-10-04")).toBe(true);
    expect(isActiveOn(h, "2026-10-05")).toBe(false);
  });

  it("orders by position, then creation", () => {
    const a = habit("a", "2026-10-02", { position: 1 });
    const b = habit("b", "2026-10-01", { position: 1 });
    const c = habit("c", "2026-10-03", { position: 0 });
    expect(sortHabits([a, b, c]).map((h) => h.id)).toEqual(["c", "b", "a"]);
  });
});

describe("streaks", () => {
  const days = new Set(["2026-10-01", "2026-10-02", "2026-10-03"]);

  it("lets today stay open until it is ticked", () => {
    expect(currentStreak(days, "2026-10-04")).toBe(3);
    expect(currentStreak(new Set([...days, "2026-10-04"]), "2026-10-04")).toBe(4);
  });

  it("breaks once a whole day is missed", () => {
    expect(currentStreak(days, "2026-10-05")).toBe(0);
  });

  it("counts a strict streak at a period end", () => {
    expect(streakEndingAt(days, "2026-10-03")).toBe(3);
    expect(streakEndingAt(days, "2026-10-04")).toBe(0);
  });

  it("finds the longest run inside a range", () => {
    const gappy = new Set(["2026-09-29", "2026-09-30", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(longestRun(gappy, "2026-09-28", "2026-10-04")).toBe(3);
    // Clipped to the range.
    expect(longestRun(gappy, "2026-10-03", "2026-10-04")).toBe(2);
  });
});

describe("habitGrid", () => {
  const habits = [habit("read", "2026-09-01", { position: 0 }), habit("gym", "2026-10-02", { position: 1 })];
  const all = [...checks("read", "2026-09-30", "2026-10-02"), ...checks("gym", "2026-10-02")];

  it("draws the week as seven cells, Monday first", () => {
    // 2026-10-03 is a Saturday.
    const cells = habitGrid("weekly", "2026-10-03", habits, all);
    expect(cells.map((c) => c?.day)).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
    // Before the gym habit existed, a day has one habit.
    expect(cells[2]).toMatchObject({ total: 1 });
    expect(cells[2]?.done.map((h) => h.name)).toEqual(["read"]);
    expect(cells[4]?.done.map((h) => h.name)).toEqual(["read", "gym"]);
    expect(cells[5]).toMatchObject({ isToday: true, total: 2, future: false });
    expect(cells[6]).toMatchObject({ future: true, total: 2, done: [] });
  });

  it("pads the month into whole Monday-first weeks", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const cells = habitGrid("monthly", "2026-10-03", habits, all);
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]?.day).toBe("2026-10-01");
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells[cells.length - 1]).toBeNull();
  });
});

describe("summarizeHabits", () => {
  const week = { start: "2026-09-28", end: "2026-10-04" };

  it("counts only the days a habit was active", () => {
    const habits = [habit("read", "2026-09-01"), habit("gym", "2026-10-02")];
    const all = [...checks("read", "2026-09-28", "2026-09-29", "2026-10-03", "2026-10-04"), ...checks("gym", "2026-10-02", "2026-10-03")];
    const [read, gym] = summarizeHabits(week, habits, all, "2026-10-10");
    expect(read).toMatchObject({ done: 4, active: 7, rate: 57, longest: 2, streakAtEnd: 2 });
    expect(gym).toMatchObject({ done: 2, active: 3, rate: 67, longest: 2, streakAtEnd: 0 });
    expect(overallRate([read, gym])).toBe(60);
  });

  it("stops at today while the period runs, with today's grace", () => {
    const habits = [habit("read", "2026-09-01")];
    const [read] = summarizeHabits(week, habits, checks("read", "2026-10-01", "2026-10-02"), "2026-10-03");
    expect(read).toMatchObject({ active: 6, done: 2, streakAtEnd: 2 });
  });

  it("leaves out habits archived before the period and ones not yet created", () => {
    const habits = [
      habit("old", "2026-08-01", { archivedAt: iso("2026-09-20") }),
      habit("new", "2026-10-06"),
    ];
    expect(summarizeHabits(week, habits, [], "2026-10-10")).toEqual([]);
    expect(overallRate([])).toBe(0);
  });
});

describe("habits in the review", () => {
  const base: ReviewData = { completions: [], focus: [], tasks: [], transactions: [], notes: [], events: [] };
  const period = { kind: "weekly" as const, start: "2026-09-28", end: "2026-10-04", key: "2026-W40" };

  it("leaves the habit trend and section out with no habits", () => {
    const review = buildReview(period, { ...base, today: "2026-10-10" });
    expect(review.habits).toEqual([]);
    expect(review.trends.some((t) => t.id === "habitRate")).toBe(false);
    const md = toMarkdown(review, { habitNote: "ignored" }, new Date("2026-10-10T12:00:00"));
    expect(md).not.toContain("## Habits");
    expect(md).not.toContain("habits_completion");
  });

  it("adds the trend, frontmatter, table and note", () => {
    const data: ReviewData = {
      ...base,
      today: "2026-10-10",
      habits: [habit("Read | write", "2026-09-01")],
      habitChecks: checks("Read | write", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-09-22"),
    };
    const review = buildReview(period, data);
    const trend = review.trends.find((t) => t.id === "habitRate");
    expect(trend).toMatchObject({ value: 100, previous: 14, format: "percent" });
    const md = toMarkdown(review, { habitNote: "  Steady week.  " }, new Date("2026-10-10T12:00:00"));
    expect(md).toContain("habits_completion: 100");
    expect(md).toContain("| Read \\| write | 7/7 | 100% | 7 | 7 |");
    expect(md).toContain("### Note\n\nSteady week.");
    expect(md).toContain("- **Habit completion:** 100%");
  });
});
