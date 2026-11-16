import { describe, expect, it } from "vitest";
import { emptyProgress, topicFromData, type Course, type Progress, type Topic } from "./model";
import { buildObservations, buildQueue, newIntroducedToday, overdueRatio, priorityScore, type CourseStudy } from "./queue";
import type { StoredCard } from "./srs";

const now = new Date(2026, 10, 15, 12);
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const course = (code: string, archived = false): Course => ({ code, name: code, term: "", color: "", keywords: [], outcomes: [], exams: [], assessments: [], archived });

const questions = (...ids: string[]) => ids.map((id) => `> [!question] ${id}\n> front ${id}\n>> [!answer]\n>> back`).join("\n\n");
const topic = (slug: string, priority: string, ids: string[], extra: Record<string, unknown> = {}): Topic =>
  topicFromData({ title: slug, priority, ...extra }, slug, `Summary of ${slug}.\n\n${questions(...ids)}`);

const card = (dueH: number, lastH: number) => ({ dueAt: hours(dueH), lastReviewAt: hours(lastH), stability: 1 }) as unknown as StoredCard;

describe("priorityScore", () => {
  it("follows Decision 17", () => {
    expect(priorityScore(topic("a", "high", []))).toBe(3);
    expect(priorityScore(topic("a", "medium", [], { objective: true }))).toBe(3);
    expect(priorityScore(topic("a", "low", [], { objective: true, tutorial: 2 }))).toBe(1.75);
  });

  it("uses a manual override", () => {
    expect(priorityScore(topic("a", "low", []), 9)).toBe(9);
  });
});

describe("overdueRatio", () => {
  it("is elapsed time over the scheduled interval", () => {
    expect(overdueRatio(card(-24, -72), now)).toBe(1.5);
  });
});

describe("buildQueue", () => {
  it("puts due cards first by priority times overdue ratio, keeping topics together", () => {
    const progress: Progress = {
      ...emptyProgress(),
      cards: {
        "low/l1": card(-48, -72),
        "high/h1": card(-1, -25),
        "high/h2": card(-12, -36),
        "high/h3": card(5, -5),
      },
    };
    const study: CourseStudy = { course: course("MATH117"), progress, topics: [topic("high", "high", ["h1", "h2", "h3"]), topic("low", "low", ["l1"])] };
    const q = buildQueue([study], { now, newPerDay: 0 });
    expect(q.map((i) => i.key)).toEqual(["high/h2", "high/h1", "low/l1"]);
    expect(q[0]!.score).toBeCloseTo(3 * 1.5);
    expect(q[2]!.score).toBe(3);
  });

  it("adds new cards from the highest priority topics, limited per course and day", () => {
    const today = { kind: "review", card: "x/old", grade: 3, at: hours(-1), state: 0 };
    const yesterday = { ...today, at: hours(-30) };
    const a: CourseStudy = {
      course: course("A"),
      progress: { ...emptyProgress(), log: [today, yesterday] },
      topics: [topic("mid", "medium", ["m1", "m2"]), topic("top", "high", ["t1", "t2"])],
    };
    const b: CourseStudy = { course: course("B"), progress: emptyProgress(), topics: [topic("b", "medium", ["b1"], { objective: true, tutorial: 1 })] };
    expect(newIntroducedToday(a.progress, now)).toBe(1);
    const q = buildQueue([a, b], { now, newPerDay: 3 });
    expect(q.map((i) => `${i.course}:${i.key}`)).toEqual(["B:b/b1", "A:top/t1", "A:top/t2"]);
    expect(q.every((i) => i.card === null)).toBe(true);
  });

  it("skips archived courses and questions that are not due", () => {
    const progress = { ...emptyProgress(), cards: { "t/q": card(1, -1) } };
    expect(buildQueue([{ course: course("A"), progress, topics: [topic("t", "high", ["q"])] }], { now })).toEqual([]);
    expect(buildQueue([{ course: course("B", true), progress: emptyProgress(), topics: [topic("t", "high", ["q"])] }], { now })).toEqual([]);
  });
});

describe("buildObservations", () => {
  it("groups up to three items per topic behind its summary", () => {
    const study: CourseStudy = { course: course("A"), progress: emptyProgress(), topics: [topic("a", "high", ["1", "2", "3", "4"]), topic("b", "low", ["5"])] };
    const obs = buildObservations(buildQueue([study], { now }));
    expect(obs.map((o) => [o.topic.slug, o.summary, o.items.map((i) => i.question.id)])).toEqual([
      ["a", "Summary of a.", ["1", "2", "3"]],
      ["a", "Summary of a.", ["4"]],
      ["b", "Summary of b.", ["5"]],
    ]);
  });
});
