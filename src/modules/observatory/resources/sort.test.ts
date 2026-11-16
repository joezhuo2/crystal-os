import { describe, expect, it } from "vitest";
import type { Course } from "../model";
import { sortByKeywords } from "./sort";

const course = (code: string, keywords: string[] = [], archived = false): Course =>
  ({ code, name: code, term: "2026F", color: "", keywords, outcomes: [], exams: [], assessments: [], archived });

const courses = [
  course("MATH117", ["derivative", "integral", "conic"]),
  course("MATH115", ["matrix", "eigenvalue", "vector"]),
  course("ECE105", ["momentum", "kinematics"]),
  course("ECE150", ["pointer"], true),
];

describe("sortByKeywords", () => {
  it.each(["MATH 117 notes.pdf", "MATH117_ps1.pdf", "Math117 Problem Set.pdf", "math-117.pdf"])("matches the course code in %s", (name) =>
    expect(sortByKeywords(courses, name, "").match).toBe("MATH117"));

  it("matches the course code on the first page", () =>
    expect(sortByKeywords(courses, "outline.pdf", "ECE 105 Classical Mechanics").match).toBe("ECE105"));

  it("does not match a longer code or a prefixed one", () => {
    expect(sortByKeywords(courses, "MATH1170.pdf", "").match).toBeNull();
    expect(sortByKeywords(courses, "AMATH117.pdf", "").match).toBeNull();
  });

  it("refuses when two course codes appear", () => {
    const r = sortByKeywords(courses, "MATH117 vs MATH115.pdf", "");
    expect(r.match).toBeNull();
    expect(r.candidates.slice(0, 2).map((c) => c.code)).toEqual(["MATH115", "MATH117"]);
  });

  it("accepts a clear keyword match", () => {
    const r = sortByKeywords(courses, "sheet.pdf", "Find the derivative and the integral of each conic");
    expect(r.match).toBe("MATH117");
    expect(r.candidates[0]).toEqual({ code: "MATH117", score: 3, reasons: ["keywords: derivative, integral, conic"] });
  });

  it("refuses a weak or contested keyword match", () => {
    expect(sortByKeywords(courses, "sheet.pdf", "one derivative").match).toBeNull();
    expect(sortByKeywords(courses, "sheet.pdf", "derivative integral of a matrix vector").match).toBeNull();
  });

  it("ranks every active course for the popup, most likely first", () => {
    const r = sortByKeywords(courses, "x.pdf", "momentum");
    expect(r.match).toBeNull();
    expect(r.candidates.map((c) => c.code)).toEqual(["ECE105", "MATH115", "MATH117"]);
  });
});
