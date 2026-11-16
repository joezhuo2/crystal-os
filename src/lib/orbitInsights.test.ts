import { describe, expect, it } from "vitest";
import { daysOf, reviewInsights } from "./orbitReview";

// 2026-11-02 is a Monday.
const days = daysOf({ start: "2026-11-02", end: "2026-11-15" });
const base = { days, focusByDay: [], completionDays: [], habits: [], checkIndex: new Map<string, Set<string>>(), estimates: [] };

describe("reviewInsights", () => {
  it("says nothing when there is nothing to go on", () => {
    expect(reviewInsights(base)).toEqual([]);
  });

  it("compares focus on the days a habit was done with the rest", () => {
    const gymDays = ["2026-11-02", "2026-11-04", "2026-11-06"];
    const lines = reviewInsights({
      ...base,
      days: days.slice(0, 7),
      focusByDay: days.slice(0, 7).map((day) => ({ day, minutes: gymDays.includes(day) ? 140 : 100 })),
      habits: [
        { id: "gym", name: "Gym" },
        { id: "rare", name: "Rare" },
      ],
      checkIndex: new Map([
        ["gym", new Set(gymDays)],
        ["rare", new Set(["2026-11-02"])],
      ]),
    });
    expect(lines).toEqual(["You focus 40% more on days you do Gym."]);
  });

  it("names the deepest focus weekday and the busiest one, from two weeks up", () => {
    const input = {
      ...base,
      focusByDay: days.map((day) => ({ day, minutes: day === "2026-11-05" || day === "2026-11-12" ? 180 : 30 })),
      completionDays: [...Array(6).fill("2026-11-03"), ...Array(4).fill("2026-11-09")],
    };
    expect(reviewInsights(input)).toEqual([
      "Thursdays are your deepest focus days: 3 h on average.",
      "You finish the most tasks on Tuesdays: 6 of 10.",
    ]);
    expect(reviewInsights({ ...input, days: days.slice(0, 7) })).toEqual([]);
  });

  it("picks the category furthest off its estimates, with at least two tasks", () => {
    const lines = reviewInsights({
      ...base,
      estimates: [
        { label: "Study", tasks: 4, avgDiffPercent: 35 },
        { label: "Chores", tasks: 1, avgDiffPercent: 90 },
        { label: "Work", tasks: 3, avgDiffPercent: -10 },
      ],
    });
    expect(lines).toEqual(["Study tasks overrun their estimates by 35% on average."]);
  });
});
