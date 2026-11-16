import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { extractSlides, lectureMarkdown } from "./slides";
import { helloDeck } from "./fixtures/slides-hello";
import { handoutDeck } from "./fixtures/slides-handout";
import type { PdfDoc } from "./types";

describe("extractSlides: one slide per page", () => {
  const note = extractSlides(helloDeck);

  it("finds the deck title from the repeated footer and drops footers and page numbers", () => {
    expect(note.title).toBe("Hello world!");
    expect(note.handout).toBe(false);
    const all = JSON.stringify(note.slides);
    expect(all).not.toContain("Course notes");
    expect(note.slides.map((s) => s.numbers)).toEqual([[1], [2], [3], [4, 5]]);
  });

  it("reads titles, bullets with levels and wrapped lines", () => {
    expect(note.slides[0].title).toBe("ECE 150 Fundamentals of Programming");
    expect(note.slides[1].points).toEqual([
      { text: "In this presentation, we will:", level: 0 },
      { text: "Describe programs", level: 1 },
      { text: "Define programming languages", level: 1 },
    ]);
    expect(note.slides[2].points[0].text).toBe("A programming language is a human readable means of specifying the operations a computer is to perform");
  });

  it("takes goals from the outline slide", () => {
    expect(note.goals).toEqual(["Describe programs", "Define programming languages"]);
  });

  it("rebuilds code with indentation and merges slides with the same title", () => {
    const s = note.slides[3];
    expect(s.title).toBe("Our first program");
    expect(s.points.find((p) => p.code)?.text).toBe(['int main() {', '    std::cout << "Hello world!" << std::endl;', "    return 0;", "}"].join("\n"));
    expect(s.points.at(-1)).toEqual({ text: "Compile and run it", level: 0 });
    expect(s.regions.map((r) => r.page)).toEqual([4, 5]);
  });

  it("turns definitions into draft cards with their slide region", () => {
    expect(note.cards).toHaveLength(1);
    expect(note.cards[0]).toMatchObject({ front: "What is a programming language?", slide: 3, region: { page: 3, x: 0, y: 0, w: 720, h: 540 } });
    expect(note.cards[0].confidence).toBeGreaterThan(0.6);
  });

  it("serializes a lecture note with slides frontmatter", () => {
    const md = lectureMarkdown(note, "resources/lectures/hello.pdf");
    const fm = yaml.load(/^---\n([\s\S]*?)\n---\n/.exec(md)![1]) as Record<string, unknown>;
    expect(fm).toMatchObject({ type: "slides", title: "Hello world!", source: "[[resources/lectures/hello.pdf]]", slides: 4 });
    expect(md).toContain("## Goals\n\n- Describe programs\n- Define programming languages");
    expect(md).toContain("### 4-5. Our first program (pp. 4-5)");
    expect(md).toContain("  - Describe programs");
    expect(md).toContain("```\nint main() {\n    return 0;".replace("{\n", '{\n    std::cout << "Hello world!" << std::endl;\n'));
  });
});

describe("extractSlides: 2 by 2 handout", () => {
  const note = extractSlides(handoutDeck);

  it("detects the grid and orders slides by number, not stream order", () => {
    expect(note.handout).toBe(true);
    expect(note.title).toBe("C-style strings");
    expect(note.slides.map((s) => s.title)).toEqual(["C-style strings", "Outline", "Character arrays", "Termination", "Strings", "Default values", "C-style strings"]);
    expect(note.slides[4].numbers).toEqual([5, 6]);
  });

  it("gives each slide its cell region and drops page-level lines", () => {
    expect(note.slides[3].regions[0]).toEqual({ page: 1, x: 306, y: 412, w: 306, h: 360 });
    expect(note.slides[2].regions[0]).toMatchObject({ page: 1, x: 0, y: 412 });
    const all = JSON.stringify(note.slides);
    expect(all).not.toContain("2026-01-05");
    expect(note.slides[3].points).toEqual([{ text: "How long is the string?", level: 0 }]);
  });

  it("keeps code indentation and finds goals and definitions", () => {
    expect(note.slides[5].points[1]).toEqual({ text: "int main() {\n    char phrase[10]{};\n    return 0;\n}", level: 0, code: true });
    expect(note.goals).toEqual(["Review character arrays", "Describe the null character"]);
    expect(note.cards.map((c) => [c.front, c.slide, c.region.x, c.region.page])).toEqual([
      ["What is a character array?", 3, 0, 1],
      ["What is a C-style string?", 8, 306, 2],
    ]);
  });
});

describe("extractSlides: pages without a text layer", () => {
  it("flags them for OCR as unclear", () => {
    const doc: PdfDoc = { outline: [], pages: [{ index: 1, width: 600, height: 800, items: [], text: "" }] };
    const note = extractSlides(doc);
    expect(note.slides).toEqual([]);
    expect(note.ocr).toEqual([{ page: 1, region: { page: 1, x: 0, y: 0, w: 600, h: 800 }, text: "", confidence: 0, unclear: true }]);
    expect(lectureMarkdown(note)).toContain("- p. 1: needs OCR (Unclear)");
  });
});
