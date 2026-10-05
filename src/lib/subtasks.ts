/**
 * Notes and subtasks on Engine tasks (v0.9.3).
 *
 * A task has two kinds of subtask:
 *   - checklist items, light rows stored on the task itself (`tasks.checklist`);
 *   - child tasks, full tasks nested under it (`tasks.parent_id`).
 *
 * Nesting is one level deep: a child task cannot have children of its own,
 * and a task with children cannot be nested.
 */

export type ChecklistItem = { id: string; text: string; done: boolean };

/** The fields these helpers read off a task. */
type TaskLike = { id: string; completed: boolean; parentId?: string; checklist?: ChecklistItem[] };

/**
 * The task being dragged in The Engine. A dragover handler cannot read the
 * drag's data, only its types, so the id is kept here for drop targets to
 * check whether they would take it.
 */
export const taskDrag: { id: string | null } = { id: null };

/** Longest note kept, in characters. */
export const MAX_NOTES = 10000;
/** Longest checklist item kept, in characters. */
export const MAX_ITEM_TEXT = 500;

/** A note worth storing: trimmed and capped, or undefined when blank. */
export function cleanNotes(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  return text ? text.slice(0, MAX_NOTES) : undefined;
}

/**
 * A checklist read from the database (or typed into the form): items without
 * text are dropped, ids filled in, and an empty list comes back undefined.
 */
export function cleanChecklist(raw: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.flatMap((entry): ChecklistItem[] => {
    if (!entry || typeof entry !== "object") return [];
    const { id, text, done } = entry as Record<string, unknown>;
    if (typeof text !== "string" || !text.trim()) return [];
    return [{
      id: typeof id === "string" && id ? id : newItemId(),
      text: text.trim().slice(0, MAX_ITEM_TEXT),
      done: done === true,
    }];
  });
  return items.length ? items : undefined;
}

export function newItemId(): string {
  return crypto.randomUUID();
}

/** A new, unticked checklist item, or undefined for blank text. */
export function makeItem(text: string): ChecklistItem | undefined {
  const clean = text.trim();
  return clean ? { id: newItemId(), text: clean.slice(0, MAX_ITEM_TEXT), done: false } : undefined;
}

/** Every item ticked (the parent was completed). */
export function tickAll(list: ChecklistItem[] | undefined): ChecklistItem[] | undefined {
  return list?.map((item) => (item.done ? item : { ...item, done: true }));
}

/** Every item unticked (a repeating task moved on to its next date). */
export function untickAll(list: ChecklistItem[] | undefined): ChecklistItem[] | undefined {
  return list?.map((item) => (item.done ? { ...item, done: false } : item));
}

/** Moves the item at `from` to `to`, shifting the rest. */
export function moveItem(list: ChecklistItem[], from: number, to: number): ChecklistItem[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Whether a task shows at the top level. A child whose parent is gone (deleted
 * elsewhere, or not loaded) counts as top-level, so it never goes missing.
 */
export function isTopLevel(task: TaskLike, ids: ReadonlySet<string>): boolean {
  return !task.parentId || !ids.has(task.parentId);
}

/** The top-level tasks, and each parent's child tasks in list order. */
export function splitByParent<T extends TaskLike>(tasks: T[]): { top: T[]; children: Map<string, T[]> } {
  const ids = new Set(tasks.map((t) => t.id));
  const top: T[] = [];
  const children = new Map<string, T[]>();
  for (const task of tasks) {
    if (isTopLevel(task, ids)) {
      top.push(task);
    } else {
      const list = children.get(task.parentId!) ?? [];
      list.push(task);
      children.set(task.parentId!, list);
    }
  }
  return { top, children };
}

/** Only the top-level tasks. */
export function topLevelTasks<T extends TaskLike>(tasks: T[]): T[] {
  const ids = new Set(tasks.map((t) => t.id));
  return tasks.filter((t) => isTopLevel(t, ids));
}

/** Whether `childId` may be nested under `parentId`, keeping nesting one level deep. */
export function canNest(childId: string, parentId: string, tasks: TaskLike[]): boolean {
  if (childId === parentId) return false;
  const parent = tasks.find((t) => t.id === parentId);
  if (!parent || parent.parentId) return false;
  if (tasks.some((t) => t.parentId === childId)) return false;
  const child = tasks.find((t) => t.id === childId);
  return !child || child.parentId !== parentId;
}

/**
 * The tasks a task could be nested under: open, top-level, and not itself.
 * Empty for a task that has children. `childId` is undefined for a task not
 * saved yet.
 */
export function nestTargets<T extends TaskLike>(childId: string | undefined, tasks: T[]): T[] {
  if (childId && tasks.some((t) => t.parentId === childId)) return [];
  return tasks.filter((t) => !t.completed && !t.parentId && t.id !== childId);
}

/** Open and total subtasks of a task, checklist items and child tasks together. */
export function subtaskProgress(task: TaskLike, children: TaskLike[] = []): { open: number; total: number } {
  const items = task.checklist ?? [];
  return {
    open: items.filter((i) => !i.done).length + children.filter((c) => !c.completed).length,
    total: items.length + children.length,
  };
}

/** "+3 subtasks" while any are open, "All 4 done" once none are. Empty with no subtasks. */
export function describeProgress({ open, total }: { open: number; total: number }): string {
  if (total === 0) return "";
  if (open === 0) return total === 1 ? "Subtask done" : `All ${total} done`;
  return `+${open} subtask${open === 1 ? "" : "s"}`;
}
