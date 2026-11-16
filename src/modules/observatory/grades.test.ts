import { describe, expect, it } from "vitest";
import { bestOf, computeGrades, neededFor, toGpa } from "./grades";
import type { Course, Score } from "./model";

type Grades = Pick<Course, "exams" | "assessments">;
const TUT = "Tutorial Assignments (best 7 of 9)";
const tens = (...xs: number[]): Score[] => xs.map((score, i) => ({ label: `T${i + 1}`, score, max: 10 }));
const calc = (mid: Score[] = [], final: Score[] = [], tut: Score[] = [], extra: Partial<Record<"mid" | "final" | "tut", object>> = {}): Grades => ({
  exams: [
    { name: "Midterm Exam", date: null, weight: 0.33, scores: mid, ...extra.mid },
    { name: "Final Exam", date: null, weight: 0.53, scores: final, ...extra.final },
  ],
  assessments: [{ name: TUT, weight: 0.14, scores: tut, ...extra.tut }],
});

describe("toGpa", () => {
  it("treats each row as a lower bound", () => {
    expect([100, 90, 89.99, 85, 84.9, 80, 77, 76.99, 73, 70, 67, 63, 60, 57, 53, 50, 49.9, 0].map(toGpa))
      .toEqual([4, 4, 3.9, 3.9, 3.7, 3.7, 3.3, 3.0, 3.0, 2.7, 2.3, 2.0, 1.7, 1.3, 1.0, 0.7, 0, 0]);
  });
});

describe("bestOf", () => {
  it("reads best N of M from a name", () => {
    expect(bestOf(TUT)).toEqual({ keep: 7, of: 9 });
    expect(bestOf("Quizzes, Best 3 out of 4")).toEqual({ keep: 3, of: 4 });
    expect(bestOf("Quizzes (best 9 of 7)")).toBeNull();
    expect(bestOf("Quizzes")).toBeNull();
  });
});

