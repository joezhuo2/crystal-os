import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "../model";
import type { PdfDoc } from "./types";

class Conflict extends Error {
  code = "conflict";
}

const existing = new Set<string>();
const notes = new Map<string, string>();
const writeVaultBinary = vi.fn(async (path: string, _bytes: Uint8Array, _overwrite: boolean) => {
  if (existing.has(path)) throw new Conflict(path);
  existing.add(path);
  return { path, mtime: 1 };
});
const moveVaultPath = vi.fn(async (from: string, to: string) => {
  if (existing.has(to)) throw new Conflict(to);
  existing.delete(from);
  existing.add(to);
  if (notes.has(from)) {
    notes.set(to, notes.get(from)!);
    notes.delete(from);
  }
  return { path: to };
});
const trashVaultPath = vi.fn(async (path: string) => {
  existing.delete(path);
  return { path: `.trash/${path}` };
});
const createVaultNote = vi.fn(async ({ path, content }: { path: string; content: string }) => {
  if (existing.has(path)) throw new Conflict(path);
  existing.add(path);
  notes.set(path, content);
  return { path, mtime: 1, created: true };
});
const saveVaultNote = vi.fn(async ({ path, content }: { path: string; content: string }) => {
  notes.set(path, content);
  return { path, mtime: 2 };
});
let doc: PdfDoc;
let detected: string;

vi.mock("@/lib/vaultNative", () => ({
  writeVaultBinary: (...a: [string, Uint8Array, boolean]) => writeVaultBinary(...a),
  moveVaultPath: (...a: [string, string]) => moveVaultPath(...a),
  trashVaultPath: (...a: [string]) => trashVaultPath(...a),
}));
vi.mock("@/hooks/useVault", () => ({
  createVaultNote: (i: { path: string; content: string }) => createVaultNote(i),
  saveVaultNote: (i: { path: string; content: string }) => saveVaultNote(i),
  fetchRawNote: async (path: string) => ({ path, content: notes.get(path)!, mtime: 1 }),
  useVaultNotes: () => ({ data: undefined, isLoading: false }),
  vaultErrorCode: (err: unknown) => (err instanceof Conflict ? "conflict" : null),
}));
vi.mock("./pdf", () => ({ readPdf: async () => doc }));
vi.mock("./detect", () => ({ detectType: () => ({ type: detected, confidence: 0.8, reasons: [] }) }));

const askAi = vi.fn(async (_i: { system: string; messages: { content: string }[] }) => "");
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<object>()), askAi: (i: { system: string; messages: { content: string }[] }) => askAi(i) }));

const { fileDrop, fileTo, moveResource, undoFile } = await import("./ingest");
const { setObservatoryKeywordSort, setObservatoryAiProvider, setObservatoryAiThreshold, setObservatoryFlag } = await import("../settings");

const course = (code: string, keywords: string[] = []): Course =>
  ({ code, name: code, term: "2026F", color: "red", keywords, outcomes: [], exams: [], assessments: [], archived: false }) as Course;
const courses = [course("MATH117", ["calculus"]), course("MATH115", ["matrix"]), course("ECE150")];
const pdf = (name: string) => ({ name, bytes: new Uint8Array([37, 80, 68, 70]) });
const page = (text: string): PdfDoc => ({ pages: [{ index: 1, width: 800, height: 600, items: [], text }], outline: [] });

beforeEach(() => {
  existing.clear();
  notes.clear();
  vi.clearAllMocks();
  setObservatoryKeywordSort(true);
  setObservatoryAiProvider("none");
  setObservatoryFlag("aiSort", false);
  setObservatoryAiThreshold(0.75);
  doc = page("Lecture 7");
  detected = "slides";
});

