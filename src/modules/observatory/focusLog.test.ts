import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, parseProgress, serializeProgress } from "./model";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;
let beforeSave: (() => void) | null = null;

class Conflict extends Error {
  code = "conflict";
}

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
  createVaultNote: vi.fn(async ({ path, content }: { path: string; content: string }) => ({ ...put(path, content), created: true })),
  saveVaultNote: vi.fn(async ({ path, content, expectedMtime }: { path: string; content: string; expectedMtime: number }) => {
    beforeSave?.();
    beforeSave = null;
    if (files.get(path)?.mtime !== expectedMtime) throw new Conflict("changed");
    return put(path, content);
  }),
}));

const { appendFocus, focusMinutes, focusMinutesByTopic } = await import("./focusLog");

const path = "Observatory/MATH117/progress.md";

beforeEach(() => {
  files.clear();
  beforeSave = null;
});

describe("focus log", () => {
  it("creates progress.md and round-trips focus entries next to reviews", async () => {
    await appendFocus("Observatory", "MATH117", { topic: "limits", seconds: 1500, at: "2026-11-15T10:00:00.000Z" });
    await appendFocus("Observatory", "MATH117", { topic: "limits", seconds: 600, at: "2026-11-15T11:00:00.000Z" });
    await appendFocus("Observatory", "MATH117", { topic: "chain-rule", seconds: 90, at: "2026-11-16T09:00:00.000Z" });
    const p = parseProgress(files.get(path)!.content);
    expect(focusMinutesByTopic(p)).toEqual({ limits: 35, "chain-rule": 2 });
    expect(focusMinutes(p, new Date("2026-11-16T00:00:00.000Z"))).toBe(2);
    expect(files.get(path)!.content).toContain("No reviews yet.");
  });

  it("keeps an Obsidian edit made while the write was in flight", async () => {
    const base = { ...emptyProgress(), mastery: { limits: 0.5 } };
    put(path, serializeProgress(base, "x"));
    beforeSave = () => put(path, serializeProgress({ ...base, mastery: { limits: 0.9 } }, "x"));
    await appendFocus("Observatory", "MATH117", { topic: "limits", seconds: 300, at: "2026-11-15T10:00:00.000Z" });
    const p = parseProgress(files.get(path)!.content);
    expect(p.mastery).toEqual({ limits: 0.9 });
    expect(focusMinutesByTopic(p)).toEqual({ limits: 5 });
  });

  it("ignores malformed and non-focus log entries", () => {
    const p = { ...emptyProgress(), log: [null, { kind: "review" }, { kind: "focus", topic: "a", seconds: "x", at: "t" }, { kind: "focus", topic: "a", seconds: 120, at: "2026-11-15T10:00:00.000Z" }] };
    expect(focusMinutesByTopic(p)).toEqual({ a: 2 });
  });
});
