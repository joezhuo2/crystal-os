import { beforeEach, describe, expect, it } from "vitest";
import {
  createOfflineQueue,
  enqueue,
  flushWrites,
  isRetryable,
  overlayRows,
  pendingInserts,
  type QueuedWrite,
  type WriteResult,
} from "./offlineQueue";

const at = "2026-10-04T12:00:00.000Z";
const insert = (id: string, row: Record<string, unknown> = {}, table: QueuedWrite["table"] = "tasks"): QueuedWrite =>
  ({ op: "insert", table, id, row, queuedAt: at });
const update = (id: string, row: Record<string, unknown>, table: QueuedWrite["table"] = "tasks"): QueuedWrite =>
  ({ op: "update", table, id, row, queuedAt: at });
const remove = (id: string, table: QueuedWrite["table"] = "tasks"): QueuedWrite =>
  ({ op: "delete", table, id, queuedAt: at });

const ok: WriteResult = { error: null, status: 201 };
const unreachable: WriteResult = { error: { message: "TypeError: Failed to fetch" }, status: 0 };

describe("isRetryable", () => {
  it("keeps writes that never got an answer or hit a passing outage", () => {
    for (const status of [0, 401, 408, 429, 502, 503, 504]) expect(isRetryable(status)).toBe(true);
  });

  it("reports real rejections", () => {
    for (const status of [400, 403, 404, 409, 500]) expect(isRetryable(status)).toBe(false);
  });
});

describe("enqueue", () => {
  it("folds an update into a queued insert of the same row", () => {
    const q = enqueue([insert("a", { name: "x", completed: false })], update("a", { completed: true }));
    expect(q).toEqual([insert("a", { name: "x", completed: true })]);
  });

  it("merges updates to the same row", () => {
    const q = enqueue([update("a", { name: "x" })], update("a", { priority: "high" }));
    expect(q).toEqual([update("a", { name: "x", priority: "high" })]);
  });

  it("drops a queued insert and its edits when the row is deleted", () => {
    const q = enqueue([insert("a"), insert("b")], remove("a"));
    expect(q).toEqual([insert("b")]);
  });

  it("replaces queued updates with the delete", () => {
    const q = enqueue([update("a", { name: "x" })], remove("a"));
    expect(q).toEqual([remove("a")]);
  });

  it("keeps rows in different tables apart", () => {
    const q = enqueue([insert("a", {}, "transactions")], update("a", { name: "x" }));
    expect(q).toHaveLength(2);
  });

  it("leaves entries before `from` alone", () => {
    const q = enqueue([insert("a", { name: "x" })], update("a", { name: "y" }), 1);
    expect(q).toEqual([insert("a", { name: "x" }), update("a", { name: "y" })]);
  });
});

describe("overlayRows and pendingInserts", () => {
  it("applies queued updates and deletes to loaded rows", () => {
    const rows = [{ id: "a", name: "old" }, { id: "b", name: "gone" }, { id: "c", name: "same" }];
    const queue = [update("a", { name: "new" }), remove("b")];
    expect(overlayRows(rows, queue, "tasks")).toEqual([{ id: "a", name: "new" }, { id: "c", name: "same" }]);
    expect(overlayRows(rows, queue, "transactions")).toBe(rows);
  });

  it("lists queued inserts for one table", () => {
    const queue = [insert("a", { name: "x" }), insert("b", { name: "y" }, "transactions")];
    expect(pendingInserts(queue, "tasks")).toEqual([{ id: "a", name: "x", created_at: at }]);
  });
});

describe("flushWrites", () => {
  it("sends every write in order", async () => {
    const seen: string[] = [];
    const result = await flushWrites([insert("a"), update("a", {}), remove("b")], async (w) => {
      seen.push(`${w.op}:${w.id}`);
      return ok;
    });
    expect(seen).toEqual(["insert:a", "update:a", "delete:b"]);
    expect(result.sent).toHaveLength(3);
    expect(result.remaining).toEqual([]);
  });

  it("stops at the first write that cannot get through", async () => {
    const queue = [insert("a"), insert("b"), insert("c")];
    const result = await flushWrites(queue, async (w) => (w.id === "b" ? unreachable : ok));
    expect(result.sent).toEqual([queue[0]]);
    expect(result.remaining).toEqual([queue[1], queue[2]]);
  });

  it("treats a thrown request as unreachable", async () => {
    const result = await flushWrites([insert("a")], async () => {
      throw new Error("offline");
    });
    expect(result.remaining).toHaveLength(1);
  });

  it("counts an insert that already landed as sent", async () => {
    const result = await flushWrites([insert("a")], async () => ({
      error: { message: "duplicate key", code: "23505" },
      status: 409,
    }));
    expect(result.sent).toHaveLength(1);
    expect(result.failed).toEqual([]);
  });

  it("drops a rejected write and carries on", async () => {
    const queue = [insert("a"), insert("b")];
    const result = await flushWrites(queue, async (w) =>
      w.id === "a" ? { error: { message: "violates check" }, status: 400 } : ok,
    );
    expect(result.failed).toEqual([{ write: queue[0], message: "violates check" }]);
    expect(result.sent).toEqual([queue[1]]);
    expect(result.remaining).toEqual([]);
  });
});

describe("createOfflineQueue", () => {
  beforeEach(() => localStorage.clear());

  it("keeps each user's queue in localStorage", () => {
    const q = createOfflineQueue();
    q.use("u1");
    q.push(insert("a"));
    q.use("u2");
    expect(q.size()).toBe(0);
    const again = createOfflineQueue();
    again.use("u1");
    expect(again.get()).toEqual([insert("a")]);
  });

  it("clears storage once everything is sent", async () => {
    const q = createOfflineQueue();
    q.use("u1");
    q.push(insert("a"));
    await q.flush(async () => ok);
    expect(q.size()).toBe(0);
    expect(localStorage.getItem("crystal-os-offline-queue:u1")).toBeNull();
  });

  it("puts writes queued during a flush after the ones still waiting", async () => {
    const q = createOfflineQueue();
    q.use("u1");
    q.push(insert("a", { name: "x" }));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = q.flush(async () => {
      await gate;
      return unreachable;
    });
    // Must not fold into the insert being sent.
    q.push(update("a", { name: "y" }));
    release();
    await run;
    expect(q.get()).toEqual([insert("a", { name: "x" }), update("a", { name: "y" })]);
  });

  it("shares one run between concurrent flushes and notifies listeners", async () => {
    const q = createOfflineQueue();
    q.use("u1");
    let calls = 0;
    q.subscribe(() => calls++);
    q.push(insert("a"));
    let sends = 0;
    const send = async () => {
      sends++;
      return ok;
    };
    await Promise.all([q.flush(send), q.flush(send)]);
    expect(sends).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(await q.flush(send)).toBeNull();
  });

  it("removes matching writes", () => {
    const q = createOfflineQueue();
    q.use("u1");
    q.push(insert("c1", { task_id: "a" }, "task_completions"));
    q.push(insert("t1"));
    q.remove((w) => w.table === "task_completions");
    expect(q.get()).toEqual([insert("t1")]);
  });
});
