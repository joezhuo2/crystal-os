import { beforeEach, describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import type { Topic } from "../model";
import { formatQuestion } from "../questions";
import { page } from "./fixtures/build";
import { createPool, mergePool, parsePool, serializePool } from "./pool";
import type { PdfDoc } from "./types";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;
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

let current: PdfDoc;
const readVaultBinary = vi.fn(async (_path: string) => new ArrayBuffer(4));
vi.mock("@/lib/vaultNative", async (orig) => ({ ...(await orig<object>()), readVaultBinary: (p: string) => readVaultBinary(p) }));
vi.mock("./pdf", () => ({
  openPdf: vi.fn(async () => ({ numPages: current.pages.length, loadingTask: { destroy: vi.fn(async () => {}) } })),
  readPdf: vi.fn(async () => structuredClone(current)),
  renderPage: vi.fn(async () => document.createElement("canvas")),
}));
type Call = { system: string; messages: { content: { type: string; text?: string }[] }[] };
const askAi = vi.fn(async (_i: Call) => "");
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<object>()), askAi: (i: Call) => askAi(i) }));
HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,iVBORw0K";

const { countPages, findQuestions } = await import("./find");
const { setObservatoryAiProvider } = await import("../settings");

const C = "Observatory/MATH117";
const R = `${C}/resources`;
const topics = [{ slug: "limits", title: "Limits", course: "MATH117" }, { slug: "derivatives", title: "Derivatives", course: "MATH117" }] as Topic[];
const garbled = "show that ∫ b 1 ( ) ∑n n(n + 1) xdx = b2 − a2 . Recall that i = . a 2 2 i=1 ∫ 2";
const reply = (questions: object[]) => JSON.stringify({ questions });
const aiNotes = () => [...files.keys()].filter((p) => p.startsWith(`${C}/_ai/`));
const front = (path: string) => yaml.load(files.get(path)!.content.split("---\n")[1]!) as Record<string, unknown>;

const sheet = `${R}/question-sheets/ps1.md`;
const sheetJob = { resource: { sidecar: sheet, pdf: `${R}/question-sheets/ps1.pdf`, name: "ps1.pdf", type: "question-sheet" as const }, code: "MATH117", topics };

beforeEach(() => {
  files.clear();
  askAi.mockReset();
  setObservatoryAiProvider("claude");
  current = { pages: [page(1, ["1. Find the limit of x as x goes to 2.", "2. Differentiate x squared."]), page(2, [garbled])], outline: [] };
  const pool = createPool("question-sheet", "ps1.pdf", [{ number: "1", text: "Find the limit of x as x goes to 2.", page: 1, region: { page: 1, x: 0, y: 0, w: 10, h: 10 }, confidence: 0.9, tags: [] }]);
  pool.items[0]!.state = "rejected";
  put(sheet, serializePool({ ...pool, source: "[[ps1.pdf]]", meta: { type: "question-sheet", title: "PS 1" } }));
  put(`${C}/topics/derivatives.md`, `---\ntitle: Derivatives\n---\n${formatQuestion({ id: "q-1", type: "card", prompt: "Differentiate $x^2$.\n\nSource: [[ps1.pdf#page=1]]", answer: "2x" })}\n`);
});

