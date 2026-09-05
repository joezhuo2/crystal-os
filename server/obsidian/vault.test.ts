import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  VaultError,
  appendToNote,
  assertQuickAddTags,
  deriveTitle,
  hasTrailingDayHeading,
  listNotes,
  mergeTags,
  normalizeTags,
  readNote,
  resolveVaultPath,
  searchNotes,
  upsertFrontmatterTags,
} from "./vault";

let vault: string;

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), "crystal-vault-"));
});

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true });
});

async function write(rel: string, content: string) {
  const abs = path.join(vault, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, { encoding: "utf-8" });
}

describe("resolveVaultPath", () => {
  it("accepts nested relative paths and adds the .md extension", () => {
    expect(resolveVaultPath(vault, "Projects/Anamnesis")).toBe(
      path.join(vault, "Projects", "Anamnesis.md"),
    );
  });

  it("rejects posix traversal", () => {
    expect(() => resolveVaultPath(vault, "../escaped.md")).toThrow(VaultError);
    expect(() => resolveVaultPath(vault, "a/../../escaped.md")).toThrow(VaultError);
  });

  it("rejects windows traversal", () => {
    expect(() => resolveVaultPath(vault, "..\\..\\escaped.md")).toThrow(VaultError);
  });

  it("rejects absolute paths", () => {
    expect(() => resolveVaultPath(vault, "/etc/passwd")).toThrow(VaultError);
    expect(() => resolveVaultPath(vault, "C:/Windows/Temp/x.md")).toThrow(VaultError);
  });

  it("rejects empty input", () => {
    expect(() => resolveVaultPath(vault, "   ")).toThrow(VaultError);
  });
});

