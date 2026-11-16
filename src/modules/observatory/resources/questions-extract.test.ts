import { describe, expect, it } from "vitest";
import { detectChapters } from "./chapters";
import { conicNotes, exerciseBook, problemSheet } from "./fixtures/samples";
import { extractQuestions, splitAnswer } from "./questions-extract";

const byNumber = (items: ReturnType<typeof extractQuestions>) => Object.fromEntries(items.map((q) => [q.number, q]));

describe("extractQuestions on a question sheet with inline answers", () => {
  const items = extractQuestions(problemSheet, { sheet: true });
  const q = byNumber(items);

  it("splits top-level questions and groups sub-parts under them", () => {
    expect(items.map((i) => i.number)).toEqual(["1", "1(a)", "1(b)", "1(c)", "2", "3", "4", "4(a)", "4(b)", "5"]);
    expect(q["1(b)"]).toMatchObject({ parent: "1", text: "9x2 + 4y2 - 18x + 8y = 23" });
    expect(q["1"]!.text).toBe("Identify and sketch the following conic sections:");
  });

  it("splits inline answers by sub-part", () => {
    expect(q["1"]!.answer).toBeUndefined();
    expect(q["1(a)"]).toMatchObject({ answer: "parabola, vertex (-1, 1)", answer_source: "sheet" });
    expect(q["1(b)"]!.answer).toBe("ellipse, centre (1, -1)");
    expect(q["4(b)"]!.answer).toBe("R(f ) = (0, 1)");
  });

  it("splits an answer that shares a line with the question", () => {
    expect(q["2"]!.text).toBe("The points A(d, -d) and B(12 - d, 2d - 6) both lie on a circle centered at the origin. Determine the possible values of d.");
    expect(q["2"]!.answer).toBe("d = 6 or d = 10");
  });

  it("does not split on garbled math lines or page numbers, and stops at the next heading", () => {
    expect(q["3"]!.text).toContain("1 - e- 1");
    expect(q["3"]!.answer).toBe("f (5) = 6");
    expect(q["4(b)"]!.text).toBe("the range of f (x), R(f ), and");
    expect(q["5"]!.answer).toBe("f (x) = x2 with domain x in [-2, 0]");
    expect(items.some((i) => i.text.includes("Guichard") || i.answer?.includes("Guichard"))).toBe(false);
  });

  it("records the page and a region covering the question but not its answer", () => {
    expect(q["4"]!.page).toBe(2);
    const r = q["1"]!.region;
    expect(r).toMatchObject({ page: 1, x: 72 });
    expect(r.y + r.h).toBeLessThanOrEqual(q["1(c)"]!.region.y + q["1(c)"]!.region.h);
    expect(q["1(a)"]!.region.y).toBeGreaterThan(r.y);
  });

  it("tags garbled items for cleanup", () => {
    expect(q["1(c)"]!.confidence).toBeLessThan(1);
    expect(q["4(a)"]!.confidence).toBeLessThan(1);
    expect(q["5"]!.tags).toEqual(["needs-cleanup"]);
    expect(q["5"]!.confidence).toBeLessThan(0.6);
    expect(q["2"]!.tags).toEqual([]);
    expect(q["2"]!.confidence).toBeGreaterThanOrEqual(0.6);
  });
});

describe("extractQuestions on a textbook", () => {
  const chapters = detectChapters(exerciseBook).value;
  const items = extractQuestions(exerciseBook, { chapters });
  const key = (i: { chapter?: string; number: string }) => `${i.chapter}:${i.number}`;

  it("reads only the Exercises sections, with chapters", () =>
    expect(items.map(key)).toEqual(["1:1", "1:2", "1:3", "1:3(a)", "1:3(b)", "2:1", "2:2"]));

  it("matches odd-numbered answers by chapter and number", () => {
    const got = Object.fromEntries(items.map((i) => [key(i), [i.answer, i.answer_source]]));
    expect(got["1:1"]).toEqual(["7", "book"]);
    expect(got["1:2"]).toEqual([undefined, undefined]);
    expect(got["1:3(a)"]).toEqual(["1", "book"]);
    expect(got["1:3(b)"]).toEqual(["8", "book"]);
    expect(got["2:1"]).toEqual(["2x cos of x squared", "book"]);
  });

  it("splits inline sub-parts on one line", () =>
    expect(items.find((i) => key(i) === "1:3(b)")!.text).toBe("lim 2x as x approaches 4"));
});

describe("extractQuestions on notes", () => {
  it("finds the Suggested Exercises list and ignores numbered lines elsewhere", () => {
    const items = extractQuestions(conicNotes);
    expect(items.map((i) => [i.number, i.chapter, i.text])).toEqual([
      ["1", "5", "y = x2 + 2x + 2"],
      ["2", "5", "9x2 + 4y2 - 18x + 8y = 23"],
      ["3", "5", "x2 - 2y2 = 4"],
    ]);
    expect(items.every((i) => i.tags.length === 0)).toBe(true);
  });
});

describe("splitAnswer", () => {
  it("keeps a lead-in and splits parts in order", () =>
    expect(splitAnswer("see below (a) 1, (b) 2, and (c) 3", ["a", "b", "c"])).toEqual({ head: "see below", parts: { a: "1", b: "2", c: "3" } }));
  it("leaves an answer without markers whole", () => expect(splitAnswer("odd", ["a"])).toEqual({ head: "odd", parts: {} }));
});
