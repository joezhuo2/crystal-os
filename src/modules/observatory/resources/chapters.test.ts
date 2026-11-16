import { describe, expect, it } from "vitest";
import { detectChapters, linkTopic, pageLines, parsePageRange } from "./chapters";
import { page } from "./fixtures/build";
import { bookmarkedBook, chapterBook, conicNotes, courseNotes } from "./fixtures/samples";

describe("pageLines", () => {
  it("joins items on one row and orders rows top to bottom", () => {
    const p = page(1, ["second|row", "third"]);
    p.items.reverse();
    expect(pageLines(p).map((l) => l.text)).toEqual(["second row", "third"]);
  });
});

describe("detectChapters", () => {
  it("uses numbered bookmarks under a single root", () => {
    const r = detectChapters(bookmarkedBook);
    expect(r.source).toBe("bookmarks");
    expect(r.value).toEqual([
      { number: "1", title: "Limits", startPage: 3, endPage: 5 },
      { number: "2", title: "Derivatives", startPage: 6, endPage: 8 },
      { number: "3", title: "Integrals", startPage: 9, endPage: 12 },
    ]);
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it("finds Chapter N headings and skips the contents page", () => {
    const r = detectChapters(chapterBook);
    expect(r.source).toBe("chapter-headings");
    expect(r.value).toEqual([
      { number: "1", title: "Limits", startPage: 2, endPage: 2 },
      { number: "2", title: "Derivatives", startPage: 3, endPage: 3 },
    ]);
  });

  it("splits notes by numbered section headings, ignoring list items and labels", () => {
    const r = detectChapters(conicNotes);
    expect(r.source).toBe("section-headings");
    expect(r.value.map((c) => [c.number, c.title, c.startPage, c.endPage])).toEqual([
      ["1", "Parabolas", 1, 1],
      ["2", "Circles and Ellipses", 2, 2],
      ["3", "Hyperbolas", 3, 3],
      ["4", "Summary", 3, 3],
      ["5", "Suggested Exercises", 4, 4],
    ]);
    expect(r.confidence).toBe(0.7);
  });

  it("keeps the top level when subsections exist", () => {
    const r = detectChapters(courseNotes);
    expect(r.value.map((c) => `${c.number} ${c.title} ${c.startPage}-${c.endPage}`)).toEqual([
      "1 Review of the Basics 1-1",
      "2 Composition 2-2",
      "3 Special Functions 3-3",
      "4 Limits 4-4",
    ]);
  });

  it("returns nothing for a plain document", () => {
    expect(detectChapters({ pages: [page(1, ["just text"])], outline: [] })).toEqual({ value: [], confidence: 0, source: "none" });
  });
});

describe("linkTopic", () => {
  const topics = [
    { slug: "limits", title: "Limits", chapters: [1] },
    { slug: "chain-rule", title: "Chain rule", pages: "11-26, 30" },
    { slug: "conics", title: "Conic sections", sections: ["2.4"] },
  ];
  it("parses page ranges", () => expect(parsePageRange("11-26, 30")).toEqual([[11, 26], [30, 30]]));
  it("links by chapter, then section number", () => {
    expect(linkTopic(topics, { chapter: "1" })).toBe("limits");
    expect(linkTopic(topics, { chapter: "1.3" })).toBe("limits");
    expect(linkTopic(topics, { chapter: "2.4" })).toBe("conics");
  });
  it("links by page range", () => expect(linkTopic(topics, { chapter: "9", page: 30 })).toBe("chain-rule"));
  it("falls back to keyword overlap", () =>
    expect(linkTopic(topics, { page: 99, text: "Identify the following conic sections" })).toBe("conics"));
  it("leaves unmatched items unsorted", () => expect(linkTopic(topics, { page: 99, text: "Something else" })).toBeNull());
});
