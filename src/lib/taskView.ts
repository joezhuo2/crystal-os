/**
 * The Engine task list's sort and filter (the "Sort & Filter" button next to
 * Categories). Pure functions plus a small persisted store: the choice lives in
 * localStorage as one JSON object, per device, and applies to the List and the
 * Board alike. Filters only ever look at top-level tasks; a parent that passes
 * keeps all of its subtasks.
 */

import { useSyncExternalStore } from "react";
import type { Priority, Task } from "@/contexts/AppContext";
import { addDays, isTaskOverdue, taskFallsOnDate } from "@/lib/utils";

export const TASK_VIEW_KEY = "crystal-os-task-view";

export const SORT_KEYS = ["default", "due", "start", "priority", "estimate", "name", "created"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const SORT_LABELS: Record<SortKey, string> = {
  default: "Default",
  due: "Due date",
  start: "Start date",
  priority: "Priority",
  estimate: "Estimate",
  name: "Name",
  created: "Created",
};

export const ESTIMATE_OPS = ["<=", ">=", "=="] as const;
export type EstimateOp = (typeof ESTIMATE_OPS)[number];

export const DUE_RANGES = ["any", "today", "week", "overdue", "custom"] as const;
export type DueRange = (typeof DUE_RANGES)[number];

export const STATUS_FLAGS = ["hideCompleted", "hasChecklist", "hasNotes", "hasSubtasks"] as const;
export type StatusFlag = (typeof STATUS_FLAGS)[number];

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export interface TaskFilters {
  /** Category ids to keep; empty keeps every category. */
  categories: string[];
  /** Priorities to keep; empty keeps every priority. */
  priorities: Priority[];
  /** Minutes, or null for no estimate filter. Tasks with no estimate fail an active one. */
  estimate: { op: EstimateOp; minutes: number } | null;
  /** Case-insensitive substring of the name; "" for none. */
  name: string;
  status: Record<StatusFlag, boolean>;
  due: { range: DueRange; from: string; to: string };
}

export interface TaskViewPrefs {
  sort: { key: SortKey; dir: SortDir };
  filters: TaskFilters;
}

export const DEFAULT_FILTERS: TaskFilters = {
  categories: [],
  priorities: [],
  estimate: null,
  name: "",
  status: { hideCompleted: false, hasChecklist: false, hasNotes: false, hasSubtasks: false },
  due: { range: "any", from: "", to: "" },
};

export const DEFAULT_TASK_VIEW: TaskViewPrefs = {
  sort: { key: "default", dir: "asc" },
  filters: DEFAULT_FILTERS,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Reads stored prefs. Each malformed field falls back to its default on its own. */
export function parseTaskView(raw: string | null): TaskViewPrefs {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const stored = obj(data);
  const sort = obj(stored.sort);
  const f = obj(stored.filters);
  const est = obj(f.estimate);
  const status = obj(f.status);
  const due = obj(f.due);
  const minutes = typeof est.minutes === "number" && Number.isFinite(est.minutes) && est.minutes >= 0 ? Math.round(est.minutes) : null;
  const date = (v: unknown) => (typeof v === "string" && DATE_RE.test(v) ? v : "");
  return {
    sort: { key: oneOf(SORT_KEYS, sort.key, "default"), dir: oneOf(["asc", "desc"] as const, sort.dir, "asc") },
    filters: {
      categories: Array.isArray(f.categories) ? f.categories.filter((c): c is string => typeof c === "string") : [],
      priorities: Array.isArray(f.priorities) ? PRIORITIES.filter((p) => (f.priorities as unknown[]).includes(p)) : [],
      estimate: minutes === null ? null : { op: oneOf(ESTIMATE_OPS, est.op, "<="), minutes },
      name: typeof f.name === "string" ? f.name : "",
      status: Object.fromEntries(STATUS_FLAGS.map((k) => [k, status[k] === true])) as Record<StatusFlag, boolean>,
      due: { range: oneOf(DUE_RANGES, due.range, "any"), from: date(due.from), to: date(due.to) },
    },
  };
}

/** How many filters narrow the list; the badge on the button. */
export function activeFilterCount(f: TaskFilters): number {
  let n = 0;
  if (f.categories.length) n++;
  if (f.priorities.length) n++;
  if (f.estimate) n++;
  if (f.name.trim()) n++;
  n += STATUS_FLAGS.filter((k) => f.status[k]).length;
  if (f.due.range !== "any") n++;
  return n;
}

/** Monday of the week holding `day`. */
function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00`).getDay(); // 0 = Sunday
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** Longest custom range checked day by day, for repeating tasks. */
const MAX_RANGE_DAYS = 400;

function fallsInRange(task: Task, from: string, to: string): boolean {
  if (task.startDate <= to && task.endDate >= from) return true;
  if (!task.repeat) return false;
  let d = from;
  for (let i = 0; d <= to && i < MAX_RANGE_DAYS; i++, d = addDays(d, 1)) {
    if (taskFallsOnDate(task, d)) return true;
  }
  return false;
}

function matchesDue(task: Task, due: TaskFilters["due"], today: string): boolean {
  switch (due.range) {
    case "any":
      return true;
    case "today":
      return taskFallsOnDate(task, today);
    case "week": {
      const monday = mondayOf(today);
      return fallsInRange(task, monday, addDays(monday, 6));
    }
    case "overdue":
      return isTaskOverdue(task, today);
    case "custom": {
      // An open end leaves that side unbounded.
      const from = due.from || "0000-01-01";
      const to = due.to || "9999-12-31";
      if (from > to) return false;
      if (!due.from || !due.to) return task.endDate >= from && task.startDate <= to;
      return fallsInRange(task, from, to);
    }
  }
}

export function matchesFilters(
  task: Task,
  f: TaskFilters,
  ctx: { today: string; childrenOf: Map<string, Task[]> },
): boolean {
  if (f.categories.length && !f.categories.includes(task.categoryId)) return false;
  if (f.priorities.length && !f.priorities.includes(task.priority)) return false;
  if (f.estimate) {
    const m = task.estimateMinutes;
    if (m === undefined) return false;
    const { op, minutes } = f.estimate;
    if (op === "<=" ? m > minutes : op === ">=" ? m < minutes : m !== minutes) return false;
  }
  const q = f.name.trim().toLowerCase();
  if (q && !task.name.toLowerCase().includes(q)) return false;
  if (f.status.hideCompleted && task.completed) return false;
  if (f.status.hasChecklist && !task.checklist?.length) return false;
  if (f.status.hasNotes && !task.notes?.trim()) return false;
  if (f.status.hasSubtasks && !ctx.childrenOf.get(task.id)?.length) return false;
  return matchesDue(task, f.due, ctx.today);
}

/** The List's original order: open before done, then by priority. */
function defaultCompare(a: Task, b: Task): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

/** The value a key sorts by; undefined always sorts last, whatever the direction. */
function sortValue(t: Task, key: Exclude<SortKey, "default">): string | number | undefined {
  switch (key) {
    case "due":
      return `${t.endDate} ${t.endTime || "99:99"}`;
    case "start":
      return `${t.startDate} ${t.startTime || "00:00"}`;
    case "priority":
      return PRIORITY_RANK[t.priority];
    case "estimate":
      return t.estimateMinutes;
    case "name":
      return t.name.toLocaleLowerCase();
    case "created":
      return t.createdAt || undefined;
  }
}

export function compareTasks(sort: TaskViewPrefs["sort"]): (a: Task, b: Task) => number {
  const sign = sort.dir === "desc" ? -1 : 1;
  if (sort.key === "default") return (a, b) => sign * defaultCompare(a, b);
  const key = sort.key;
  return (a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === undefined || vb === undefined) {
      if (va !== vb) return va === undefined ? 1 : -1;
    } else if (va !== vb) {
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      if (c) return sign * c;
    }
    return defaultCompare(a, b);
  };
}

/** Filters then sorts the top-level tasks. Returns a new array. */
export function applyTaskView(
  tasks: Task[],
  prefs: TaskViewPrefs,
  ctx: { today: string; childrenOf: Map<string, Task[]> },
): Task[] {
  return tasks.filter((t) => matchesFilters(t, prefs.filters, ctx)).sort(compareTasks(prefs.sort));
}

/* ── persisted store ── */

function load(): TaskViewPrefs {
  try {
    return parseTaskView(localStorage.getItem(TASK_VIEW_KEY));
  } catch {
    return DEFAULT_TASK_VIEW;
  }
}

let state: TaskViewPrefs = load();
const listeners = new Set<() => void>();

function set(next: TaskViewPrefs) {
  state = next;
  try {
    localStorage.setItem(TASK_VIEW_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

export const taskView = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setSort(sort: Partial<TaskViewPrefs["sort"]>) {
    set({ ...state, sort: { ...state.sort, ...sort } });
  },

  setFilters(patch: Partial<TaskFilters>) {
    set({ ...state, filters: { ...state.filters, ...patch } });
  },

  resetFilters() {
    set({ ...state, filters: DEFAULT_FILTERS });
  },

  reset() {
    set(DEFAULT_TASK_VIEW);
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useTaskView() {
  return useSyncExternalStore(taskView.subscribe, taskView.getState);
}
