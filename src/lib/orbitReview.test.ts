import { describe, expect, it } from "vitest";
import {
  buildAgenda,
  buildReview,
  exportPath,
  inProgressPeriod,
  isoWeek,
  latestReadyPeriod,
  periodContaining,
  periodLabel,
  periodStats,
  shiftPeriod,
  toMarkdown,
  weekOfPeriod,
  type ReviewData,
} from "./orbitReview";

const local = (day: string, time = "12:00") => new Date(`${day}T${time}:00`);
const iso = (day: string, time = "12:00") => local(day, time).toISOString();

const empty: ReviewData = { completions: [], focus: [], tasks: [], transactions: [], notes: [], events: [] };

describe("review periods", () => {
  it("runs weeks Monday to Sunday", () => {
    // 2026-10-03 is a Saturday.
    expect(periodContaining("weekly", "2026-10-03")).toMatchObject({ start: "2026-09-28", end: "2026-10-04", key: "2026-W40" });
    expect(periodContaining("weekly", "2026-10-04").start).toBe("2026-09-28");
    expect(periodContaining("weekly", "2026-10-05").start).toBe("2026-10-05");
  });

  it("makes the week's review ready at 18:00 on Sunday", () => {
    expect(latestReadyPeriod("weekly", local("2026-10-04", "17:59")).start).toBe("2026-09-21");
    expect(latestReadyPeriod("weekly", local("2026-10-04", "18:00")).start).toBe("2026-09-28");
    expect(latestReadyPeriod("weekly", local("2026-10-07", "09:00")).start).toBe("2026-09-28");
  });

  it("makes the month's review ready at 18:00 on its last day", () => {
    expect(latestReadyPeriod("monthly", local("2026-10-31", "17:59")).key).toBe("2026-09");
    expect(latestReadyPeriod("monthly", local("2026-10-31", "18:00")).key).toBe("2026-10");
    expect(latestReadyPeriod("monthly", local("2026-02-28", "18:30"))).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("offers the period still in progress until its review is ready", () => {
    // Saturday: last week's review is the latest ready one, this week is still running.
    expect(inProgressPeriod("weekly", local("2026-10-03"))).toMatchObject({ start: "2026-09-28", end: "2026-10-04" });
    expect(inProgressPeriod("monthly", local("2026-10-03"))?.key).toBe("2026-10");
    // From 18:00 on the last day the current period is the ready review itself.
    expect(inProgressPeriod("weekly", local("2026-10-04", "18:00"))).toBeNull();
    expect(inProgressPeriod("monthly", local("2026-10-31", "18:00"))).toBeNull();
  });

  it("steps across month and year ends", () => {
    const jan = periodContaining("monthly", "2027-01-15");
    expect(shiftPeriod(jan, -1)).toMatchObject({ key: "2026-12", end: "2026-12-31" });
    expect(shiftPeriod(jan, 1)).toMatchObject({ key: "2027-02", end: "2027-02-28" });
    const week = periodContaining("weekly", "2026-12-30");
    expect(shiftPeriod(week, 1).start).toBe("2027-01-04");
  });

  it("numbers ISO weeks by their Thursday", () => {
    expect(isoWeek("2026-12-31")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-03")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
  });

  it("labels and names periods", () => {
    const week = periodContaining("weekly", "2026-10-01");
    expect(periodLabel(week)).toBe("Sep 28 – Oct 4, 2026");
    expect(exportPath(week)).toBe("Reviews/Weekly/2026-W40.md");
    const month = periodContaining("monthly", "2026-10-01");
    expect(periodLabel(month)).toBe("October 2026");
    expect(exportPath(month)).toBe("Reviews/Monthly/2026-10.md");
  });

  it("counts weeks of a month from its first Monday-started week", () => {
    const oct = periodContaining("monthly", "2026-10-15");
    expect(weekOfPeriod(oct, "2026-10-01")).toBe(1);
    expect(weekOfPeriod(oct, "2026-10-05")).toBe(2);
    expect(weekOfPeriod(oct, "2026-10-31")).toBe(5);
  });
});

describe("period stats", () => {
  const week = periodContaining("weekly", "2026-10-01");

  it("counts only what falls inside the period", () => {
    const data: ReviewData = {
      ...empty,
      completions: [
        { title: "A", completedAt: iso("2026-09-28", "00:30") },
        { title: "B", completedAt: iso("2026-10-04", "23:30") },
        { title: "C", completedAt: iso("2026-10-05", "00:10") },
      ],
      focus: [
        { endedAt: iso("2026-09-30"), seconds: 1500 },
        { endedAt: iso("2026-10-02"), seconds: 1530 },
        { endedAt: iso("2026-10-06"), seconds: 1500 },
      ],
      tasks: [
        { name: "New", startDate: "2026-10-01", endDate: "2026-10-01", completed: false, createdAt: iso("2026-10-01") },
        { name: "Old", startDate: "2026-09-01", endDate: "2026-09-01", completed: false, createdAt: iso("2026-09-01") },
      ],
      transactions: [
        { amount: 1000, type: "income", date: "2026-10-01" },
        { amount: 25.5, type: "expense", date: "2026-10-02" },
        { amount: 10.25, type: "expense", date: "2026-10-04" },
        { amount: 99, type: "expense", date: "2026-10-05" },
      ],
      notes: [
        { title: "n1", path: "n1.md", created: "2026-09-29" },
        { title: "n2", path: "n2.md", created: "2026-09-27" },
        { title: "n3", path: "n3.md", created: null },
      ],
    };
    expect(periodStats(week, data)).toEqual({ done: 2, added: 1, focusMinutes: 51, income: 1000, expenses: 35.75, notes: 1 });
  });

  it("compares with last period and the four-week average", () => {
    const data: ReviewData = {
      ...empty,
      completions: [
        // This week: 3. Last week: 1. Two and three weeks back: 2 each. Four back: 3.
        ...["2026-09-29", "2026-09-30", "2026-10-01"].map((d) => ({ title: d, completedAt: iso(d) })),
        { title: "w-1", completedAt: iso("2026-09-22") },
        { title: "w-2a", completedAt: iso("2026-09-15") },
        { title: "w-2b", completedAt: iso("2026-09-16") },
        { title: "w-3a", completedAt: iso("2026-09-08") },
        { title: "w-3b", completedAt: iso("2026-09-09") },
        ...["2026-08-31", "2026-09-01", "2026-09-02"].map((d) => ({ title: d, completedAt: iso(d) })),
      ],
    };
    const review = buildReview(week, data);
    const done = review.trends.find((t) => t.id === "done");
    expect(done).toMatchObject({ value: 3, previous: 1, average: 2 });
    expect(review.completedTitles).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("totals focus per day", () => {
    const review = buildReview(week, { ...empty, focus: [{ endedAt: iso("2026-10-01"), seconds: 3000 }, { endedAt: iso("2026-10-01", "20:00"), seconds: 600 }] });
    expect(review.focusByDay).toHaveLength(7);
    expect(review.focusByDay.find((d) => d.day === "2026-10-01")?.minutes).toBe(60);
    expect(review.focusPerDay).toBe(9);
  });
});

describe("agenda", () => {
  const next = periodContaining("weekly", "2026-10-07");

  it("lists events and each open task once, in order", () => {
    const agenda = buildAgenda(next, {
      events: [
        { summary: "Dentist", startDate: "2026-10-06", startTime: "09:30", allDay: false },
        { summary: "Holiday", startDate: "2026-10-11", startTime: "", allDay: true },
        { summary: "Later", startDate: "2026-10-20", startTime: "", allDay: true },
      ],
      tasks: [
        { name: "Daily", startDate: "2026-09-01", endDate: "2026-09-01", completed: false, repeat: { kind: "days", every: 1 } },
        { name: "Report", startDate: "2026-10-08", endDate: "2026-10-09", startTime: "14:00", completed: false },
        { name: "Done", startDate: "2026-10-08", endDate: "2026-10-08", completed: true },
      ],
    });
    expect(agenda.map((a) => a.title)).toEqual(["Daily", "Dentist", "Report", "Holiday"]);
    expect(agenda[0]).toMatchObject({ day: "2026-10-05", repeats: true, kind: "task" });
    expect(agenda[2]).toMatchObject({ time: "14:00" });
  });
});

describe("markdown export", () => {
  const week = periodContaining("weekly", "2026-10-01");
  const review = buildReview(week, {
    ...empty,
    completions: [{ title: "Ship v0.8.0", completedAt: iso("2026-10-01") }],
    transactions: [{ amount: 12, type: "expense", date: "2026-10-01" }],
    notes: [{ title: "Orbit ideas", path: "Ideas/Orbit.md", created: "2026-10-02" }],
  });

  it("puts the numbers in frontmatter and lists the names", () => {
    const md = toMarkdown(review, undefined, local("2026-10-04", "18:00"));
    expect(md).toMatch(/^---\ntype: weekly-review\nperiod: 2026-W40\n/);
    expect(md).toContain("tasks_completed: 1");
    expect(md).toContain("expenses: 12");
    expect(md).toContain("- Ship v0.8.0");
    expect(md).toContain("[[Ideas/Orbit|Orbit ideas]]");
    expect(md).not.toContain("## Reflection");
  });

  it("adds the chosen prompt and note, either one optional", () => {
    expect(toMarkdown(review, { prompt: "Focus for next", note: "Less email." })).toContain(
      "## Reflection\n\n### Focus for next week\n\nLess email.\n",
    );
    expect(toMarkdown(review, { prompt: null, note: "Just a note" })).toContain("## Reflection\n\nJust a note\n");
    expect(toMarkdown(review, { prompt: "What went well", note: "  " })).toContain("### What went well");
  });
});
