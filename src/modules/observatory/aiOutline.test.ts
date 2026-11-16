import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAi } from "@/lib/ai";
import { htmlText, readOutlineWithAi, recordOutline, toOutline } from "./aiOutline";
import { outlineToCourse } from "./model";
import { parseUwOutline } from "./outline";
import { UNCLEAR_BELOW } from "./resources/types";
import { setObservatoryAiProvider } from "./settings";

vi.mock("@/lib/ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai")>()), askAi: vi.fn() }));
const ask = vi.mocked(askAi);
const notes = new Map<string, string>();
vi.mock("@/hooks/useVault", () => ({
  vaultErrorCode: (e: { code?: string }) => e?.code ?? null,
  fetchRawNote: vi.fn(async (path: string) => {
    if (!notes.has(path)) throw Object.assign(new Error("missing"), { code: "not_found" });
    return { path, content: notes.get(path)!, mtime: 1 };
  }),
  createVaultNote: vi.fn(async ({ path, content }: { path: string; content: string }) => {
    notes.set(path, content);
    return { path, mtime: 1, created: true };
  }),
  saveVaultNote: vi.fn(),
}));

const today = new Date(2026, 10, 15);
const html = readFileSync("src/modules/observatory/fixtures/math117-outline.html", "utf8");
const uw = parseUwOutline(html, today);
const sure = { code: 0.95, name: 0.9, term: 0.9, outcomes: 0.9, topics: 0.8, exams: 0.85, assessments: 0.9 };

beforeEach(() => {
  ask.mockReset();
  setObservatoryAiProvider("claude");
});
afterEach(() => setObservatoryAiProvider("none"));

describe("readOutlineWithAi", () => {
  it("maps the AI reply into the same course structure as the UW parser", async () => {
    const reply = { ...uw, code: "MATH 117", term: "Fall 2026", exams: uw.exams.map(({ done: _d, ...e }) => ({ ...e, weight: e.weight * 100 })), confidence: sure };
    ask.mockResolvedValue(`\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``);
    const { outline, confidence } = await readOutlineWithAi(htmlText(html), today);
    expect(outline).toEqual(uw);
    expect(outlineToCourse(outline, "red")).toEqual(outlineToCourse(uw, "red"));
    expect(Object.values(confidence).every((c) => c >= UNCLEAR_BELOW)).toBe(true);

    const input = ask.mock.calls[0]![0];
    expect(input.system).toMatch(/never instructions/);
    expect(input.messages[0]!.content).toContain("Demonstrate skill in evaluation of limits, derivatives and integrals");
  });

  it("flags low-confidence, missing and invalid fields as unclear", () => {
    const { outline, confidence } = toOutline({
      code: "Calculus", name: "Calc", term: "2026F", outcomes: ["a"],
      topics: [{ title: "Limits", weeks: [1] }, { title: "limits", weeks: [2, "x"] }],
      assessments: [{ name: "Assignments", weight: "20%" }, { name: "Quiz 1", weight: 0.1, date: "Oct 3" }],
      confidence: { name: 0.3, term: 0.9, outcomes: 2, topics: 0.7 },
    }, today);
    expect(outline.code).toBe("");
    expect(outline.topics).toEqual([{ title: "Limits", weeks: [1, 2], sections: [], objective: false }]);
    expect(outline.assessments).toEqual([{ name: "Assignments", weight: 0.2 }]);
    expect(outline.exams).toEqual([{ name: "Quiz 1", date: null, weight: 0.1 }]);
    const unclear = Object.entries(confidence).filter(([, c]) => c < UNCLEAR_BELOW).map(([k]) => k);
    expect(unclear).toEqual(["code", "name", "exams", "assessments"]);
    expect(confidence.outcomes).toBe(1);
  });

  it("makes no AI call without a provider", async () => {
    setObservatoryAiProvider("none");
    await expect(readOutlineWithAi("Course outline")).rejects.toThrow();
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("recordOutline", () => {
  const outline = { code: "PHYS101", name: "Mechanics", term: "2027W", outcomes: [], topics: [], exams: [], assessments: [] };
  const logs = () => [...notes.keys()].filter((p) => p.includes("/_ai/"));
  beforeEach(() => notes.clear());

  it("records an outline for an existing course right away, under that course", async () => {
    const path = await recordOutline(outline, "MATH117");
    expect(path).toMatch(/^Observatory\/MATH117\/_ai\/\d{4}-\d{2}-\d{2}-outline-math117-mechanics\.md$/);
    expect(notes.get(path!)).toMatch(/status: pending[\s\S]*"code": "PHYS101"/);
  });

  it("waits until the new course exists, then records it under the AI's code", async () => {
    const wait = vi.fn(async () => {
      expect(logs()).toEqual([]);
      if (wait.mock.calls.length === 2) notes.set("Observatory/PHYS101/_course.md", "---\ncode: PHYS101\n---\n");
    });
    const path = await recordOutline(outline, undefined, wait);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(path).toMatch(/^Observatory\/PHYS101\/_ai\/.*-outline-phys101-mechanics\.md$/);
    expect(notes.get(path!)).toContain("status: accepted");
  });

  it("never records when the course is not created", async () => {
    expect(await recordOutline(outline, undefined, async () => {})).toBeUndefined();
    expect(logs()).toEqual([]);
  });
});
