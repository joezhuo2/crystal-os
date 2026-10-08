import { describe, expect, it } from "vitest";
import type { Task, TaskCategory } from "@/contexts/AppContext";
import { buildBoardColumns, DONE_COLUMN_ID, OVERDUE_COLUMN_ID, planBoardDrop } from "./boardColumns";

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

describe("buildBoardColumns", () => {
  it("lists every category, empty ones too, then Overdue and Done", () => {
    const cols = buildBoardColumns([task({ id: "a" })], cats, TODAY);
    expect(cols.map((c) => c.id)).toEqual(["work", "home", "empty", OVERDUE_COLUMN_ID, DONE_COLUMN_ID]);
    expect(cols.find((c) => c.id === "empty")?.tasks).toEqual([]);
    expect(buildBoardColumns([], cats, TODAY)).toHaveLength(5);
  });

  it("puts each task in exactly one column", () => {
    const open = task({ id: "open" });
    const late = task({ id: "late", endDate: "2026-10-01", startDate: "2026-10-01" });
    const done = task({ id: "done", completed: true, endDate: "2026-10-01" });
    const cols = buildBoardColumns([open, late, done], cats, TODAY);
    const ids = (id: string) => cols.find((c) => c.id === id)!.tasks.map((t) => t.id);
    expect(ids("work")).toEqual(["open"]);
    expect(ids(OVERDUE_COLUMN_ID)).toEqual(["late"]);
    expect(ids(DONE_COLUMN_ID)).toEqual(["done"]);
  });

  it("only Overdue refuses drops", () => {
    const cols = buildBoardColumns([], cats, TODAY);
    expect(cols.filter((c) => !c.droppable).map((c) => c.id)).toEqual([OVERDUE_COLUMN_ID]);
  });
});

describe("planBoardDrop", () => {
  it("changes the category of an open task", () => {
    expect(planBoardDrop(task({}), "home", cats)).toEqual({
      kind: "update",
      updates: { categoryId: "home", parentId: undefined },
    });
  });

  it("does nothing when dropped on its own category", () => {
    expect(planBoardDrop(task({}), "work", cats)).toEqual({ kind: "none" });
  });

  it("takes a subtask out of its parent even in the same category", () => {
    expect(planBoardDrop(task({ parentId: "p" }), "work", cats).kind).toBe("update");
  });

  it("completes on Done, and ignores a task already done", () => {
    expect(planBoardDrop(task({}), DONE_COLUMN_ID, cats)).toEqual({ kind: "complete" });
    expect(planBoardDrop(task({ completed: true }), DONE_COLUMN_ID, cats)).toEqual({ kind: "none" });
  });

  it("reopens a completed task dragged to a category, even its own", () => {
    expect(planBoardDrop(task({ completed: true }), "work", cats)).toEqual({
      kind: "update",
      updates: { categoryId: "work", parentId: undefined, completed: false },
    });
  });

  it("refuses Overdue and unknown columns", () => {
    expect(planBoardDrop(task({}), OVERDUE_COLUMN_ID, cats)).toEqual({ kind: "none" });
    expect(planBoardDrop(task({}), "gone", cats)).toEqual({ kind: "none" });
  });
});
