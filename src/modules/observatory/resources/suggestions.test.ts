import { beforeEach, describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import { cleanSuggestion, type CourseSuggestion } from "./ai";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;
const saveVaultNote = vi.fn(async ({ path, content }: { path: string; content: string }) => {
  files.set(path, { content, mtime: ++clock });
  return { path, mtime: clock };
});
vi.mock("@/hooks/useVault", () => ({
  fetchRawNote: async (path: string) => ({ path, ...files.get(path)! }),
  saveVaultNote: (i: { path: string; content: string }) => saveVaultNote(i),
}));

const { acceptSuggestion, applySuggestion, dismissSuggestion } = await import("./suggestions");

const COURSE = "Observatory/ECE105/_course.md";
const SIDECAR = "Observatory/ECE105/resources/lectures/lecture-1.md";
const midterm = cleanSuggestion({ kind: "exam", name: "Midterm", weight: 30, date: "2026-10-27", quote: "Midterm (October 27th)" })!;
const quizzes = cleanSuggestion({ kind: "assessment", name: "Quizzes", weight: 10 })!;
const front = (path: string) => yaml.load(files.get(path)!.content.split("---\n")[1]!, { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;

beforeEach(() => {
  files.clear();
  vi.clearAllMocks();
  files.set(COURSE, { content: "---\ncode: ECE105\nname: Mechanics\nterm: 2026F\ncolor: blue\nexams:\n  - name: Midterm\n    date: 2026-10-19\n    weight: 25\n    event_id: ev1\nassessments: []\n---\nNotes stay.\n", mtime: ++clock });
  files.set(SIDECAR, { content: `---\n${yaml.dump({ type: "slides", suggestions: [midterm, quizzes] })}---\n# Lecture 1\n`, mtime: ++clock });
});

describe("course suggestions", () => {
  it("validates AI logistics and gives them stable ids", () => {
    expect(cleanSuggestion({ kind: "exam", name: "Final" })).toBeNull();
    expect(cleanSuggestion({ kind: "grade", name: "Final", weight: 50 })).toBeNull();
    expect(cleanSuggestion({ kind: "exam", name: "Final", weight: 500, date: "Dec 10" })).toBeNull();
    expect(cleanSuggestion({ kind: "exam", name: "Midterm", weight: 30, date: "2026-10-27" })!.id).toBe(midterm.id);
  });

  it("updates a matching exam and keeps its other fields", () => {
    const out = applySuggestion(files.get(COURSE)!.content, midterm);
    expect(out).toContain("Notes stay.");
    expect(yaml.load(out.split("---\n")[1]!, { schema: yaml.CORE_SCHEMA })).toMatchObject({
      exams: [{ name: "Midterm", date: "2026-10-27", weight: 30, event_id: "ev1" }],
    });
  });

  it("writes _course.md only on accept, and settles the suggestion either way", async () => {
    await dismissSuggestion(SIDECAR, quizzes.id);
    expect(saveVaultNote.mock.calls.map((c) => c[0].path)).toEqual([SIDECAR]);
    expect(front(COURSE).assessments).toEqual([]);
    expect(front(SIDECAR)).toMatchObject({ suggestions: [midterm], suggestions_done: [quizzes.id] });

    await acceptSuggestion("Observatory", "ECE105", SIDECAR, midterm);
    expect(front(COURSE).exams).toMatchObject([{ name: "Midterm", weight: 30, date: "2026-10-27" }]);
    expect(front(SIDECAR)).toMatchObject({ suggestions: [], suggestions_done: [quizzes.id, midterm.id] });
  });

  it("marks the AI note applied on accept, and dismissed only when its last suggestion is dismissed", async () => {
    const LOG = "Observatory/ECE105/_ai/2026-11-15-course-suggestions-x.md";
    const status = () => /^status: (\S+)/m.exec(files.get(LOG)!.content)![1];
    const reset = () => {
      files.set(LOG, { content: "---\nkind: course-suggestions\nstatus: pending\n---\n# x\n", mtime: ++clock });
      files.set(SIDECAR, { content: `---\n${yaml.dump({ type: "slides", suggestions: [{ ...midterm, log: LOG }, { ...quizzes, log: LOG }] })}---\n`, mtime: ++clock });
    };
    reset();
    await dismissSuggestion(SIDECAR, quizzes.id);
    expect(status()).toBe("pending");
    await dismissSuggestion(SIDECAR, midterm.id);
    expect(status()).toBe("dismissed");

    reset();
    await acceptSuggestion("Observatory", "ECE105", SIDECAR, { ...midterm, log: LOG });
    expect(status()).toBe("applied");
    await dismissSuggestion(SIDECAR, quizzes.id);
    expect(status()).toBe("applied");
  });

  it("adds a new assessment when none matches", () => {
    const out = applySuggestion(files.get(COURSE)!.content, quizzes as CourseSuggestion);
    expect(yaml.load(out.split("---\n")[1]!, { schema: yaml.CORE_SCHEMA })).toMatchObject({ assessments: [{ name: "Quizzes", weight: 10 }] });
  });
});
