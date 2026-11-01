/**
 * The Engine's Board: which tasks sit in which cell, and what a drop does.
 * Columns are categories plus Overdue and Done; rows are priorities.
 * Pure, so the page only renders the grid and applies the plan.
 */
import type { Priority, Task, TaskCategory } from "@/contexts/AppContext";
import { isTaskOverdue } from "@/lib/utils";

export const OVERDUE_COLUMN_ID = "__overdue__";
export const DONE_COLUMN_ID = "__done__";

export const OVERDUE_COLOR = "hsl(38 92% 50%)";
export const DONE_COLOR = "hsl(160 84% 39%)";

/** The Board's rows, top to bottom. */
export const BOARD_ROWS: readonly Priority[] = ["urgent", "high", "medium", "low"];

/** Cards a cell shows before folding the rest under "… N more". */
export const CELL_PREVIEW = 3;

/** Columns that start folded: their cards hidden until the column is opened. */
export const FOLDED_COLUMNS: readonly string[] = [OVERDUE_COLUMN_ID, DONE_COLUMN_ID];

export type BoardColumn = {
  id: string;
  label: string;
  color: string;
  tasks: Task[];
  /** The column's tasks split by priority, each in the order they came in. */
  rows: Record<Priority, Task[]>;
};

/** A cell on the Board: a column and a priority row. */
export type BoardTarget = { columnId: string; priority: Priority };

function byPriority(tasks: Task[]): Record<Priority, Task[]> {
  const rows: Record<Priority, Task[]> = { urgent: [], high: [], medium: [], low: [] };
  for (const t of tasks) (rows[t.priority] ?? rows.medium).push(t);
  return rows;
}

/**
 * One column per category (empty ones too), then Overdue, then Done. An overdue
 * task shows in Overdue only, as in the List; a completed one in Done only.
 * Tasks keep the order they came in.
 */
export function buildBoardColumns(tasks: Task[], categories: TaskCategory[], today: string): BoardColumn[] {
  const overdue = tasks.filter((t) => isTaskOverdue(t, today));
  const overdueIds = new Set(overdue.map((t) => t.id));
  const column = (id: string, label: string, color: string, tasks: Task[]): BoardColumn => ({
    id,
    label,
    color,
    tasks,
    rows: byPriority(tasks),
  });
  return [
    ...categories.map((cat) =>
      column(cat.id, cat.name, cat.color, tasks.filter((t) => t.categoryId === cat.id && !t.completed && !overdueIds.has(t.id))),
    ),
    column(OVERDUE_COLUMN_ID, "Overdue", OVERDUE_COLOR, overdue),
    column(DONE_COLUMN_ID, "Done", DONE_COLOR, tasks.filter((t) => t.completed)),
  ];
}

export type BoardDrop =
  | { kind: "none" }
  /**
   * Complete through the app's completeTask, so repeats roll on and checklists
   * tick. `updates` (a new priority, leaving a parent) are applied first.
   */
  | { kind: "complete"; updates?: Partial<Task> }
  | { kind: "update"; updates: Partial<Task> };

/**
 * What dropping `task` on a cell does. The row sets the priority. Overdue takes
 * only its own tasks, to change their priority (they are late by their dates;
 * reschedule them to move them out). Done completes. A category column sets the
 * category, reopens a completed task, and takes a subtask back to the top
 * level. Dropping where a task already is does nothing.
 */
export function planBoardDrop(task: Task, target: BoardTarget, categories: TaskCategory[], today: string): BoardDrop {
  const { columnId, priority } = target;
  const reprioritised: Partial<Task> = task.priority === priority ? {} : { priority };
  const changesPriority = "priority" in reprioritised;

  if (columnId === OVERDUE_COLUMN_ID) {
    if (task.completed || !isTaskOverdue(task, today) || !changesPriority) return { kind: "none" };
    return { kind: "update", updates: reprioritised };
  }
  if (columnId === DONE_COLUMN_ID) {
    if (!task.completed) {
      const updates = { ...reprioritised, ...(task.parentId ? { parentId: undefined } : {}) };
      return Object.keys(updates).length ? { kind: "complete", updates } : { kind: "complete" };
    }
    return changesPriority ? { kind: "update", updates: reprioritised } : { kind: "none" };
  }
  if (!categories.some((c) => c.id === columnId)) return { kind: "none" };
  if (!task.completed && task.categoryId === columnId && !task.parentId && !changesPriority) return { kind: "none" };
  // An explicit parentId: undefined moves a subtask out; for a top-level task it changes nothing.
  return {
    kind: "update",
    updates: {
      categoryId: columnId,
      ...reprioritised,
      parentId: undefined,
      ...(task.completed ? { completed: false } : {}),
    },
  };
}
