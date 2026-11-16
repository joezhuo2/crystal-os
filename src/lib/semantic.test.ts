import { describe, expect, it } from "vitest";
import { noteText, rankNotes, staleNotes } from "./semantic";

const note = (path: string, mtime: number, over = {}) => ({ path, title: path, tags: ["school"], mtime, excerpt: "short", ...over });

describe("semantic search", () => {
  it("embeds the title, tags and the start of the body without markdown", () => {
    expect(noteText(note("a.md", 1, { title: "Limits", content: `# Limits\n${"x".repeat(3000)}` }))).toBe(`Limits\nschool\nLimits ${"x".repeat(1493)}`);
    expect(noteText(note("a.md", 1))).toBe("a.md\nschool\nshort");
  });

  it("re-embeds only new and edited notes", () => {
    const index = { "a.md": { mtime: 1, vector: [1, 0] }, "b.md": { mtime: 1, vector: [0, 1] } };
    expect(staleNotes([note("a.md", 1), note("b.md", 2), note("c.md", 1)], index).map((n) => n.path)).toEqual(["b.md", "c.md"]);
  });

  it("ranks by cosine similarity and drops weak matches", () => {
    const index = { "near.md": { mtime: 1, vector: [1, 0] }, "mid.md": { mtime: 1, vector: [0.6, 0.8] }, "far.md": { mtime: 1, vector: [0, 1] } };
    expect(rankNotes([1, 0], index).map((h) => h.path)).toEqual(["near.md", "mid.md"]);
  });
});
