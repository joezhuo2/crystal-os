import { describe, expect, it } from "vitest";
import { detectType } from "./detect";
import { doc, filler } from "./fixtures/build";
import { bookmarkedBook, conicNotes, outlinePdf, problemSheet, slideDeck } from "./fixtures/samples";

describe("detectType", () => {
  it("detects a question sheet", () => {
    const d = detectType(problemSheet, "ProblemSet1.pdf");
    expect(d.type).toBe("question-sheet");
    expect(d.reasons).toContain("problem set heading");
  });

  it("detects a textbook from bookmarks and length", () => {
    const long = { ...bookmarkedBook, pages: [...bookmarkedBook.pages, ...doc(Array.from({ length: 20 }, () => filler(20))).pages] };
    const d = detectType(long, "calculus.pdf");
    expect(d.type).toBe("textbook");
    expect(d.reasons).toEqual(expect.arrayContaining(["bookmark outline", "long document"]));
  });

  it("detects slides from landscape pages and a repeated footer", () => {
    const d = detectType(slideDeck, "1.01 Intro.pdf");
    expect(d.type).toBe("slides");
    expect(d.reasons).toEqual(["landscape pages", "little text per page", "header or footer repeated on most pages"]);
    expect(d.confidence).toBe(0.9);
  });

  it("detects a course outline", () => {
    const d = detectType(outlinePdf, "ECE 105_Fall 2026_Course Outline.pdf");
    expect(d.type).toBe("outline");
    expect(d.reasons).toEqual(expect.arrayContaining(["course code on the first pages", "assessments heading", "learning objectives heading", "assessment weights"]));
  });

  it("detects assignments and past exams by title", () => {
    expect(detectType(doc([["Assignment 3", "Due Friday"]]), "a3.pdf").type).toBe("assignment");
    expect(detectType(doc([["Midterm Exam 2025", "Instructions: answer all"]]), "old.pdf").type).toBe("past-exam");
  });

  it("falls back to other", () => {
    const d = detectType(doc([["A short memo about parking."]]), "memo.pdf");
    expect(d).toEqual({ type: "other", confidence: 0.3, reasons: ["no strong signal"] });
  });

  it("does not call short notes with sections a question sheet", () => expect(detectType(conicNotes, "ConicSections.pdf").type).not.toBe("question-sheet"));
});
