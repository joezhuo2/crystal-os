import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ProgressError, courseFromData, emptyProgress, mergeOutline, normalizeCode, outlineToCourse, patchNote, parseCourse, parseProgress, parseTopic,
  serializeCourse, serializeProgress, serializeTopic, slugify, type Course, type Progress, type Topic,
} from "./model";
import { parseUwOutline } from "./outline";

const html = readFileSync("src/modules/observatory/fixtures/math117-outline.html", "utf8");
const today = new Date(2026, 10, 15);

const course: Course = {
  code: "MATH117", name: "Calculus 1", term: "2026F", color: "#7aa2ff", learn_url: "https://learn.example/1",
  keywords: ["limits"], outcomes: ["Evaluate: limits"],
  exams: [{ name: "Midterm", date: "2026-10-22", weight: 0.33, done: true }, { name: "Final", date: null, weight: 0.53 }],
  assessments: [{ name: "Tutorials", weight: 0.14 }], archived: false,
};
const topic: Topic = {
  slug: "chain-rule", course: "MATH117", title: "Chain rule", priority: "high", objective: true, weeks: [3, 4],
  pages: "2-9", sections: ["Guichard 2.5"], tutorial: 2, sources: ["a.pdf"], tasks: ["do q1"], events: [],
  body: "# Notes\n\nSome **text**.\n",
};
const p: Progress = { version: 1, cards: { a: { due: "2026-11-16" } }, mastery: { "chain-rule": 0.5 }, log: [{ t: 1 }] };

describe("model", () => {
  it("normalizes codes", () => { expect(normalizeCode(" math 117 ")).toBe("MATH117"); expect(normalizeCode("ECE150")).toBe("ECE150"); expect(normalizeCode("../x")).toBeNull(); });
  it("slugifies uniquely", () => { const taken = new Set(["review"]); expect(slugify("Review", taken)).toBe("review-2"); expect(slugify("FTC1 & FTC2")).toBe("ftc1-ftc2"); expect(slugify("L'Hopital's Rule (LHR)")).toBe("lhopitals-rule-lhr"); });
  it("round-trips a course", () => expect(parseCourse(serializeCourse(course))).toEqual(course));
  it("round-trips scores and excused targets", () => {
    const graded: Course = {
      ...course,
      exams: [{ ...course.exams[0]!, scores: [{ label: "Midterm", score: 41, max: 50 }] }, { ...course.exams[1]!, excused_to: "Midterm" }],
      assessments: [{ name: "Tutorials", weight: 0.14, scores: [{ label: "T1", score: 9, max: 10 }, { label: "T2", score: 0, excused: true }, { label: "T3", score: 0, missed: true }] }],
    };
    expect(parseCourse(serializeCourse(graded))).toEqual(graded);
  });
  it("keeps exam dates as strings", () => {
    expect(serializeCourse(course)).toContain("date: '2026-10-22'");
    expect(parseCourse("---\ncode: A1\nexams:\n  - {name: M, date: 2026-10-22, weight: 1}\n---\n").exams[0]!.date).toBe("2026-10-22");
  });
  it("round-trips a topic with a body", () => expect(parseTopic(serializeTopic(topic), topic.slug)).toEqual(topic));
  it("round-trips topic chapters", () => {
    const t = { ...topic, chapters: [3, 4] };
    expect(serializeTopic(t)).toContain("chapters:");
    expect(parseTopic(serializeTopic(t), t.slug)).toEqual(t);
    expect(parseTopic(serializeTopic(topic), topic.slug).chapters).toBeUndefined();
  });
  it("fills course defaults", () => expect(parseCourse("---\ncode: ECE105\nname: Mechanics\nterm: 2026F\ncolor: '#fff'\n---\n")).toMatchObject({ keywords: [], exams: [], archived: false }));
  it("fills topic defaults", () => expect(parseTopic("---\ntitle: X\n---\n", "x")).toMatchObject({ priority: "medium", weeks: [], body: "" }));
  it("round-trips progress and keeps the summary readable", () => { const raw = serializeProgress(p, "No reviews yet."); expect(raw).toContain("No reviews yet."); expect(parseProgress(raw)).toEqual(p); });
  it("treats an empty progress file as empty", () => expect(parseProgress("")).toEqual(emptyProgress()));
  it("refuses corrupt progress instead of resetting it", () => {
    expect(() => parseProgress("# Progress\n\n```json\n{ nope\n```\n")).toThrow(ProgressError);
    expect(() => parseProgress("```json\n{\"version\":2}\n```")).toThrow(ProgressError);
  });
  it("trims ISO timestamps to dates", () =>
    expect(courseFromData({ exams: [{ name: "F", date: "2026-12-10T00:00:00.000Z", weight: 1 }] }).exams[0]!.date).toBe("2026-12-10"));
  it("patches frontmatter and keeps the rest", () => {
    expect(patchNote("---\na: 1\nd: 2026-01-02\n---\nBody", { b: 2 })).toBe("---\na: 1\nd: '2026-01-02'\nb: 2\n---\nBody");
    expect(patchNote("Just text", { b: 2 })).toBe("---\nb: 2\n---\nJust text");
    expect(() => patchNote("---\na: [\n---\nBody", { b: 2 })).toThrow();
  });
  it("builds a course from the outline", () => {
    const { course: c, topics } = outlineToCourse(parseUwOutline(html, today), "#7aa2ff");
    expect(c).toMatchObject({ code: "MATH117", term: "2026F", color: "#7aa2ff", archived: false });
    expect(c.exams).toHaveLength(2);
    expect(topics).toHaveLength(32);
    expect(new Set(topics.map((t) => t.slug)).size).toBe(32);
    expect(topics.find((t) => t.title === "Partial Fractions")?.priority).toBe("high");
  });
});

