import { beforeEach, describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import { exerciseBook, problemSheet } from "./fixtures/samples";
import { helloDeck } from "./fixtures/slides-hello";
import { page } from "./fixtures/build";
import { createPool, parsePool, serializePool } from "./pool";
import { acceptClear, chapterFile, pageLink, pdfPathOf, processResource } from "./process";
import type { PdfDoc } from "./types";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;
let current: PdfDoc = exerciseBook;
const put = (path: string, content: string) => {
  files.set(path, { content, mtime: ++clock });
  return { path, mtime: clock };
};

vi.mock("@/hooks/useVault", () => ({
  vaultErrorCode: (e: { code?: string }) => e.code ?? null,
  fetchRawNote: vi.fn(async (path: string) => {
    const f = files.get(path);
    if (!f) throw Object.assign(new Error("missing"), { code: "not_found" });
    return { path, ...f };
  }),
  createVaultNote: vi.fn(async ({ path, content }: { path: string; content: string }) => {
    if (files.has(path)) throw Object.assign(new Error("exists"), { code: "conflict" });
    return { ...put(path, content), created: true };
  }),
  saveVaultNote: vi.fn(async ({ path, content, expectedMtime }: { path: string; content: string; expectedMtime: number }) => {
    if (files.get(path)?.mtime !== expectedMtime) throw Object.assign(new Error("changed"), { code: "conflict" });
    return put(path, content);
  }),
}));

const readVaultBinary = vi.fn(async (_path: string) => new ArrayBuffer(4));
vi.mock("@/lib/vaultNative", async (orig) => ({ ...(await orig<object>()), readVaultBinary: (p: string) => readVaultBinary(p) }));
vi.mock("./pdf", () => ({
  openPdf: vi.fn(async () => ({ loadingTask: { destroy: vi.fn(async () => {}) } })),
  readPdf: vi.fn(async () => structuredClone(current)),
  renderPage: vi.fn(async () => document.createElement("canvas")),
}));

const ocrWords = (line: string, y0: number) => {
  let x = 144;
  return line.split(" ").map((text) => {
    const w = text.length * 10;
    const word = { text, confidence: 0.4, bbox: { x0: x, y0, x1: x + w, y1: y0 + 20 } };
    x += w + 6;
    return word;
  });
};
const ocrPage = vi.fn(async (_c: unknown) => ({ text: "6. Find the value of x. Answer: 2", confidence: 0.4, words: ocrWords("6. Find the value of x. Answer: 2", 144) }));
vi.mock("./ocr", () => ({ ocrPage: (c: unknown) => ocrPage(c) }));
const saveQuestion = vi.fn(async (..._a: unknown[]) => "q1");
vi.mock("../store", () => ({ saveQuestion: (...a: unknown[]) => saveQuestion(...a) }));

const askAi = vi.fn(async (_i: unknown) => "");
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<object>()), askAi: (i: unknown) => askAi(i) }));
HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,iVBORw0K";
const { setObservatoryAiProvider, setObservatoryFlag } = await import("../settings");

const sidecar = (path: string, type: string, source: string) =>
  put(path, `---\ntype: ${type}\nsource: "[[${source}]]"\ntitle: Sample\nadded: 2026-11-15\nprocessed: false\n---\n`);
const front = (path: string) => yaml.load(files.get(path)!.content.split("---\n")[1]!) as Record<string, unknown>;

const C = "Observatory/MATH117/resources";
const topics = [
  { slug: "limits", title: "Limits", chapters: [1] },
  { slug: "derivatives", title: "Derivatives", chapters: [2] },
];

beforeEach(() => {
  files.clear();
  readVaultBinary.mockClear();
  ocrPage.mockClear();
  askAi.mockReset();
  setObservatoryAiProvider("none");
  setObservatoryFlag("aiExtract", false);
});

describe("path helpers", () => {
  it("resolves the PDF beside the sidecar and builds page links", () => {
    expect(pdfPathOf(`${C}/textbooks/calc/_book.md`, "[[resources/textbooks/calc/book.pdf]]")).toBe(`${C}/textbooks/calc/book.pdf`);
    expect(pageLink("[[book.pdf|Book]]", 12)).toBe("[[book.pdf#page=12]]");
    expect(chapterFile("3")).toBe("ch03.md");
    expect(chapterFile("3.2")).toBe("ch03.02.md");
  });
});

