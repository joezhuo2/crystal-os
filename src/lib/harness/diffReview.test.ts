import { describe, expect, it } from "vitest";
import { changeKind, commitMessage, commitPaths, diffStats, parseDiff, type ChangedFile } from "./diffReview";

const file = (status: string, path: string, origPath: string | null = null): ChangedFile => ({ status, path, origPath });

describe("changeKind", () => {
  it("reads git's porcelain letters", () => {
    expect(changeKind(file("??", "a"))).toBe("added");
    expect(changeKind(file("A ", "a"))).toBe("added");
    expect(changeKind(file(" D", "a"))).toBe("deleted");
    expect(changeKind(file("R ", "a", "b"))).toBe("renamed");
    expect(changeKind(file(" M", "a"))).toBe("modified");
    expect(commitPaths(file("R ", "a", "b"))).toEqual(["a", "b"]);
  });
});

describe("parseDiff", () => {
  it("drops the headers and labels each line", () => {
    const lines = parseDiff(
      "diff --git a/x.ts b/x.ts\nindex 1..2 100644\n--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\n\\ No newline at end of file\n",
    );
    expect(lines).toEqual([
      { kind: "hunk", text: "@@ -1,2 +1,2 @@" },
      { kind: "ctx", text: "keep" },
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
      { kind: "note", text: "\\ No newline at end of file" },
    ]);
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 });
  });
});

describe("commitMessage", () => {
  it("uses the chat title and lists each file", () => {
    expect(commitMessage([file(" M", "src/a.ts"), file("??", "b.md"), file("R ", "c.ts", "old/c.ts")], "Fix the build")).toBe(
      "Fix the build\n\n- Update src/a.ts\n- Add b.md\n- Rename old/c.ts → c.ts",
    );
  });

  it("falls back to a count and keeps the subject short", () => {
    expect(commitMessage([file(" D", "a")], "New chat").split("\n")[0]).toBe("Update 1 file");
    expect(commitMessage([file(" M", "a")], "x".repeat(100)).split("\n")[0]).toHaveLength(72);
  });
});