describe("normalizeTags", () => {
  it("handles a list", () => {
    expect(normalizeTags(["project", "planned"])).toEqual(["project", "planned"]);
  });

  it("handles a bare string and strips the hash", () => {
    expect(normalizeTags("#inbox")).toEqual(["inbox"]);
    expect(normalizeTags("a, b")).toEqual(["a", "b"]);
  });

  it("handles missing tags", () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it("deduplicates", () => {
    expect(normalizeTags(["a", "a", "b"])).toEqual(["a", "b"]);
  });
});

describe("deriveTitle", () => {
  it("prefers frontmatter", () => {
    expect(deriveTitle({ title: "From Matter" }, "# Heading", "file.md")).toBe(
      "From Matter",
    );
  });

  it("falls back to the first h1", () => {
    expect(deriveTitle({}, "\n# Heading\n", "file.md")).toBe("Heading");
  });

  it("falls back to the basename", () => {
    expect(deriveTitle({}, "no headings", "Notes/About Me.md")).toBe("About Me");
  });
});

describe("listNotes", () => {
  it("reads frontmatter and skips vault internals", async () => {
    await write("CrystalOS.md", "---\ntags: [project, planned]\ngithub: https://x\n---\n\n# CrystalOS\n\nA dashboard.\n");
    await write(".obsidian/workspace.md", "should be ignored");
    await write("nested/Deep.md", "# Deep\n");

    const notes = await listNotes(vault);
    const paths = notes.map((n) => n.path).sort();

    expect(paths).toEqual(["CrystalOS.md", "nested/Deep.md"]);

    const crystal = notes.find((n) => n.path === "CrystalOS.md")!;
    expect(crystal.title).toBe("CrystalOS");
    expect(crystal.tags).toEqual(["project", "planned"]);
    expect(crystal.frontmatter).toEqual({ github: "https://x" });
    expect(crystal.excerpt).toContain("A dashboard.");
    expect(crystal.date).not.toBeNull();
  });

  it("uses forward slashes for nested paths", async () => {
    await write("a/b/c.md", "# C\n");
    const notes = await listNotes(vault);
    expect(notes[0].path).toBe("a/b/c.md");
  });
});

describe("searchNotes", () => {
  it("ranks a title match above a body match and returns context", async () => {
    await write("Anamnesis.md", "# Anamnesis\n\nA wave-based action roguelite in Unity.\n");
    await write("Other.md", "# Other\n\nMentions Anamnesis in passing.\n");

    const notes = await listNotes(vault);

    const byTitle = searchNotes(notes, "anamnesis");
    expect(byTitle[0].path).toBe("Anamnesis.md");

    const byBody = searchNotes(notes, "roguelite");
    expect(byBody).toHaveLength(1);
    expect(byBody[0].path).toBe("Anamnesis.md");
    expect(byBody[0].matchContext).toContain("roguelite");
  });

  it("returns nothing for an empty query", async () => {
    await write("A.md", "# A\n");
    expect(searchNotes(await listNotes(vault), "  ")).toEqual([]);
  });
});

describe("hasTrailingDayHeading", () => {
  it("matches only the last heading", () => {
    const content = "## 2026-09-04\n\n- old\n\n## 2026-09-05\n\n- new\n";
    expect(hasTrailingDayHeading(content, "2026-09-05")).toBe(true);
    expect(hasTrailingDayHeading(content, "2026-09-04")).toBe(false);
    expect(hasTrailingDayHeading("no headings", "2026-09-05")).toBe(false);
  });
});

describe("assertQuickAddTags", () => {
  it("accepts a list, a string, and hashes", () => {
    expect(assertQuickAddTags(["idea", "#work"])).toEqual(["idea", "work"]);
    expect(assertQuickAddTags("idea, work")).toEqual(["idea", "work"]);
    expect(assertQuickAddTags(undefined)).toEqual([]);
  });

  it("folds case-insensitive duplicates", () => {
    expect(assertQuickAddTags(["Idea", "idea"])).toEqual(["Idea"]);
  });

  it("hyphenates inner whitespace instead of rejecting", () => {
    expect(assertQuickAddTags(["quick note"])).toEqual(["quick-note"]);
  });

  it("keeps nested and unicode tags", () => {
    expect(assertQuickAddTags(["work/deep", "读书"])).toEqual(["work/deep", "读书"]);
  });

  it("rejects bad shapes, bad characters, and overlong lists", () => {
    expect(() => assertQuickAddTags(42)).toThrow(VaultError);
    expect(() => assertQuickAddTags(["a!b"])).toThrow(VaultError);
    expect(() => assertQuickAddTags(["x".repeat(61)])).toThrow(VaultError);
    expect(() => assertQuickAddTags(Array.from({ length: 13 }, (_, i) => `t${i}`))).toThrow(
      VaultError,
    );
  });
});

describe("mergeTags", () => {
  it("keeps the casing already on the note", () => {
    expect(mergeTags(["Work"], ["work", "idea"])).toEqual(["Work", "idea"]);
  });
});

describe("upsertFrontmatterTags", () => {
  it("adds a frontmatter block when the note has none", () => {
    const out = upsertFrontmatterTags(`# Notes\n\nbody\n`, ["idea"]);

    expect(out.content).toBe(`---\ntags: [idea]\n---\n\n# Notes\n\nbody\n`);
    expect(out.added).toEqual(["idea"]);
  });

  it("merges into an inline list and leaves other keys alone", () => {
    const raw = `---\ntitle: Inbox\ntags: [inbox, work]\ncreated: 2026-09-05\n---\n\nbody\n`;
    const out = upsertFrontmatterTags(raw, ["idea", "INBOX"]);

    expect(out.tags).toEqual(["inbox", "work", "idea"]);
    expect(out.added).toEqual(["idea"]);
    expect(out.content).toBe(
      `---\ntitle: Inbox\ntags: [inbox, work, idea]\ncreated: 2026-09-05\n---\n\nbody\n`,
    );
  });

  it("preserves the block list style", () => {
    const raw = `---\ntags:\n  - inbox\nstatus: open\n---\n\nbody\n`;
    const out = upsertFrontmatterTags(raw, ["idea"]);

    expect(out.content).toContain(`tags:\n  - inbox\n  - idea\nstatus: open`);
    expect(out.tags).toEqual(["inbox", "idea"]);
  });

  it("appends a tags key when the frontmatter has none", () => {
    const out = upsertFrontmatterTags(`---\ntitle: Inbox\n---\n\nbody\n`, ["idea"]);

    expect(out.content).toContain(`title: Inbox\ntags: [idea]\n---`);
  });

  it("is a no-op when every tag is already present", () => {
    const raw = `---\ntags: [inbox]\n---\n\nbody\n`;
    const out = upsertFrontmatterTags(raw, ["Inbox"]);

    expect(out.content).toBe(raw);
    expect(out.added).toEqual([]);
    expect(out.tags).toEqual(["inbox"]);
  });

  it("reports existing tags when nothing is being added", () => {
    const out = upsertFrontmatterTags(`---\ntags: [inbox, work]\n---\n\nbody\n`, []);

    expect(out.tags).toEqual(["inbox", "work"]);
    expect(out.added).toEqual([]);
  });

  it("handles CRLF frontmatter", () => {
    const out = upsertFrontmatterTags(`---\r\ntags: [inbox]\r\n---\r\n\r\nbody\r\n`, ["idea"]);

    expect(out.content).toContain(`tags: [inbox, idea]`);
    expect(out.content).toContain(`body`);
  });
});

describe("appendToNote", () => {
  it("creates a missing file with seed frontmatter", async () => {
    const result = await appendToNote(vault, "Inbox.md", "first capture");

    expect(result.created).toBe(true);
    expect(result.path).toBe("Inbox.md");

    const raw = await fs.readFile(path.join(vault, "Inbox.md"), { encoding: "utf-8" });
    expect(raw).toContain("tags: [inbox]");
    expect(raw).toContain("# Inbox");
    expect(raw).toContain("first capture");
  });

  it("reuses the existing day heading on a second append", async () => {
    const now = new Date("2026-09-05T10:00:00");
    await appendToNote(vault, "Inbox.md", "one", { now });
    await appendToNote(vault, "Inbox.md", "two", { now: new Date("2026-09-05T14:30:00") });

    const raw = await fs.readFile(path.join(vault, "Inbox.md"), { encoding: "utf-8" });
    const headings = raw.match(/^## 2026-09-05$/gm) ?? [];

    expect(headings).toHaveLength(1);
    expect(raw).toContain("one");
    expect(raw).toContain("two");
  });

  it("starts a new heading on a later day", async () => {
    await appendToNote(vault, "Inbox.md", "one", { now: new Date("2026-09-05T10:00:00") });
    await appendToNote(vault, "Inbox.md", "two", { now: new Date("2026-09-06T10:00:00") });

    const raw = await fs.readFile(path.join(vault, "Inbox.md"), { encoding: "utf-8" });
    expect(raw).toContain("## 2026-09-05");
    expect(raw).toContain("## 2026-09-06");
  });

  it("creates parent directories", async () => {
    const result = await appendToNote(vault, "Inbox/scratch.md", "nested");
    expect(result.path).toBe("Inbox/scratch.md");
    expect(result.created).toBe(true);

    const note = await readNote(vault, "Inbox/scratch.md");
    expect(note.content).toContain("nested");
  });

  it("round-trips non-ascii text", async () => {
    await appendToNote(vault, "Inbox.md", "cafe latte 커피 🚀 — em dash");

    const raw = await fs.readFile(path.join(vault, "Inbox.md"), { encoding: "utf-8" });
    expect(raw).toContain("커피 🚀 — em dash");
  });

  it("rejects empty and oversized text", async () => {
    await expect(appendToNote(vault, "Inbox.md", "   ")).rejects.toThrow(VaultError);
    await expect(
      appendToNote(vault, "Inbox.md", "x".repeat(10_001)),
    ).rejects.toThrow(VaultError);
  });

  it("refuses to write outside the vault", async () => {
    await expect(
      appendToNote(vault, "../escaped.md", "nope"),
    ).rejects.toThrow(VaultError);

    await expect(fs.access(path.join(vault, "..", "escaped.md"))).rejects.toThrow();
  });

  it("seeds a new note with the supplied tags", async () => {
    const result = await appendToNote(vault, "Ideas.md", "spark", {
      tags: ["idea", "#work"],
    });

    expect(result.tags).toEqual(["idea", "work"]);
    expect(result.tagsAdded).toEqual(["idea", "work"]);

    const raw = await fs.readFile(path.join(vault, "Ideas.md"), { encoding: "utf-8" });
    expect(raw).toContain("tags: [idea, work]");
    expect(raw).not.toContain("[inbox]");
  });

  it("merges tags into an existing note and reports only the new ones", async () => {
    await appendToNote(vault, "Inbox.md", "one", { tags: ["idea"] });
    const result = await appendToNote(vault, "Inbox.md", "two", {
      tags: ["Idea", "work"],
    });

    expect(result.created).toBe(false);
    expect(result.tags).toEqual(["idea", "work"]);
    expect(result.tagsAdded).toEqual(["work"]);

    const note = await readNote(vault, "Inbox.md");
    expect(note.tags).toEqual(["idea", "work"]);
    expect(note.content).toContain("one");
    expect(note.content).toContain("two");
  });

  it("reports the note tags when the capture adds none", async () => {
    await appendToNote(vault, "Inbox.md", "one", { tags: ["idea"] });
    const result = await appendToNote(vault, "Inbox.md", "two");

    expect(result.tags).toEqual(["idea"]);
    expect(result.tagsAdded).toEqual([]);
  });

  it("tags a note that had no frontmatter", async () => {
    await write("Plain.md", `# Plain\n\nexisting body\n`);
    const result = await appendToNote(vault, "Plain.md", "capture", { tags: ["idea"] });

    expect(result.tags).toEqual(["idea"]);

    const note = await readNote(vault, "Plain.md");
    expect(note.tags).toEqual(["idea"]);
    expect(note.content).toContain("existing body");
    expect(note.content).toContain("capture");
  });

  it("rejects invalid tags without writing anything", async () => {
    await expect(
      appendToNote(vault, "Bad.md", "text", { tags: ["a!b"] }),
    ).rejects.toThrow(VaultError);

    await expect(fs.access(path.join(vault, "Bad.md"))).rejects.toThrow();
  });
});