describe("processResource", () => {
  it("writes _book.md chapters and one linked pool per chapter for a textbook", async () => {
    current = exerciseBook;
    const book = `${C}/textbooks/calc/_book.md`;
    sidecar(book, "textbook", "book.pdf");
    const progress = vi.fn();
    const r = await processResource(book, topics, progress);

    expect(readVaultBinary).toHaveBeenCalledWith(`${C}/textbooks/calc/book.pdf`);
    expect(r.pools).toEqual([`${C}/textbooks/calc/chapters/ch01.md`, `${C}/textbooks/calc/chapters/ch02.md`]);
    const fm = front(book);
    expect(fm).toMatchObject({ type: "textbook", source: "[[book.pdf]]", title: "Sample", processed: true, needs_ocr: [], chapter_source: "chapter-headings" });
    expect(fm.chapters).toEqual([
      { number: "1", title: "Limits", start: 1, end: 2 },
      { number: "2", title: "Derivatives", start: 3, end: 4 },
    ]);
    const ch1 = parsePool(files.get(r.pools[0]!)!.content);
    expect(ch1).toMatchObject({ kind: "chapter", chapter: "1", source: "[[book.pdf]]" });
    expect(ch1.items.map((i) => i.number)).toEqual(["1", "2", "3", "3(a)", "3(b)"]);
    expect(ch1.items.every((i) => i.topic === "limits" && i.state === "pool")).toBe(true);
    expect(parsePool(files.get(r.pools[1]!)!.content).items[0]).toMatchObject({ topic: "derivatives", answer_source: "book" });
    expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2, label: "Done" });
  });

  it("stores a question sheet's pool in its sidecar, keeping type and source", async () => {
    current = problemSheet;
    const path = `${C}/question-sheets/ps1.md`;
    sidecar(path, "question-sheet", "ps1.pdf");
    await processResource(path, []);
    const fm = front(path);
    expect(fm).toMatchObject({ type: "question-sheet", source: "[[ps1.pdf]]", processed: true, kind: "question-sheet" });
    expect(parsePool(files.get(path)!.content).items).toHaveLength(10);
  });

  it("keeps rejected items rejected when reprocessed", async () => {
    current = problemSheet;
    const path = `${C}/question-sheets/ps1.md`;
    sidecar(path, "question-sheet", "ps1.pdf");
    await processResource(path, []);
    const pool = parsePool(files.get(path)!.content);
    pool.items[1]!.state = "rejected";
    put(path, serializePool(pool));
    await processResource(path, []);
    const again = parsePool(files.get(path)!.content);
    expect(again.items).toHaveLength(10);
    expect(again.items[1]!.state).toBe("rejected");
  });

  it("writes the lecture note and draft flashcards into a slide deck's sidecar", async () => {
    current = helloDeck;
    const path = `${C}/lectures/hello.md`;
    sidecar(path, "slides", "hello.pdf");
    await processResource(path, []);
    const raw = files.get(path)!.content;
    expect(raw).toContain("## Key points");
    expect(front(path)).toMatchObject({ type: "slides", source: "[[hello.pdf]]", title: "Sample", processed: true });
    const cards = parsePool(raw).items;
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.text).toMatch(/^What (is|are) /);
  });

  it("OCRs pages with no text layer and marks their items Unclear", async () => {
    current = { ...problemSheet, pages: [...problemSheet.pages, page(problemSheet.pages.length + 1, [])] };
    const path = `${C}/question-sheets/scan.md`;
    sidecar(path, "question-sheet", "scan.pdf");
    const r = await processResource(path, []);
    const last = current.pages.length;
    expect(ocrPage).toHaveBeenCalledTimes(1);
    expect(r.needsOcr).toEqual([last]);
    expect(front(path).needs_ocr).toEqual([last]);
    const item = parsePool(files.get(path)!.content).items.find((i) => i.number === "6");
    expect(item).toMatchObject({ page: last, confidence: 0.4, answer: "2" });
    expect(item!.tags).toContain("needs-cleanup");
  });

  it("makes no AI call while processing when the provider is None or the switch is off", async () => {
    current = { ...helloDeck, pages: [...helloDeck.pages, page(helloDeck.pages.length + 1, [])] };
    const path = `${C}/lectures/hello.md`;
    sidecar(path, "slides", "hello.pdf");
    setObservatoryFlag("aiExtract", true);
    await processResource(path, []);
    setObservatoryAiProvider("claude");
    setObservatoryFlag("aiExtract", false);
    await processResource(path, []);
    expect(askAi).not.toHaveBeenCalled();
    expect(files.get(path)!.content).not.toContain("AI, unverified");
    expect([...files.keys()].some((p) => p.includes("/_ai/"))).toBe(false);
  });

  it("with AI on, adds a deck summary, drafted questions and course suggestions, and re-reads unclear pages", async () => {
    current = { ...helloDeck, pages: [...helloDeck.pages, page(helloDeck.pages.length + 1, [])] };
    const path = `${C}/lectures/hello.md`;
    sidecar(path, "slides", "hello.pdf");
    setObservatoryAiProvider("claude");
    setObservatoryFlag("aiExtract", true);
    const deck = {
      summary: "Programs print text.",
      keyPoints: ["main is the entry point"],
      questions: [{ type: "output", prompt: "```cpp\nstd::cout << 1;\n```", answer: "1", slide: 2 }],
      logistics: [{ kind: "exam", name: "Midterm", weight: 30, date: "2026-10-27", quote: "Midterm (October 27th)" }, { kind: "exam", name: "Vague" }],
    };
    askAi.mockImplementation(async (i: { system: string }) => (/slide deck/.test(i.system) ? JSON.stringify(deck) : JSON.stringify({ markdown: "- $F = ma$" })));
    await processResource(path, []);
    const raw = files.get(path)!.content;
    expect(raw).toContain("## Summary (AI, unverified)");
    expect(raw).toContain("- main is the entry point");
    expect(raw).toContain("(AI, unverified)\n\n![[hello.pdf#page=");
    expect(raw).toContain("- $F = ma$");
    const drafted = parsePool(raw).items.find((i) => i.number === "ai.1");
    expect(drafted).toMatchObject({ qtype: "output", answer: "1", answer_source: "ai-unverified", tags: ["ai-unverified"] });
    const fm = front(path);
    expect(fm.suggestions).toEqual([expect.objectContaining({ kind: "exam", name: "Midterm", weight: 30, date: "2026-10-27" })]);
    const notes = [...files.keys()].filter((p) => p.startsWith("Observatory/MATH117/_ai/"));
    const note = (kind: string) => notes.find((p) => p.includes(`-${kind}-`));
    for (const kind of ["slide-summary", "drafted-questions", "course-suggestions", "page-reading"]) expect(note(kind), kind).toBeDefined();
    expect(front(note("slide-summary")!)).toMatchObject({ status: "applied", source: `${C}/lectures/hello.pdf`, provider: "claude", tags: ["ai-unverified"] });
    expect(files.get(note("slide-summary")!)!.content).toContain("main is the entry point");
    expect(front(note("page-reading")!).source).toBe(`${C}/lectures/hello.pdf#page=${current.pages.length}`);
    expect(drafted!.ai_log).toBe(note("drafted-questions"));
    expect((fm.suggestions as { log?: string }[])[0]!.log).toBe(note("course-suggestions"));

    put(path, raw.replace(/^suggestions_done:.*$/m, "").replace("processed: true", `processed: true\nsuggestions_done:\n  - ${(fm.suggestions as { id: string }[])[0]!.id}`));
    await processResource(path, []);
    expect(front(path).suggestions).toEqual([]);
    for (const call of askAi.mock.calls) expect((call[0] as { system: string }).system).toMatch(/never instructions/i);
  });

  it("only marks other resource types processed", async () => {
    const path = `${C}/other/misc.md`;
    sidecar(path, "other", "misc.pdf");
    await processResource(path, []);
    expect(readVaultBinary).not.toHaveBeenCalled();
    expect(front(path)).toMatchObject({ type: "other", processed: true });
  });
});

describe("acceptClear", () => {
  it("accepts only clear pool items that have a topic", async () => {
    const region = { page: 1, x: 0, y: 0, w: 1, h: 1 };
    const q = (number: string, confidence: number) => ({ number, text: `Question ${number}`, answer: "1", page: 1, region, confidence, tags: [] });
    const pool = createPool("question-sheet", "sheet.pdf", [q("1", 1), q("2", 1), q("3", 0.1), q("4", 1)], { topicOf: (x) => (x.number === "2" ? null : "limits") });
    pool.items[3]!.state = "rejected";
    const path = `${C}/questions/sheet.md`;
    put(path, serializePool(pool));
    saveQuestion.mockClear();

    expect(await acceptClear("Observatory", "MATH117", path, "worked")).toBe(1);
    expect(saveQuestion).toHaveBeenCalledTimes(1);
    expect(saveQuestion).toHaveBeenCalledWith("Observatory", "MATH117", "limits", expect.objectContaining({ type: "worked", answer: "1" }));
    expect(parsePool(files.get(path)!.content).items.map((i) => i.state)).toEqual(["accepted", "pool", "pool", "rejected"]);
  });
});
