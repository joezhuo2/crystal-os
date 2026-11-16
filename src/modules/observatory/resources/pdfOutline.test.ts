import { describe, expect, it } from "vitest";
import { OutlineError } from "../outline";
import { parsePdfOutline } from "./pdfOutline";
import { ece105Outline, textPage } from "./fixtures/outline-ece105";
import { UNCLEAR_BELOW, type PdfDoc } from "./types";

const today = new Date("2026-11-15T12:00:00");

describe("parsePdfOutline: ECE 105 style outline", () => {
  const { outline, confidence } = parsePdfOutline(ece105Outline, today, "ECE 105_Fall 2026_Course Outline.pdf");

  it("reads code, name and term", () => {
    expect(outline.code).toBe("ECE105");
    expect(outline.name).toBe("Classical Mechanics");
    expect(outline.term).toBe("2026F");
    expect(confidence.code).toBeGreaterThanOrEqual(UNCLEAR_BELOW);
    expect(confidence.name).toBeGreaterThanOrEqual(UNCLEAR_BELOW);
  });

  it("splits a prose objectives paragraph into sentences with low confidence", () => {
    expect(outline.outcomes).toEqual(["One goal of this course is to teach fundamental physics principles.", "Another goal is to teach general problem-solving strategies."]);
    expect(confidence.outcomes).toBeLessThan(UNCLEAR_BELOW);
  });

  it("reads the main marking scheme and exam dates", () => {
    expect(outline.assessments).toEqual([
      { name: "Assignments", weight: 0.1 },
      { name: "Quizzes", weight: 0.15 },
    ]);
    expect(outline.exams).toEqual([
      { name: "Midterm Exam", date: "2026-10-27", weight: 0.25, done: true },
      { name: "Final Exam", date: "2026-12-10", weight: 0.5, done: false },
    ]);
    expect(confidence.assessments).toBeGreaterThanOrEqual(UNCLEAR_BELOW);
    expect(confidence.exams).toBeLessThan(UNCLEAR_BELOW);
  });

  it("leaves topics empty without a weekly plan", () => {
    expect(outline.topics).toEqual([]);
    expect(confidence.topics).toBeLessThan(UNCLEAR_BELOW);
  });

  it("marks the term unclear when neither the text nor the file name has one", () => {
    const r = parsePdfOutline(ece105Outline, today);
    expect(r.outline.term).toBe("");
    expect(r.confidence.term).toBe(0);
    expect(r.outline.exams.map((e) => e.date)).toEqual(["2025-10-27", "2025-12-10"]);
  });
});

describe("parsePdfOutline: other layouts", () => {
  it("reads outcome lists, weight tables and a weekly plan", () => {
    const doc: PdfDoc = {
      outline: [],
      pages: [
        textPage(1, [
          "MATH 999 Example Course",
          "Winter 2027",
          null,
          "Learning Outcomes",
          "1. Evaluate limits",
          "2. Apply derivatives to",
          "rates of change",
          null,
          "GRADING:",
          "Assignments 20%",
          "Midterm 30%",
          "Final Exam 50%",
          "The midterm is on February 12.",
          null,
          "WEEKLY PLAN:",
          "Week 1: Limits; Continuity",
          "Week 2: Derivatives",
          "Week 3: Continuity",
        ]),
      ],
    };
    const { outline, confidence } = parsePdfOutline(doc, today);
    expect(outline).toMatchObject({ code: "MATH999", name: "Example Course", term: "2027W", outcomes: ["Evaluate limits", "Apply derivatives to rates of change"] });
    expect(confidence.outcomes).toBeGreaterThanOrEqual(UNCLEAR_BELOW);
    expect(outline.assessments).toEqual([{ name: "Assignments", weight: 0.2 }]);
    expect(outline.exams).toEqual([
      { name: "Midterm", date: "2027-02-12", weight: 0.3, done: false },
      { name: "Final Exam", date: null, weight: 0.5 },
    ]);
    expect(outline.topics).toEqual([
      { title: "Limits", weeks: [1], sections: [], objective: false },
      { title: "Continuity", weeks: [1, 3], sections: [], objective: false },
      { title: "Derivatives", weeks: [2], sections: [], objective: false },
    ]);
  });

  it("returns low confidences for garbled or empty text instead of throwing", () => {
    const garbled: PdfDoc = { outline: [], pages: [textPage(1, ["��� x�y ��", "�q��"])] };
    const empty: PdfDoc = { outline: [], pages: [{ index: 1, width: 612, height: 792, items: [], text: "" }] };
    for (const doc of [garbled, empty]) {
      const { confidence } = parsePdfOutline(doc, today);
      for (const v of Object.values(confidence)) expect(v).toBeLessThan(UNCLEAR_BELOW);
    }
  });

  it("throws on a readable PDF that is clearly not an outline", () => {
    const slides: PdfDoc = { outline: [], pages: [textPage(1, ["Hello world!", "What is a program?", "A program receives input and produces output."])] };
    expect(() => parsePdfOutline(slides, today)).toThrow(OutlineError);
  });
});
