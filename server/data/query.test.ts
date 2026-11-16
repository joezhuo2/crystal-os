import { describe, expect, it } from "vitest";
import { type Db, type Query, DuplicateError, parseQuery, runQuery, tablesFor } from "./query";

let seq = 0;
const ctx = { now: () => "2026-11-16T12:00:00.000Z", newId: () => `id-${++seq}` };
const run = (db: Db, q: Query) => runQuery(db, q, ctx);

describe("parseQuery", () => {
  it("accepts a well-formed query", () => {
    const q = { table: "tasks", op: "select", filters: [{ column: "id", op: "gt", value: "a" }], order: { column: "id", ascending: true }, limit: 5 };
    expect(parseQuery(q)).toBe(q);
  });

  it.each([
    [{ table: "../secrets", op: "select" }, /unknown table/],
    [{ table: "tasks", op: "drop" }, /unknown op/],
    [{ table: "tasks", op: "insert" }, /rows are required/],
    [{ table: "tasks", op: "delete" }, /need a filter/],
    [{ table: "tasks", op: "update", patch: {}, filters: [] }, /need a filter/],
    [{ table: "tasks", op: "select", filters: [{ column: "id; drop", op: "eq", value: 1 }] }, /filters/],
    [{ table: "tasks", op: "select", filters: [{ column: "id", op: "eq", value: {} }] }, /filters/],
    [{ table: "tasks", op: "select", limit: -1 }, /limit/],
  ])("rejects %j", (raw, message) => {
    expect(() => parseQuery(raw)).toThrow(message);
  });
});

describe("runQuery", () => {
  it("filters, orders, limits and picks columns, with nulls for missing ones", () => {
    const db: Db = {
      focus_sessions: [
        { id: "a", ended_at: "2026-11-03T00:00:00.000Z", seconds: 60 },
        { id: "b", ended_at: "2026-11-01T00:00:00.000Z", seconds: 30 },
        { id: "c", ended_at: "2026-11-02T00:00:00.000Z", seconds: 10, task_id: "t1" },
        { id: "d", ended_at: "2026-12-01T00:00:00.000Z", seconds: 99 },
      ],
    };
    const { data, changed } = run(db, {
      table: "focus_sessions",
      op: "select",
      filters: [
        { column: "ended_at", op: "gte", value: "2026-11-01T00:00:00.000Z" },
        { column: "ended_at", op: "lt", value: "2026-12-01T00:00:00.000Z" },
      ],
      order: { column: "ended_at", ascending: false },
      limit: 2,
      columns: ["seconds", "task_id"],
    });
    expect(data).toEqual([
      { seconds: 60, task_id: null },
      { seconds: 10, task_id: "t1" },
    ]);
    expect(changed).toEqual([]);
  });

  it("inserts with an id, a creation time and the table's defaults", () => {
    const db: Db = {};
    const { data, changed } = run(db, { table: "habits", op: "insert", rows: [{ name: "Read", color: "red" }], returning: true });
    expect(data).toEqual([{ id: expect.stringMatching(/^id-/), created_at: ctx.now(), position: 0, archived_at: null, name: "Read", color: "red" }]);
    expect(db.habits).toHaveLength(1);
    expect(changed).toEqual(["habits"]);
  });

  it("rejects a duplicate id or unique key with the Postgres duplicate code", () => {
    const db: Db = { tasks: [{ id: "t1" }], habit_checks: [{ id: "c1", habit_id: "h1", day: "2026-11-16" }] };
    expect(() => run(db, { table: "tasks", op: "insert", rows: [{ id: "t1", name: "again" }] })).toThrow(DuplicateError);
    expect(() => run(db, { table: "habit_checks", op: "insert", rows: [{ habit_id: "h1", day: "2026-11-16" }] })).toThrow(DuplicateError);
    expect(new DuplicateError()).toMatchObject({ status: 409, code: "23505" });
  });

  it("upserts on the conflict columns, skipping or merging duplicates", () => {
    const db: Db = { habit_checks: [{ id: "c1", habit_id: "h1", day: "2026-11-16", note: "old" }] };
    const upsert = (ignoreDuplicates: boolean, rows: Query["rows"]): Query => ({
      table: "habit_checks",
      op: "upsert",
      rows,
      onConflict: ["habit_id", "day"],
      ignoreDuplicates,
    });
    run(db, upsert(true, [{ habit_id: "h1", day: "2026-11-16", note: "new" }, { habit_id: "h1", day: "2026-11-17" }]));
    expect(db.habit_checks?.map((r) => [r.day, r.note])).toEqual([["2026-11-16", "old"], ["2026-11-17", undefined]]);
    run(db, upsert(false, [{ habit_id: "h1", day: "2026-11-16", note: "new" }]));
    expect(db.habit_checks?.[0]).toMatchObject({ id: "c1", note: "new" });
  });

  it("updates matching rows without letting the id change", () => {
    const db: Db = { tasks: [{ id: "t1", name: "a" }, { id: "t2", name: "b" }] };
    const { changed } = run(db, { table: "tasks", op: "update", patch: { id: "x", name: "z" }, filters: [{ column: "id", op: "eq", value: "t2" }] });
    expect(db.tasks).toEqual([{ id: "t1", name: "a" }, { id: "t2", name: "z" }]);
    expect(changed).toEqual(["tasks"]);
    expect(run(db, { table: "tasks", op: "update", patch: { name: "q" }, filters: [{ column: "id", op: "eq", value: "nope" }] }).changed).toEqual([]);
  });

  it("deleting a task unlinks its children, completions and focus runs", () => {
    const q: Query = { table: "tasks", op: "delete", filters: [{ column: "id", op: "eq", value: "t1" }] };
    expect(tablesFor(q).sort()).toEqual(["focus_sessions", "task_completions", "tasks"]);
    const db: Db = {
      tasks: [{ id: "t1" }, { id: "t2", parent_id: "t1" }, { id: "t3", parent_id: "t2" }],
      task_completions: [{ id: "c1", task_id: "t1", title: "kept" }],
      focus_sessions: [{ id: "f1", task_id: "t9" }],
    };
    const { changed } = run(db, q);
    expect(db.tasks).toEqual([{ id: "t2", parent_id: null }, { id: "t3", parent_id: "t2" }]);
    expect(db.task_completions).toEqual([{ id: "c1", task_id: null, title: "kept" }]);
    expect(changed.sort()).toEqual(["task_completions", "tasks"]);
  });

  it("deleting a habit deletes its check-offs", () => {
    const db: Db = { habits: [{ id: "h1" }], habit_checks: [{ id: "c1", habit_id: "h1" }, { id: "c2", habit_id: "h2" }] };
    run(db, { table: "habits", op: "delete", filters: [{ column: "id", op: "eq", value: "h1" }] });
    expect(db.habit_checks).toEqual([{ id: "c2", habit_id: "h2" }]);
  });
});
