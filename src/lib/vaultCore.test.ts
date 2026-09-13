import { describe, expect, it } from "vitest";
import {
  VaultError,
  buildNote,
  byteLength,
  normalizeNotePath,
  planQuickAdd,
  queryNotes,
  sortNotesByDate,
} from "./vaultCore";

const NOW = new Date(2026, 8, 13, 9, 5);

function note(path: string, data: Record<string, unknown>, content: string, mtime = 1) {
  return buildNote(path, data, content, mtime, content.length);
}

describe("normalizeNotePath", () => {
  it("normalises separators, leading ./ and the extension", () => {
    expect(normalizeNotePath("./Projects\\Plan")).toBe("Projects/Plan.md");
    expect(normalizeNotePath("Inbox.MD")).toBe("Inbox.MD");
  });

  it("refuses empty and absolute paths", () => {
    for (const bad of ["", "  ", "/etc/x.md", "C:\\x.md", 42]) {
      expect(() => normalizeNotePath(bad)).toThrow(VaultError);
    }
  });
});

describe("buildNote", () => {
  it("falls back to the file name for the title without Node's path module", () => {
    expect(note("Projects/Some.Plan.md", {}, "no heading").title).toBe("Some.Plan");
  });
});

describe("queryNotes", () => {
  const notes = sortNotesByDate([
    note("a.md", { tags: ["work"], date: "2026-01-01" }, "# Alpha\nbudget review"),
    note("b.md", { tags: ["home", "Work"], date: "2026-03-01" }, "# Beta\nshopping"),
    note("c.md", { tags: ["home"], date: "2026-02-01" }, "# Gamma\nbudget"),
  ]);

  it("lists newest first with every tag counted", () => {
    const res = queryNotes(notes);
    expect(res.notes.map((n) => n.path)).toEqual(["b.md", "c.md", "a.md"]);
    // Most frequent first, then locale order; tags differing only in case stay distinct.
    expect(res.allTags).toEqual(["home", "work", "Work"]);
    expect(res.total).toBe(3);
  });

  it("searches, filters by tag case-insensitively, and limits", () => {
    const res = queryNotes(notes, { q: "budget", tag: "HOME" });
    expect(res.notes.map((n) => n.path)).toEqual(["c.md"]);
    expect(res.notes[0].matchContext).toContain("budget");

    expect(queryNotes(notes, { limit: 1 }).notes).toHaveLength(1);
    expect(queryNotes(notes, { limit: 1 }).total).toBe(3);
  });
});

describe("planQuickAdd", () => {
  it("creates a note with inbox tag, title and today's heading", () => {
    const plan = planQuickAdd(null, "Ideas/Later.md", " buy milk ", undefined, NOW);
    expect(plan.created).toBe(true);
    expect(plan.tags).toEqual(["inbox"]);
    expect(plan.content).toBe(
      "---\ntags: [inbox]\ncreated: 2026-09-13\n---\n\n# Later\n\n## 2026-09-13\n\n- **09:05** buy milk\n",
    );
  });

  it("appends under an existing heading for today and merges tags", () => {
    const existing = "---\ntags: [work]\n---\n# Log\n\n## 2026-09-13\n\n- **08:00** first\n";
    const plan = planQuickAdd(existing, "Log.md", "second\nline", ["idea", "WORK"], NOW);
    expect(plan.created).toBe(false);
    expect(plan.tags).toEqual(["work", "idea"]);
    expect(plan.tagsAdded).toEqual(["idea"]);
    expect(plan.chunk).toBe("\n- **09:05** second\n  line\n");
    expect(plan.content.startsWith("---\ntags: [work, idea]\n---\n")).toBe(true);
    expect(plan.content.endsWith("- **08:00** first\n\n- **09:05** second\n  line\n")).toBe(true);
  });

  it("validates before producing anything", () => {
    expect(() => planQuickAdd("", "a.md", "   ", [], NOW)).toThrow("text must not be empty");
    expect(() => planQuickAdd("", "a.md", "x", ["bad tag!"], NOW)).toThrow("Invalid tag");
  });
});

describe("byteLength", () => {
  it("counts UTF-8 bytes", () => {
    expect(byteLength("a")).toBe(1);
    expect(byteLength("é")).toBe(2);
    expect(byteLength("🙂")).toBe(4);
  });
});