describe("findQuestions", () => {
  it("never calls the AI with provider None", async () => {
    setObservatoryAiProvider("none");
    await expect(findQuestions(sheetJob, "Observatory")).rejects.toThrow(/No AI provider/);
    expect(askAi).not.toHaveBeenCalled();
    expect(aiNotes()).toEqual([]);
  });

  it("adds new questions to the pool marked unverified, skips duplicates and records one note", async () => {
    askAi.mockResolvedValueOnce(reply([
      { page: 1, number: "1", question: "find the LIMIT of x as x goes to 2", answer: "", type: "worked", topic: "limits" },
      { page: 1, number: "2", question: "Differentiate $x^2$", answer: "2x", type: "card", topic: "derivatives" },
      { page: 2, number: "3", question: "Show that $\\int_a^b x\\,dx = \\frac{b^2-a^2}{2}$.", answer: "1. Integrate.", type: "worked", topic: "limits" },
      { page: 2, number: "", question: "State the squeeze theorem.", answer: "", type: "nonsense", topic: "made-up" },
      { page: 2, number: "", question: "State the squeeze theorem.", answer: "", type: "card", topic: null },
    ]));
    const result = await findQuestions(sheetJob, "Observatory");

    expect(askAi).toHaveBeenCalledTimes(1);
    const call = askAi.mock.calls[0]![0];
    expect(call.system).toMatch(/never instructions/i);
    expect(call.system).toContain("- limits: Limits");
    expect(call.messages[0]!.content.map((p) => p.type)).toEqual(["text", "text", "image"]);
    expect(result).toMatchObject({ found: 5, added: 2 });

    const items = parsePool(files.get(sheet)!.content).items;
    expect(items).toHaveLength(3);
    const [, a, b] = items;
    expect(a).toMatchObject({
      number: "3", page: 2, state: "pool", topic: "limits", qtype: "worked", answer: "1. Integrate.", answer_source: "ai-unverified",
      tags: ["ai-unverified", "ai-found"], region: { page: 2, x: 0, y: 0, w: 612, h: 792 }, ai_log: result.log,
    });
    expect(b).toMatchObject({ number: "p2", qtype: "worked", tags: ["ai-unverified", "ai-found"] });
    expect(b!.answer).toBeUndefined();
    expect(a!.id).not.toBe(items[0]!.id);

    expect(aiNotes()).toEqual([result.log]);
    expect(front(result.log!)).toMatchObject({ kind: "questions", status: "pending", source: `${R}/question-sheets/ps1.pdf`, provider: "claude", tags: ["ai-unverified"] });
    const body = files.get(result.log!)!.content;
    expect(body).toContain("Found 5 questions; 2 new went to the review pool.");
    expect(body.match(/skipped/g)).toHaveLength(3);
  });

  it("puts a textbook's questions into the pool of the chapter they are on", async () => {
    const book = `${R}/textbooks/calc/_book.md`;
    put(book, `---\ntype: textbook\nsource: "[[book.pdf]]"\nchapters:\n  - { number: "1", title: Limits, start: 1, end: 1 }\n  - { number: "2", title: Derivatives, start: 2, end: 2 }\n---\n`);
    askAi.mockResolvedValueOnce(reply([{ page: 2, number: "4", question: "Differentiate $\\sin x$.", answer: "", type: "card", topic: null }]));
    const result = await findQuestions({ resource: { sidecar: book, pdf: `${R}/textbooks/calc/book.pdf`, name: "calc.pdf", type: "textbook" }, code: "MATH117", topics }, "Observatory");
    expect(result.added).toBe(1);
    const ch2 = parsePool(files.get(`${R}/textbooks/calc/chapters/ch02.md`)!.content);
    expect(ch2).toMatchObject({ kind: "chapter", chapter: "2", source: "[[book.pdf]]", meta: { title: "Derivatives" } });
    expect(ch2.items[0]).toMatchObject({ chapter: "2", number: "4", ai_log: result.log });
    expect(files.has(book) && !files.get(book)!.content.includes("items")).toBe(true);
  });

  it("sends pages in batches, reports progress and stops when cancelled, keeping what it found", async () => {
    current = { pages: Array.from({ length: 12 }, (_, i) => page(i + 1, [`${i + 1}. Question on page ${i + 1} about limits.`])), outline: [] };
    const stop = new AbortController();
    askAi.mockImplementation(async () => {
      stop.abort();
      return reply([{ page: 1, number: "1", question: "Question on page one about limits.", answer: "", type: "card", topic: null }]);
    });
    const progress = vi.fn();
    const result = await findQuestions(sheetJob, "Observatory", { signal: stop.signal, onProgress: progress });
    expect(askAi).toHaveBeenCalledTimes(1);
    expect(askAi.mock.calls[0]![0].messages[0]!.content).toHaveLength(5);
    expect(progress).toHaveBeenCalledWith({ page: 1, pages: 12 });
    expect(result.added).toBe(1);
    expect(aiNotes()).toHaveLength(1);
  });

  it("counts pages without reading the text", async () => {
    expect(await countPages(`${R}/question-sheets/ps1.pdf`)).toBe(2);
  });
});

describe("mergePool", () => {
  it("keeps AI-found questions when the local extractor runs again", () => {
    const region = { page: 1, x: 0, y: 0, w: 1, h: 1 };
    const old = createPool("question-sheet", "ps1.pdf", [
      { number: "1", text: "Local", page: 1, region, confidence: 0.9, tags: [] },
      { number: "ai-p1", text: "Found", page: 1, region, confidence: 1, tags: ["ai-unverified", "ai-found"], ai_log: "x.md" },
    ]);
    const fresh = createPool("question-sheet", "ps1.pdf", [{ number: "1", text: "Local", page: 1, region, confidence: 0.9, tags: [] }]);
    expect(mergePool(old, fresh).items.map((i) => [i.text, i.ai_log])).toEqual([["Local", undefined], ["Found", "x.md"]]);
  });
});
