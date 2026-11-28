import { describe, expect, it } from "vitest";
import { buildMap, MAP_BUDGET, parseCitations, parsePicks, rankPages, summarizePages, type AskSource, type MapResource } from "./aiAsk";
import { detectChapters } from "./resources/chapters";
import { doc, filler, page } from "./resources/fixtures/build";
import { bookmarkedBook, courseNotes } from "./resources/fixtures/samples";

const resource = (id: string, d: Parameters<typeof summarizePages>[0], chapters = detectChapters(d).value): MapResource => ({
  id, course: "MATH117", title: `Book ${id}`, type: "textbook", pages: summarizePages(d), chapters,
});

const bigBook = doc(Array.from({ length: 600 }, (_, i) => [{ t: `Section ${i + 1} ${i === 417 ? "Eigenvalues" : "Review"}`, h: 16 }, ...filler(3)]));

describe("summarizePages", () => {
  it("keeps one line per page from its first heading and flags pages with no text", () => {
    const pages = summarizePages(courseNotes);
    expect(pages.map((p) => p.line)).toEqual(["Math Course Notes", "2 Composition", "3 Special Functions", "4 Limits"]);
    expect(summarizePages({ pages: [page(1, [])], outline: [] })[0]!.image).toBe(true);
  });
});

describe("rankPages", () => {
  it("puts the pages that match the question first", () => {
    const ranked = rankPages("What is the absolute value function?", [resource("r1", courseNotes)]);
    expect(ranked[0]).toMatchObject({ id: "r1", page: 3 });
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });
});

describe("buildMap", () => {
  it("lists chapters with page ranges and no page lines when they fit", () => {
    const map = buildMap("derivatives", [{ code: "MATH117", name: "Calculus 1" }], [{ id: "MATH117/limits", title: "Limits", pages: "3-5" }], [resource("r1", bookmarkedBook)]);
    expect(map).toContain("- MATH117: Calculus 1");
    expect(map).toContain("- MATH117/limits: Limits (pages 3-5)");
    expect(map).toContain("- r1: Book r1 [MATH117, textbook, 12 pages]");
    expect(map).toContain("  - 2 Derivatives: pages 6-8");
    expect(map).not.toMatch(/ - p\d+:/);
  });

  it("stays within the budget on a 600-page PDF without chapters and keeps the best matching page", () => {
    const map = buildMap("eigenvalues", [], [], [resource("r1", bigBook, [])]);
    expect(map.length).toBeLessThanOrEqual(MAP_BUDGET);
    expect(map).toContain("  - p418: Section 418 Eigenvalues");
    const lines = map.split("\n").filter((l) => / - p\d+:/.test(l));
    expect(lines.length).toBeGreaterThan(10);
    expect(lines.length).toBeLessThan(600);
  });

  it("falls back to page lines when the chapters do not fit the budget", () => {
    const chapters = Array.from({ length: 40 }, (_, i) => ({ number: String(i + 1), title: `Chapter title ${i + 1}`, startPage: 1, endPage: 12 }));
    const map = buildMap("integrals", [], [], [resource("r1", bookmarkedBook, chapters)], 1000);
    expect(map.length).toBeLessThanOrEqual(1000);
    expect(map).toContain("  - 1 Chapter title 1: pages 1-12");
    expect(map).not.toContain("Chapter title 40");
    expect(map).toMatch(/ - p\d+:/);
  });
});

describe("parsePicks", () => {
  const counts = new Map([["r1", 12], ["r2", 3]]);
  const topics = new Set(["MATH117/limits"]);

  it("drops unknown resources and topics, clamps pages to the document and dedupes", () => {
    const picks = parsePicks(
      { picks: [{ resource: "r9", pages: "1" }, { resource: "r1", pages: "0-2,11-999,2" }, { resource: "r2", pages: "3-1" }, { resource: "r2", pages: 2 }], topics: ["MATH117/limits", "nope", 4] },
      counts,
      topics,
    );
    expect(picks.pages).toEqual([
      { id: "r1", page: 1 }, { id: "r1", page: 2 }, { id: "r1", page: 11 }, { id: "r1", page: 12 },
      { id: "r2", page: 1 }, { id: "r2", page: 2 }, { id: "r2", page: 3 },
    ]);
    expect(picks.topics).toEqual(["MATH117/limits"]);
  });

  it("enforces the page cap and survives garbage", () => {
    expect(parsePicks({ picks: [{ resource: "r1", pages: "1-100000" }] }, counts, topics, 5).pages).toHaveLength(5);
    expect(parsePicks("nonsense", counts, topics)).toEqual({ pages: [], topics: [] });
    expect(parsePicks({ picks: [{ resource: "r1", pages: { a: 1 } }], topics: "x" }, counts, topics)).toEqual({ pages: [], topics: [] });
  });
});

describe("parseCitations", () => {
  const sent: AskSource[] = [
    { key: "r1:12", label: "Book, p. 12", code: "MATH117", pdf: "a.pdf", page: 12 },
    { key: "topic:MATH117/limits", label: "Limits (topic note)", code: "MATH117", topic: "limits" },
  ];

  it("numbers known citations in order, reuses numbers and drops unknown ones", () => {
    const { text, cited } = parseCitations("A limit {{r1:12}}. Also {{topic:MATH117/limits}} and {{ r1 : 12 }} but not {{r1:99}}.", sent);
    expect(text).toBe("A limit [1]. Also [2] and [1] but not.");
    expect(cited.map((c) => c.key)).toEqual(["r1:12", "topic:MATH117/limits"]);
  });
});