describe("mergeOutline", () => {
  const outline = parseUwOutline(html, today);
  const tutorials = outline.assessments.find((a) => /best 7 of 9/.test(a.name))!.name;
  const base: Course = {
    code: "MATH117", name: "Calc", term: "2026W", color: "#abc", learn_url: "https://learn.example/1", keywords: ["k"],
    outcomes: [outline.outcomes[0]!, "Old outcome"], archived: true,
    exams: [
      { name: "Final Exam", date: "2026-12-09", weight: 0.5, event_id: "ev1", excused_to: "Quiz", scores: [{ label: "Final", score: 70 }] },
      { name: "Quiz", date: null, weight: 0.1, scores: [{ label: "Q", score: 5 }] },
    ],
    assessments: [{ name: tutorials, weight: 0.14, scores: [{ label: "T1", score: 8, max: 10 }] }],
  };
  const mine: Topic = {
    slug: "partial-fractions", course: "MATH117", title: "partial fractions", priority: "low", objective: false, weeks: [9], pages: "1-1",
    sections: [], tutorial: 7, sources: ["a.pdf"], learn_url: "https://x", tasks: ["t"], events: ["e"], body: "Mine",
  };
  const extra: Topic = { ...mine, slug: "conic-sections", title: "Not in outline" };
  const merged = mergeOutline(base, [mine, extra], outline);

  it("replaces outline details and keeps the user's fields", () => {
    expect(merged.course).toMatchObject({
      code: "MATH117", color: "#abc", learn_url: "https://learn.example/1", keywords: ["k"], archived: true,
      name: outline.name, term: "2026F", outcomes: outline.outcomes,
    });
    expect(merged.course.exams.map((e) => e.name)).toEqual(["Midterm Exam", "Final Exam"]);
    expect(merged.course.exams[1]).toMatchObject({ date: "2026-12-10", weight: 0.53, event_id: "ev1" });
    expect(merged.course.exams[0]).not.toHaveProperty("event_id");
  });

  it("keeps scores and excused targets for items whose name matches", () => {
    expect(merged.course.exams[1]).toMatchObject({ excused_to: "Quiz", scores: [{ label: "Final", score: 70 }] });
    expect(merged.course.exams[0]).not.toHaveProperty("scores");
    const tut = merged.course.assessments.find((a) => a.name === tutorials)!;
    expect(tut).toEqual({ ...outline.assessments.find((a) => a.name === tutorials), scores: [{ label: "T1", score: 8, max: 10 }] });
    expect(merged.course.assessments.filter((a) => a.name !== tutorials)).toEqual(outline.assessments.filter((a) => a.name !== tutorials));
    expect(mergeOutline(merged.course, [], outline).course).toEqual(merged.course);
  });

  it("lists every change", () => {
    expect(merged.changes).toEqual([
      `Name: Calc to ${outline.name}`,
      "Term: 2026W to 2026F",
      "6 outcomes changed",
      "Final Exam date 2026-12-09 to 2026-12-10",
      "Midterm Exam added (33%)",
      "Final Exam weight 50% to 53%",
      "Quiz removed",
    ]);
    expect(mergeOutline(merged.course, [], outline).changes).toEqual([]);
  });

  it("updates matched topics by title and keeps the user's work", () => {
    const t = merged.updated.find((x) => x.slug === "partial-fractions")!;
    expect(t).toMatchObject({ title: "partial fractions", priority: "low", body: "Mine", sources: ["a.pdf"], tasks: ["t"], events: ["e"], learn_url: "https://x" });
    expect(t).toMatchObject({ weeks: [2], pages: "11-26", objective: true, sections: ["Guichard §1.1.5, 7.5"] });
    expect(t.tutorial).toBe(2);
  });

  it("adds missing topics with unique slugs and leaves the rest out", () => {
    expect(merged.added).toHaveLength(31);
    expect(merged.added.find((x) => x.title === "Conic Sections")?.slug).toBe("conic-sections-2");
    expect(merged.added.every((x) => x.course === "MATH117" && x.body === "")).toBe(true);
    expect(merged.added.find((x) => x.objective)?.priority).toBe("high");
    expect([...merged.added, ...merged.updated].some((x) => x.title === "Not in outline")).toBe(false);
  });

  it("does not report unchanged topics as updated", () => {
    const again = mergeOutline(merged.course, [...merged.added, ...merged.updated], outline);
    expect(again.added).toEqual([]);
    expect(again.updated).toEqual([]);
  });
});
