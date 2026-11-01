import { describe, expect, it } from "vitest";
import type { Priority, Task, TaskCategory } from "@/contexts/AppContext";
import { BOARD_ROWS, buildBoardColumns, DONE_COLUMN_ID, OVERDUE_COLUMN_ID, planBoardDrop } from "./boardColumns";

const cats: TaskCategory[] = [
  { id: "work", name: "Work", color: "red" },
  { id: "home", name: "Home", color: "blue" },
  { id: "empty", name: "Empty", color: "green" },
];

const task = (over: Partial<Task>): Task =>
  ({
    id: "t",
    name: "Task",
    startDate: "2026-10-07",
    endDate: "2026-10-07",
    categoryId: "work",
    completed: false,
    priority: "medium",
    ...over,
  }) as Task;

const TODAY = "2026-10-07";
const LATE = { startDate: "2026-10-01", endDate: "2026-10-01" };
const at = (columnId: string, priority: Priority = "medium") => ({ columnId, priority });

describe("buildBoardColumns", () => {
  it("lists every category, empty ones too, then Overdue and Done", () => {
    const cols = buildBoardColumns([task({ id: "a" })], cats, TODAY);
    expect(cols.map((c) => c.id)).toEqual(["work", "home", "empty", OVERDUE_COLUMN_ID, DONE_COLUMN_ID]);
    expect(cols.find((c) => c.id === "empty")?.tasks).toEqual([]);
    expect(buildBoardColumns([], cats, TODAY)).toHaveLength(5);
  });

  it("puts each task in exactly one column", () => {
    const open = task({ id: "open" });
    const late = task({ id: "late", ...LATE });
    const done = task({ id: "done", completed: true, endDate: "2026-10-01" });
    const cols = buildBoardColumns([open, late, done], cats, TODAY);
    const ids = (id: string) => cols.find((c) => c.id === id)!.tasks.map((t) => t.id);
    expect(ids("work")).toEqual(["open"]);
    expect(ids(OVERDUE_COLUMN_ID)).toEqual(["late"]);
    expect(ids(DONE_COLUMN_ID)).toEqual(["done"]);
  });

  it("splits each column into priority rows, keeping the order", () => {
    const tasks = [
      task({ id: "m1" }),
      task({ id: "u1", priority: "urgent" }),
      task({ id: "m2" }),
      task({ id: "l1", priority: "low" }),
    ];
    const work = buildBoardColumns(tasks, cats, TODAY)[0];
    expect(BOARD_ROWS).toEqual(["urgent", "high", "medium", "low"]);
    expect(BOARD_ROWS.map((p) => work.rows[p].map((t) => t.id))).toEqual([["u1"], [], ["m1", "m2"], ["l1"]]);
  });
});

describe("planBoardDrop", () => {
  it("changes the category of an open task", () => {
    expect(planBoardDrop(task({}), at("home"), cats, TODAY)).toEqual({
      kind: "update",
      updates: { categoryId: "home", parentId: undefined },
    });
  });

  it("does nothing when dropped on its own cell", () => {
    expect(planBoardDrop(task({}), at("work"), cats, TODAY)).toEqual({ kind: "none" });
  });

  it("changes the priority when dropped on another row", () => {
    expect(planBoardDrop(task({}), at("work", "urgent"), cats, TODAY)).toEqual({
      kind: "update",
      updates: { categoryId: "work", priority: "urgent", parentId: undefined },
    });
    expect(planBoardDrop(task({}), at("home", "low"), cats, TODAY)).toEqual({
      kind: "update",
      updates: { categoryId: "home", priority: "low", parentId: undefined },
    });
  });

  it("takes a subtask out of its parent even in the same cell", () => {
    expect(planBoardDrop(task({ parentId: "p" }), at("work"), cats, TODAY).kind).toBe("update");
  });

  it("completes on Done, setting the row's priority, and ignores a task already done", () => {
    expect(planBoardDrop(task({}), at(DONE_COLUMN_ID), cats, TODAY)).toEqual({ kind: "complete" });
    expect(planBoardDrop(task({}), at(DONE_COLUMN_ID, "high"), cats, TODAY)).toEqual({
      kind: "complete",
      updates: { priority: "high" },
    });
    expect(planBoardDrop(task({ completed: true }), at(DONE_COLUMN_ID), cats, TODAY)).toEqual({ kind: "none" });
  });

  it("moves a done task between Done rows", () => {
    expect(planBoardDrop(task({ completed: true }), at(DONE_COLUMN_ID, "low"), cats, TODAY)).toEqual({
      kind: "update",
      updates: { priority: "low" },
    });
  });

  it("reopens a completed task dragged to a category, even its own", () => {
    expect(planBoardDrop(task({ completed: true }), at("work"), cats, TODAY)).toEqual({
      kind: "update",
      updates: { categoryId: "work", parentId: undefined, completed: false },
    });
  });

  it("lets Overdue take only its own tasks, to change their priority", () => {
    expect(planBoardDrop(task({}), at(OVERDUE_COLUMN_ID, "high"), cats, TODAY)).toEqual({ kind: "none" });
    expect(planBoardDrop(task(LATE), at(OVERDUE_COLUMN_ID), cats, TODAY)).toEqual({ kind: "none" });
    expect(planBoardDrop(task(LATE), at(OVERDUE_COLUMN_ID, "urgent"), cats, TODAY)).toEqual({
      kind: "update",
      updates: { priority: "urgent" },
    });
  });

  it("refuses unknown columns", () => {
    expect(planBoardDrop(task({}), at("gone"), cats, TODAY)).toEqual({ kind: "none" });
  });
});