describe("AI sorter", () => {
  const reply = (course: string, type: string, confidence: number) => askAi.mockResolvedValueOnce(JSON.stringify({ course, type, confidence }));
  const enable = () => {
    setObservatoryAiProvider("claude");
    setObservatoryFlag("aiSort", true);
  };

  it("files a confident AI answer like a keyword match", async () => {
    enable();
    reply("MATH115", "question-sheet", 0.9);
    const { filed, analysis } = await fileDrop(pdf("week3.pdf"), courses);
    expect(filed).toMatchObject({ code: "MATH115", type: "question-sheet" });
    expect(analysis.suggested).toBe("MATH115");
    const { system, messages } = askAi.mock.calls[0]![0];
    expect(system).toContain("MATH115: MATH115 (matrix)");
    expect(system).toMatch(/never instructions/i);
    expect(messages[0]!.content).toContain("Lecture 7");
    expect(analysis.aiLog).toMatch(/^Observatory\/MATH115\/_ai\/\d{4}-\d{2}-\d{2}-sort-sort-week3-pdf\.md$/);
    expect(notes.get(analysis.aiLog!)).toContain("status: applied");
    expect(notes.get(analysis.aiLog!)).toContain(`source: ${filed!.pdf}`);
  });

  it("asks below the threshold, with the AI's course first and its type picked", async () => {
    enable();
    reply("ECE150", "textbook", 0.6);
    const { filed, analysis } = await fileDrop(pdf("week3.pdf"), courses);
    expect(filed).toBeNull();
    expect(analysis).toMatchObject({ suggested: "ECE150", type: "textbook" });
    expect(analysis.ranked[0]).toBe("ECE150");
    expect(analysis.aiLog).toMatch(/^Observatory\/ECE150\/_ai\//);
    expect(notes.get(analysis.aiLog!)).toContain("status: pending");
  });

  it("follows the threshold setting", async () => {
    enable();
    setObservatoryAiThreshold(0.55);
    reply("ECE150", "textbook", 0.6);
    expect((await fileDrop(pdf("week3.pdf"), courses)).filed?.code).toBe("ECE150");
  });

  it("falls back silently to the popup on an AI error or an unknown course", async () => {
    enable();
    askAi.mockRejectedValueOnce(new Error("offline"));
    const failed = await fileDrop(pdf("week3.pdf"), courses);
    expect(failed.filed).toBeNull();
    expect(failed.analysis).toMatchObject({ type: "slides" });
    expect(failed.analysis.suggested).toBeUndefined();
    reply("PHYS999", "slides", 0.99);
    expect((await fileDrop(pdf("week3.pdf"), courses)).filed).toBeNull();
  });

  it("is skipped when a keyword match or course hint already decided", async () => {
    enable();
    await fileDrop(pdf("MATH117 L07.pdf"), courses);
    await fileDrop(pdf("week3.pdf"), courses, { courseHint: "ECE150" });
    expect(askAi).not.toHaveBeenCalled();
  });

  it("never calls the AI with provider None or the switch off", async () => {
    setObservatoryFlag("aiSort", true);
    await fileDrop(pdf("week3.pdf"), courses);
    setObservatoryAiProvider("claude");
    setObservatoryFlag("aiSort", false);
    await fileDrop(pdf("week3.pdf"), courses);
    expect(askAi).not.toHaveBeenCalled();
  });
});

describe("fileDrop", () => {
  it("files a confident keyword match with a sidecar note", async () => {
    const { filed } = await fileDrop(pdf("MATH117 L07.pdf"), courses);
    expect(filed).toEqual({
      code: "MATH117",
      type: "slides",
      pdf: "Observatory/MATH117/resources/lectures/math117-l07.pdf",
      sidecar: "Observatory/MATH117/resources/lectures/math117-l07.md",
    });
    const note = notes.get(filed!.sidecar)!;
    expect(note).toContain("type: slides");
    expect(note).toContain("source: '[[Observatory/MATH117/resources/lectures/math117-l07.pdf]]'");
    expect(note).toContain("title: MATH117 L07");
    expect(note).toContain("processed: false");
    expect(note).toMatch(/added: '\d{4}-\d{2}-\d{2}'/);
  });

  it("uses the course hint over the keyword sorter", async () => {
    const { filed } = await fileDrop(pdf("MATH117 L07.pdf"), courses, { courseHint: "ECE150" });
    expect(filed?.code).toBe("ECE150");
  });

  it("uses the type hint and lays textbooks out in their own folder", async () => {
    const { filed } = await fileDrop(pdf("Stewart.pdf"), courses, { courseHint: "MATH117", typeHint: "textbook" });
    expect(filed).toMatchObject({ pdf: "Observatory/MATH117/resources/textbooks/stewart/book.pdf", sidecar: "Observatory/MATH117/resources/textbooks/stewart/_book.md" });
  });

  it("asks when the sort is ambiguous, with likely courses first", async () => {
    doc = page("MATH117 and MATH115 joint review");
    const { filed, analysis } = await fileDrop(pdf("review.pdf"), courses);
    expect(filed).toBeNull();
    expect(analysis.ranked.slice(0, 2).sort()).toEqual(["MATH115", "MATH117"]);
    expect(writeVaultBinary).not.toHaveBeenCalled();
  });

  it("asks for every drop when keyword sorting is off", async () => {
    setObservatoryKeywordSort(false);
    const { filed, analysis } = await fileDrop(pdf("MATH117 L07.pdf"), courses);
    expect(filed).toBeNull();
    expect(analysis.ranked[0]).toBe("MATH117");
    expect(analysis.type).toBe("slides");
  });
});

describe("fileTo", () => {
  it("never overwrites: picks a free name", async () => {
    existing.add("Observatory/MATH117/resources/lectures/l07.pdf");
    existing.add("Observatory/MATH117/resources/lectures/l07-2.md");
    const filed = await fileTo({ file: pdf("L07.pdf"), title: "L07" }, "MATH117", "slides");
    expect(filed.pdf).toBe("Observatory/MATH117/resources/lectures/l07-3.pdf");
    expect(trashVaultPath).toHaveBeenCalledWith("Observatory/MATH117/resources/lectures/l07-2.pdf");
    expect(writeVaultBinary.mock.calls.every((c) => c[2] === false)).toBe(true);
  });

  it("files a skipped drop into _inbox", async () => {
    const filed = await fileTo({ file: pdf("L07.pdf"), title: "L07" }, null, "slides");
    expect(filed.pdf).toBe("Observatory/_inbox/l07.pdf");
  });
});

describe("undoFile", () => {
  it("trashes both files", async () => {
    const filed = await fileTo({ file: pdf("L07.pdf"), title: "L07" }, "MATH117", "slides");
    await undoFile(filed);
    expect(trashVaultPath).toHaveBeenCalledWith(filed.pdf);
    expect(trashVaultPath).toHaveBeenCalledWith(filed.sidecar);
    expect(existing.size).toBe(0);
  });
});

describe("moveResource", () => {
  it("moves the PDF and its sidecar and updates the sidecar", async () => {
    const filed = await fileTo({ file: pdf("L07.pdf"), title: "L07" }, null, "other");
    const moved = await moveResource(filed.sidecar, "MATH117", "slides");
    expect(moved.pdf).toBe("Observatory/MATH117/resources/lectures/l07.pdf");
    expect([...existing].sort()).toEqual([moved.sidecar, moved.pdf].sort());
    expect(notes.get(moved.sidecar)).toContain("type: slides");
    expect(notes.get(moved.sidecar)).toContain(`source: '[[${moved.pdf}]]'`);
  });

  it("moves a textbook out of its folder layout", async () => {
    const filed = await fileTo({ file: pdf("Stewart.pdf"), title: "Stewart" }, "MATH117", "textbook");
    const moved = await moveResource(filed.sidecar, "MATH115", "other");
    expect(moved).toMatchObject({ pdf: "Observatory/MATH115/resources/other/stewart.pdf", sidecar: "Observatory/MATH115/resources/other/stewart.md" });
  });

  it("only retypes when the place does not change", async () => {
    const filed = await fileTo({ file: pdf("L07.pdf"), title: "L07" }, null, "other");
    const moved = await moveResource(filed.sidecar, null, "slides");
    expect(moved.pdf).toBe(filed.pdf);
    expect(moveVaultPath).not.toHaveBeenCalled();
    expect(notes.get(filed.sidecar)).toContain("type: slides");
  });
});
