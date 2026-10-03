import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NativeVaultError,
  VAULT_CHANGED_EVENT,
  clearNativeVaultCache,
  listNotesNative,
  onVaultChanged,
  parseFrontmatter,
  quickAddNative,
  readNoteNative,
} from "./vaultNative";

const { invoke, listen, handlers, files, fakeBackend } = vi.hoisted(() => {
  /** In-memory stand-in for src-tauri/src/vault.rs. */
  const files = new Map<string, { content: string; mtime: number }>();
  const handlers = new Map<string, (e: { payload: unknown }) => void>();

  const fakeBackend = async (cmd: string, args: Record<string, unknown> = {}) => {
    const path = args.path as string;
    switch (cmd) {
      case "list_vault":
        return [...files.entries()].map(([p, f]) => ({
          path: p,
          mtime: f.mtime,
          size: f.content.length,
        }));
      case "read_vault_file": {
        const file = files.get(path);
        if (!file) throw { code: "not_found", message: `Note not found: ${path}` };
        return { path, ...file, size: file.content.length };
      }
      case "write_vault_file": {
        const current = files.get(path);
        const expected = args.expectedMtime as number | null;
        if (expected !== null && current?.mtime !== expected) {
          throw { code: "conflict", message: `${path} changed on disk. Try again.` };
        }
        const content = args.content as string;
        const mtime = (current?.mtime ?? 0) + 1;
        files.set(path, { content, mtime });
        return { path, mtime, size: content.length, created: !current };
      }
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  };

  return {
    files,
    handlers,
    fakeBackend,
    invoke: vi.fn(fakeBackend),
    listen: vi.fn((name: string, cb: (e: { payload: unknown }) => void) => {
      handlers.set(name, cb);
      return Promise.resolve(() => {
        handlers.delete(name);
      });
    }),
  };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

const NOW = new Date(2026, 8, 13, 9, 5);

const readCalls = () => invoke.mock.calls.filter(([cmd]) => cmd === "read_vault_file");

afterEach(() => {
  files.clear();
  handlers.clear();
  invoke.mockReset();
  invoke.mockImplementation(fakeBackend);
  clearNativeVaultCache();
});

describe("parseFrontmatter", () => {
  it("parses YAML, including dates, and strips a BOM", () => {
    const { data, content } = parseFrontmatter(
      "﻿---\ntags: [a, b]\ndate: 2026-09-13\n---\n# Body\n",
    );
    expect(data.tags).toEqual(["a", "b"]);
    expect(data.date).toBeInstanceOf(Date);
    expect(content).toBe("# Body\n");
  });

  it("handles no, empty, and invalid frontmatter without throwing", () => {
    expect(parseFrontmatter("# Just body")).toEqual({ data: {}, content: "# Just body" });
    expect(parseFrontmatter("---\n---\nbody")).toEqual({ data: {}, content: "body" });
    expect(parseFrontmatter("---\n: : [\n---\nbody")).toEqual({ data: {}, content: "body" });
  });
});

describe("listNotesNative", () => {
  it("parses notes newest first and only re-reads changed files", async () => {
    files.set("Old.md", { content: "---\ndate: 2026-01-01\n---\n# Old\n", mtime: 1 });
    files.set("New.md", { content: "---\ndate: 2026-09-01\n---\n# New\n", mtime: 1 });

    expect((await listNotesNative()).map((n) => n.title)).toEqual(["New", "Old"]);
    expect(readCalls()).toHaveLength(2);

    invoke.mockClear();
    files.set("Old.md", { content: "---\ndate: 2026-01-01\n---\n# Old, edited\n", mtime: 2 });
    expect((await listNotesNative()).map((n) => n.title)).toEqual(["New", "Old, edited"]);
    expect(readCalls()).toEqual([["read_vault_file", { path: "Old.md" }]]);
  });

  it("skips a note deleted between listing and reading", async () => {
    invoke.mockImplementationOnce(async () => [{ path: "Gone.md", mtime: 1, size: 6 }]);
    expect(await listNotesNative()).toEqual([]);
  });
});

describe("readNoteNative", () => {
  it("rejects with a typed not_found error once the note is deleted", async () => {
    const err = await readNoteNative("Missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NativeVaultError);
    expect((err as NativeVaultError).code).toBe("not_found");
    expect(invoke).toHaveBeenCalledWith("read_vault_file", { path: "Missing.md" });
  });
});

describe("quickAddNative", () => {
  it("creates Inbox.md by default", async () => {
    const result = await quickAddNative({ text: "hello" }, NOW);
    expect(result).toMatchObject({ ok: true, path: "Inbox.md", created: true, tags: ["inbox"] });
    expect(files.get("Inbox.md")?.content).toContain("- **09:05** hello\n");
  });

  it("redoes the append on top of an edit saved between read and write", async () => {
    files.set("Log.md", { content: "# Log\n", mtime: 5 });

    let raced = false;
    invoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "write_vault_file" && !raced) {
        raced = true;
        files.set("Log.md", { content: "# Log\nedited in Obsidian\n", mtime: 6 });
      }
      return fakeBackend(cmd, args);
    });

    const result = await quickAddNative({ text: "captured", notePath: "Log" }, NOW);
    expect(result.created).toBe(false);
    expect(files.get("Log.md")?.content).toBe(
      "# Log\nedited in Obsidian\n\n## 2026-09-13\n\n- **09:05** captured\n",
    );
  });

  it("surfaces permission errors without retrying", async () => {
    invoke.mockImplementation(async () => {
      throw { code: "permission_denied", message: "Permission denied: Inbox.md" };
    });
    await expect(quickAddNative({ text: "x" }, NOW)).rejects.toMatchObject({
      code: "permission_denied",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("onVaultChanged", () => {
  it("forwards change events until unsubscribed", async () => {
    const listener = vi.fn();
    const unsubscribe = onVaultChanged(listener);
    await vi.waitFor(() => expect(handlers.has(VAULT_CHANGED_EVENT)).toBe(true));

    handlers.get(VAULT_CHANGED_EVENT)!({ payload: { paths: ["a.md"], rootMissing: false } });
    expect(listener).toHaveBeenCalledWith({ paths: ["a.md"], rootMissing: false });

    unsubscribe();
    expect(handlers.has(VAULT_CHANGED_EVENT)).toBe(false);
  });
});
