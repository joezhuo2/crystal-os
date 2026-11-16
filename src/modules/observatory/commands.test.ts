import { describe, expect, it } from "vitest";
import { observatoryResults, type ObsContext } from "./commands";
import type { Course, Topic } from "./model";

const course = (code: string, extra: Partial<Course> = {}): Course => ({
  code, name: `${code} name`, term: "2026F", color: "red", keywords: [], outcomes: [], archived: false,
  exams: [
    { name: "Midterm", date: "2026-10-20", weight: 30, scores: [{ label: "Midterm", score: 80 }] },
    { name: "Final exam", date: "2026-12-12", weight: 50 },
  ],
  assessments: [{ name: "Quizzes", weight: 20 }],
  ...extra,
});

const topic = (course: string, slug: string, title: string): Topic =>
  ({ slug, course, title, priority: "medium", objective: false, weeks: [], sections: [], sources: [], tasks: [], events: [], body: "" }) as Topic;

const ctx = (over: Partial<ObsContext> = {}): ObsContext => ({
  courses: [course("MATH115"), course("ECE150"), course("PHYS100", { archived: true })],
  topics: [topic("MATH115", "chain-rule", "Chain rule"), topic("ECE150", "pointers", "Pointers")],
  due: { MATH115: 4, ECE150: 2, "MATH115/chain-rule": 3 },
  mastery: { "MATH115/chain-rule": 0.5 },
  unprocessed: 7,
  unsorted: 2,
  today: "2026-11-15",
  ...over,
});

describe("observatoryResults", () => {
  it("previews an assessment's weight and opens Grades", () => {
    const [r] = observatoryResults("115 final", ctx());
    expect(r).toMatchObject({ title: "MATH115 Final exam", target: { code: "MATH115", tab: "Grades" } });
    expect(r!.detail).toBe("Worth 50% · 2026-12-12 (in 27 days) · not graded yet");
  });

  it("matches a full code with or without a space", () => {
    expect(observatoryResults("math 115 midterm", ctx())[0]?.detail).toContain("scored 80%");
    expect(observatoryResults("math115", ctx())[0]?.id).toBe("course-MATH115");
  });

  it("summarises a course", () => {
    expect(observatoryResults("115", ctx())[0]).toMatchObject({ detail: "Current 80% · Final exam in 27 days · 4 due", target: { code: "MATH115", tab: "Overview" } });
  });

  it("works out what is needed for a target", () => {
    expect(observatoryResults("115 need 80", ctx())[0]?.detail).toBe("Need 80% average on the remaining 70%");
    expect(observatoryResults("115 need 120", ctx())[0]?.detail).toMatch(/out of reach/);
  });

  it("lists grades, exams, review, process all and inbox", () => {
    expect(observatoryResults("grades", ctx()).map((r) => r.id)).toEqual(["grades-MATH115", "grades-ECE150"]);
    expect(observatoryResults("exams", ctx()).map((r) => r.title)).toEqual(["MATH115 Final exam", "ECE150 Final exam"]);
    expect(observatoryResults("exams", ctx())[0]?.detail).toBe("in 27 days · worth 50%");
    expect(observatoryResults("review", ctx())[0]).toMatchObject({ detail: "6 cards due", target: { view: "review" } });
    expect(observatoryResults("review 150", ctx())[0]).toMatchObject({ title: "Review ECE150", target: { view: "review", code: "ECE150" } });
    expect(observatoryResults("process", ctx())[0]).toMatchObject({ detail: "7 unprocessed", target: "process-all" });
    expect(observatoryResults("inbox", ctx())[0]).toMatchObject({ detail: "2 unsorted", target: { view: "inbox" } });
  });

  it("finds topics with mastery and cards due", () => {
    expect(observatoryResults("chain", ctx())[0]).toMatchObject({ detail: "MATH115 · 50% mastered · 3 due", target: { code: "MATH115", tab: "Topics", topic: "chain-rule" } });
  });

  it("ignores archived courses and short queries", () => {
    expect(observatoryResults("100", ctx())).toEqual([]);
    expect(observatoryResults("1", ctx())).toEqual([]);
  });
});
