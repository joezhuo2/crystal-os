/** The Nebula's diff review: changed files from git, their diffs as lines, and a commit message for them. */

/** Mirrors `ChangedFile` in src-tauri/src/harness/git.rs. */
export interface ChangedFile {
  path: string;
  /** The two porcelain status letters, e.g. " M", "A ", "??", "R ". */
  status: string;
  origPath: string | null;
}

export type ChangeKind = "added" | "deleted" | "renamed" | "modified";

export const isUntracked = (f: Pick<ChangedFile, "status">) => f.status === "??";

export function changeKind(f: Pick<ChangedFile, "status">): ChangeKind {
  if (isUntracked(f) || f.status.includes("A")) return "added";
  if (f.status.includes("D")) return "deleted";
  if (f.status.includes("R")) return "renamed";
  return "modified";
}

/** Every path a commit of `f` has to name: a rename's old path too, so its removal is committed. */
export const commitPaths = (f: ChangedFile) => (f.origPath ? [f.path, f.origPath] : [f.path]);

export type DiffLine = { kind: "add" | "del" | "hunk" | "ctx" | "note"; text: string };

const HEADER = /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) |old mode|new mode)/;

/** A unified diff as display lines, without the file headers. */
export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const text of diff.replace(/\n$/, "").split("\n")) {
    if (!text || HEADER.test(text)) continue;
    if (text.startsWith("@@")) lines.push({ kind: "hunk", text });
    else if (text.startsWith("+")) lines.push({ kind: "add", text: text.slice(1) });
    else if (text.startsWith("-")) lines.push({ kind: "del", text: text.slice(1) });
    else if (text.startsWith(" ")) lines.push({ kind: "ctx", text: text.slice(1) });
    else lines.push({ kind: "note", text });
  }
  return lines;
}

/** Added and removed line counts, for the file list. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}

const VERB: Record<ChangeKind, string> = { added: "Add", deleted: "Delete", renamed: "Rename", modified: "Update" };

/**
 * A commit message for `files`: the chat's title as the subject (or a count
 * when the chat has none), then a line per file.
 */
export function commitMessage(files: ChangedFile[], chatTitle: string): string {
  const title = chatTitle.trim().replace(/\s+/g, " ");
  const subject = title && title !== "New chat" ? title : `Update ${files.length} file${files.length === 1 ? "" : "s"}`;
  const clipped = subject.length > 72 ? `${subject.slice(0, 71)}…` : subject;
  const body = files.map((f) => {
    const kind = changeKind(f);
    return `- ${VERB[kind]} ${kind === "renamed" && f.origPath ? `${f.origPath} → ${f.path}` : f.path}`;
  });
  return [clipped, "", ...body].join("\n");
}
