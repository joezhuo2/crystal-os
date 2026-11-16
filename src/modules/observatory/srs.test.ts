import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, parseProgress, serializeProgress } from "./model";
import { parseQuestions } from "./questions";
import {
  cardKey,
  fromStored,
  getScheduler,
  gradeBug,
  gradeMc,
  gradeOutput,
  logEntries,
  newCard,
  NEW_STATE,
  readCard,
  recordObservation,
  recordReview,
  schedule,
} from "./srs";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;

vi.mock("@/hooks/useVault", () => ({
  vaultErrorCode: (e: { code?: string }) => e.code ?? null,
  fetchRawNote: vi.fn(async (path: string) => {
    const f = files.get(path);
    if (!f) throw Object.assign(new Error("missing"), { code: "not_found" });
    return { path, ...f };
  }),
  createVaultNote: vi.fn(async ({ path, content }: { path: string; content: string }) => {
    files.set(path, { content, mtime: ++clock });
    return { path, mtime: clock, created: true };
  }),
  saveVaultNote: vi.fn(async ({ path, content }: { path: string; content: string }) => {
    files.set(path, { content, mtime: ++clock });
    return { path, mtime: clock };
  }),
}));

beforeEach(() => files.clear());

const now = new Date("2026-11-15T10:00:00Z");
const day = 86_400_000;

describe("schedule", () => {
  it("creates a new card due now", async () => {
    const card = newCard(await getScheduler(), now);
    expect(card).toMatchObject({ dueAt: now.toISOString(), lastReviewAt: null, reps: 0, state: NEW_STATE });
  });

  it("schedules a new card and logs the review", async () => {
    const s = await getScheduler();
    const { card, entry } = schedule(s, null, 3, now, "limits/q-1");
    expect(entry).toEqual({ kind: "review", card: "limits/q-1", grade: 3, at: now.toISOString(), state: NEW_STATE });
    expect(card.reps).toBe(1);
    expect(card.lastReviewAt).toBe(now.toISOString());
    expect(Date.parse(card.dueAt)).toBeGreaterThan(now.getTime());
  });

  it("round-trips a stored card through JSON", async () => {
    const s = await getScheduler();
    const first = schedule(s, null, 3, now, "k").card;
    const stored = JSON.parse(JSON.stringify(first));
    expect(fromStored(stored).dueAt).toBeInstanceOf(Date);
    const later = new Date(Date.parse(first.dueAt) + day);
    const second = schedule(s, stored, 3, later, "k");
    expect(second.card.reps).toBe(2);
    expect(second.card.stability).toBeGreaterThan(first.stability);
    expect(second.entry.state).not.toBe(NEW_STATE);
  });

  it("gives Again a shorter interval than Easy", async () => {
    const s = await getScheduler();
    const again = schedule(s, null, 1, now, "k").card;
    const easy = schedule(s, null, 4, now, "k").card;
    expect(Date.parse(again.dueAt)).toBeLessThan(Date.parse(easy.dueAt));
  });

  it("schedules a lower retention further out", async () => {
    const good = (r: number) => getScheduler(r).then((s) => Date.parse(schedule(s, schedule(s, null, 3, now, "k").card, 3, new Date(now.getTime() + 10 * day), "k").card.dueAt));
    expect(await good(0.8)).toBeGreaterThan(await good(0.95));
  });
});

describe("readCard and logEntries", () => {
  it("treats malformed cards as missing", () => {
    const p = { ...emptyProgress(), cards: { a: { dueAt: "nope", stability: 1 }, b: null, c: { dueAt: now.toISOString() } } };
    expect(readCard(p, "a")).toBeNull();
    expect(readCard(p, "b")).toBeNull();
    expect(readCard(p, "c")).toBeNull();
    expect(readCard(p, "missing")).toBeNull();
  });

  it("drops unknown log entries", () => {
    const p = { ...emptyProgress(), log: [{ kind: "review", at: "x" }, { kind: "other", at: "x" }, null, 5] };
    expect(logEntries(p)).toHaveLength(1);
  });
});

describe("auto grading", () => {
  const [mc, out, bug] = parseQuestions(
    [
      "> [!question] q-1 type=mc",
      "> - [ ] a",
      "> - [x] b",
      "",
      "> [!question] q-2 type=output",
      "> ```",
      "> x",
      "> ```",
      ">> [!answer]",
      ">> 1\\n2",
      "",
      "> [!question] q-3 type=bug",
      "> ```",
      "> x",
      "> ```",
      ">> [!answer]",
      ">> line: 3",
    ].join("\n"),
  );

  it("grades multiple choice", () => {
    if (mc?.type !== "mc") throw new Error("not mc");
    expect(gradeMc(mc, [1])).toBe(3);
    expect(gradeMc(mc, [0])).toBe(1);
    expect(gradeMc(mc, [0, 1])).toBe(1);
  });

  it("grades predict the output by trimmed exact match", () => {
    if (out?.type !== "output") throw new Error("not output");
    expect(gradeOutput(out, "  1\\n2 \n")).toBe(3);
    expect(gradeOutput(out, "1\\n 2")).toBe(1);
  });

  it("grades spot the bug by line", () => {
    if (bug?.type !== "bug") throw new Error("not bug");
    expect(gradeBug(bug, 3)).toBe(3);
    expect(gradeBug(bug, 2)).toBe(1);
  });
});

describe("recording", () => {
  const path = "Observatory/MATH117/progress.md";

  it("records a review in the course progress", async () => {
    files.set(path, { content: serializeProgress(emptyProgress(), "No reviews yet."), mtime: 1 });
    const result = await recordReview("Observatory", "MATH117", "limits", "q-1", 3, { now });
    const saved = parseProgress(files.get(path)!.content);
    expect(saved).toEqual(result);
    expect(readCard(saved, cardKey("limits", "q-1"))?.reps).toBe(1);
    expect(saved.log).toEqual([{ kind: "review", card: "limits/q-1", grade: 3, at: now.toISOString(), state: NEW_STATE }]);
    expect(files.get(path)!.content).toContain("1 review logged.");

    const again = await recordReview("Observatory", "MATH117", "limits", "q-1", 1, { now: new Date(now.getTime() + 5 * day) });
    expect(readCard(again, "limits/q-1")?.reps).toBe(2);
    expect(again.log).toHaveLength(2);
  });

  it("records a finished observation", async () => {
    await recordObservation("Observatory", "MATH117", "limits", now);
    const saved = parseProgress(files.get(path)!.content);
    expect(saved.log).toEqual([{ kind: "observation", topic: "limits", at: now.toISOString() }]);
    expect(files.get(path)!.content).toContain("No reviews yet.");
  });
});
