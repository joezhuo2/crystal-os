/**
 * The Engine's Board: which tasks sit in which column, and what a drop does.
 * Pure, so the page only renders the columns and applies the plan.
 */
import type { Task, TaskCategory } from "@/contexts/AppContext";
import { isTaskOverdue } from "@/lib/utils";

export const OVERDUE_COLUMN_ID = "__overdue__";
export const DONE_COLUMN_ID = "__done__";

export const OVERDUE_COLOR = "hsl(38 92% 50%)";
export const DONE_COLOR = "hsl(160 84% 39%)";

export type BoardColumn = {
  id: string;
  label: string;
  color: string;
  tasks: Task[];
  /** Whether a task can be dropped here. Overdue is a state, not a place to put work. */
  droppable: boolean;
};

/**
 * One column per category (empty ones too), then Overdue, then Done. An overdue
 * task shows in Overdue only, as in the List; a completed one in Done only.
 * Tasks keep the order they came in.
 */
export function buildBoardColumns(tasks: Task[], categories: TaskCategory[], today: string): BoardColumn[] {
  const overdue = tasks.filter((t) => isTaskOverdue(t, today));
  const overdueIds = new Set(overdue.map((t) => t.id));
  const categoryColumns = categories.map((cat) => ({
    id: cat.id,
    label: cat.name,
    color: cat.color,
    tasks: tasks.filter((t) => t.categoryId === cat.id && !t.completed && !overdueIds.has(t.id)),
    droppable: true,
  }));
  return [
    ...categoryColumns,
    { id: OVERDUE_COLUMN_ID, label: "Overdue", color: OVERDUE_COLOR, tasks: overdue, droppable: false },
    { id: DONE_COLUMN_ID, label: "Done", color: DONE_COLOR, tasks: tasks.filter((t) => t.completed), droppable: true },
  ];
}

export type BoardDrop =
  | { kind: "none" }
  /** Complete through the app's completeTask, so repeats roll on and checklists tick. */
  | { kind: "complete" }
  | { kind: "update"; updates: Partial<Task> };

/**
 * What dropping `task` on column `columnId` does. Overdue refuses drops (its
 * tasks are late by their dates; reschedule them to move them). Done completes.
 * A category column sets the category, reopens a completed task, and takes a
 * subtask back to the top level. Dropping where a task already is does nothing.
 */
export function planBoardDrop(task: Task, columnId: string, categories: TaskCategory[]): BoardDrop {
  if (columnId === OVERDUE_COLUMN_ID) return { kind: "none" };
  if (columnId === DONE_COLUMN_ID) return task.completed ? { kind: "none" } : { kind: "complete" };
  if (!categories.some((c) => c.id === columnId)) return { kind: "none" };
  if (!task.completed && task.categoryId === columnId && !task.parentId) return { kind: "none" };
  // An explicit parentId: undefined moves a subtask out; for a top-level task it changes nothing.
  return {
    kind: "update",
    updates: { categoryId: columnId, parentId: undefined, ...(task.completed ? { completed: false } : {}) },
  };
}