describe("computeGrades", () => {
  it("weights graded work, drops the lowest of a best-of group and counts missed as 0", () => {
    const g = computeGrades(calc([{ label: "Midterm", score: 41, max: 50 }], [], [...tens(10, 9, 8, 7, 6, 5, 4, 3), { label: "T9", score: 0, missed: true }]));
    const tut = g.items[2]!;
    expect(tut).toMatchObject({ average: 70, slots: 7, counted: [0, 1, 2, 3, 4, 5, 6], dropped: [7, 8] });
    expect(tut.gradedWeight).toBeCloseTo(0.14);
    expect(g.gradedWeight).toBeCloseTo(0.47);
    expect(g.remainingWeight).toBeCloseTo(0.53);
    expect(g.current).toBeCloseTo((0.33 * 82 + 0.14 * 70) / 0.47);
    expect(g.current).toBeCloseTo(78.4255, 3);
    expect(g.projected).toBe(g.current);
    expect(g.secured).toBeCloseTo(36.86);
    expect(g.maximum).toBeCloseTo(89.86);
    expect(toGpa(g.current!)).toBe(3.3);
  });

  it("does not drop scores until more than N are in and leaves ungraded slots out", () => {
    const g = computeGrades(calc([], [], tens(10, 8, 6, 4, 2)));
    expect(g.items[2]).toMatchObject({ average: 60, counted: [0, 1, 2, 3, 4], dropped: [] });
    expect(g.items[2]!.gradedWeight).toBeCloseTo(0.1);
    expect(g.items[2]!.remainingWeight).toBeCloseTo(0.04);
    expect(g.current).toBeCloseTo(60);
    expect(g.remainingWeight).toBeCloseTo(0.9);
    expect(g.secured).toBeCloseTo(6);
  });

  it("moves an excused item's weight to the final exam by default", () => {
    const g = computeGrades(calc([{ label: "Midterm", score: 0, excused: true }], [], tens(8, 8, 8, 8, 8, 8, 8)));
    expect(g.items[0]).toMatchObject({ weight: 0, slots: 0, average: null });
    expect(g.items[1]!.weight).toBeCloseTo(0.86);
    expect(g.current).toBeCloseTo(80);
    expect(g.secured).toBeCloseTo(11.2);
    expect(neededFor(g, 50).average).toBeCloseTo((50 - 11.2) / 0.86);
  });

  it("moves excused weight to a chosen item", () => {
    const g = computeGrades(calc([{ label: "Midterm", score: 0, excused: true }], [], [], { mid: { excused_to: TUT.toUpperCase() } }));
    expect(g.items[2]!.weight).toBeCloseTo(0.47);
    expect(g.items[1]!.weight).toBeCloseTo(0.53);
  });

  it("lets a best-of group absorb excused slots and transfers only the shortfall", () => {
    const excused = [0, 1, 2].map((i) => ({ label: `E${i}`, score: 0, excused: true }));
    expect(computeGrades(calc([], [], excused.slice(0, 2))).items[2]).toMatchObject({ slots: 7, weight: 0.14 });
    const g = computeGrades(calc([], [], [...excused, ...tens(5)]));
    expect(g.items[2]!.slots).toBe(6);
    expect(g.items[2]!.weight).toBeCloseTo(0.12);
    expect(g.items[1]!.weight).toBeCloseTo(0.55);
    expect(g.items[2]!.gradedWeight).toBeCloseTo(0.02);
    expect(g.items[2]!.counted).toEqual([3]);
  });

  it("drops the weight of an excused final with no other target and rescales the rest", () => {
    const g = computeGrades(calc([{ label: "Midterm", score: 70 }], [{ label: "Final", score: 0, excused: true }]));
    expect(g.items[1]!.weight).toBe(0);
    expect(g.items[0]!.weight).toBeCloseTo(0.33 / 0.47);
    expect(g.current).toBeCloseTo(70);
    expect(g.secured).toBeCloseTo((70 * 0.33) / 0.47);
  });

  it("rescales weights that do not sum to 1", () => {
    const g = computeGrades({ exams: [], assessments: [{ name: "A", weight: 0.2, scores: [{ label: "A", score: 80 }] }, { name: "B", weight: 0.3 }] });
    expect(g.weightTotal).toBeCloseTo(0.5);
    expect(g.items.map((i) => i.weight)).toEqual([expect.closeTo(0.4), expect.closeTo(0.6)]);
    expect(g.current).toBeCloseTo(80);
    expect(g.secured).toBeCloseTo(32);
    expect(neededFor(g, 50).average).toBeCloseTo(30);
  });

  it("weights items equally when none has a weight", () => {
    const g = computeGrades({
      exams: [{ name: "Midterm", date: null, weight: 0, scores: [{ label: "M", score: 60 }] }, { name: "Final", date: null, weight: 0 }],
      assessments: [{ name: "Labs", weight: 0, scores: [{ label: "L1", score: 18, max: 20 }] }],
    });
    expect(g.equalWeights).toBe(true);
    expect(g.current).toBeCloseTo(75);
    expect(g.secured).toBeCloseTo(50);
    expect(g.maximum).toBeCloseTo(250 / 3);
    expect(neededFor(g, 50)).toEqual({ status: "secured", average: expect.closeTo(0) });
  });

  it("leaves weight-0 items out when other items have weights", () => {
    const g = computeGrades({ exams: [], assessments: [
      { name: "A", weight: 0.5, scores: [{ label: "A", score: 100 }] }, { name: "B", weight: 0, scores: [{ label: "B", score: 0 }] }, { name: "C", weight: 0.5 },
    ] });
    expect(g.equalWeights).toBe(false);
    expect(g.items[1]).toMatchObject({ weight: 0, average: 0, gradedWeight: 0 });
    expect(g.current).toBeCloseTo(100);
  });

  it("ignores scores it cannot read and handles an empty course", () => {
    const g = computeGrades({ exams: [], assessments: [{ name: "A", weight: 1, scores: [{ label: "A", score: Number.NaN }] }] });
    expect(g.current).toBeNull();
    expect(g.remainingWeight).toBeCloseTo(1);
    expect(computeGrades({ exams: [], assessments: [] })).toMatchObject({ current: null, secured: 0, maximum: 0, equalWeights: false });
  });
});

describe("neededFor", () => {
  const g = computeGrades(calc([{ label: "Midterm", score: 41, max: 50 }], [], [...tens(10, 9, 8, 7, 6, 5, 4, 3), { label: "T9", score: 0, missed: true }]));

  it("reports the average needed on the remaining work", () => {
    expect(neededFor(g, 70)).toEqual({ status: "possible", average: expect.closeTo((70 - 36.86) / 0.53) });
    expect(neededFor(g, 80).average).toBeCloseTo(81.3962, 3);
    expect(neededFor(g, 90)).toMatchObject({ status: "impossible", average: expect.closeTo(100.2642, 3) });
    expect(neededFor(g, 30).status).toBe("secured");
  });

  it("answers secured or impossible once nothing is left", () => {
    const done = computeGrades({ exams: [], assessments: [{ name: "A", weight: 1, scores: [{ label: "A", score: 65 }] }] });
    expect(neededFor(done, 60)).toEqual({ status: "secured", average: null });
    expect(neededFor(done, 70)).toEqual({ status: "impossible", average: null });
  });

  it("needs the target itself when nothing is graded", () => expect(neededFor(computeGrades(calc()), 60)).toEqual({ status: "possible", average: expect.closeTo(60) }));
});
