import { beforeEach, describe, expect, it } from "vitest";
import type { Task } from "@/contexts/AppContext";
import {
  DEFAULT_FILTERS,
  DEFAULT_TASK_VIEW,
  TASK_VIEW_KEY,
  activeFilterCount,
  applyTaskView,
  parseTaskView,
  taskView,
  type TaskFilters,
  type TaskViewPrefs,
} from "./taskView";

const TODAY = "2026-10-07"; // a Wednesday

let n = 0;
function task(over: Partial<Task> = {}): Task {
  n++;
  return {
    id: `t${n}`,
    name: `Task ${n}`,
    startDate: TODAY,
    startTime: "09:00",
    endDate: TODAY,
    endTime: "10:00",
    priority: "medium",
    categoryId: "work",
    completed: false,
    ...over,
  };
}

const ctx = (childrenOf = new Map<string, Task[]>()) => ({ today: TODAY, childrenOf });
const view = (sort: Partial<TaskViewPrefs["sort"]> = {}, filters: Partial<TaskFilters> = {}): TaskViewPrefs => ({
  sort: { ...DEFAULT_TASK_VIEW.sort, ...sort },
  filters: { ...DEFAULT_FILTERS, ...filters },
});
const names = (tasks: Task[]) => tasks.map((t) => t.name);

beforeEach(() => {
  localStorage.clear();
  taskView._reset();
});

describe("sorting", () => {
  const a = task({ name: "b", priority: "low", endDate: "2026-10-09", startDate: "2026-10-01", estimateMinutes: 30, createdAt: "2026-01-02" });
  const b = task({ name: "A", priority: "urgent", endDate: "2026-10-08", startDate: "2026-10-05", createdAt: "2026-01-01" });
  const c = task({ name: "c", priority: "high", endDate: "2026-10-10", startDate: "2026-10-03", estimateMinutes: 15, completed: true });
  const list = [a, b, c];

  it("keeps the original order by default: open first, then priority", () => {
    expect(names(applyTaskView(list, view(), ctx()))).toEqual(["A", "b", "c"]);
  });

  it("sorts by each key, ascending and descending", () => {
    expect(names(applyTaskView(list, view({ key: "due" }), ctx()))).toEqual(["A", "b", "c"]);
    expect(names(applyTaskView(list, view({ key: "due", dir: "desc" }), ctx()))).toEqual(["c", "b", "A"]);
    expect(names(applyTaskView(list, view({ key: "start" }), ctx()))).toEqual(["b", "c", "A"]);
    expect(names(applyTaskView(list, view({ key: "priority" }), ctx()))).toEqual(["A", "c", "b"]);
    expect(names(applyTaskView(list, view({ key: "name" }), ctx()))).toEqual(["A", "b", "c"]);
    expect(names(applyTaskView(list, view({ key: "name", dir: "desc" }), ctx()))).toEqual(["c", "b", "A"]);
  });

  it("sinks missing values last in either direction", () => {
    expect(names(applyTaskView(list, view({ key: "estimate" }), ctx()))).toEqual(["c", "b", "A"]);
    expect(names(applyTaskView(list, view({ key: "estimate", dir: "desc" }), ctx()))).toEqual(["b", "c", "A"]);
    expect(names(applyTaskView(list, view({ key: "created" }), ctx()))).toEqual(["A", "b", "c"]);
    expect(names(applyTaskView(list, view({ key: "created", dir: "desc" }), ctx()))).toEqual(["b", "A", "c"]);
  });

  it("does not mutate its input", () => {
    const copy = [...list];
    applyTaskView(list, view({ key: "name", dir: "desc" }), ctx());
    expect(list).toEqual(copy);
  });
});

describe("filters", () => {
  it("keeps chosen categories and priorities", () => {
    const list = [task({ name: "w", categoryId: "work" }), task({ name: "h", categoryId: "home", priority: "urgent" })];
    expect(names(applyTaskView(list, view({}, { categories: ["home"] }), ctx()))).toEqual(["h"]);
    expect(names(applyTaskView(list, view({}, { priorities: ["medium"] }), ctx()))).toEqual(["w"]);
  });

  it("compares estimates and drops tasks without one", () => {
    const list = [task({ name: "15", estimateMinutes: 15 }), task({ name: "60", estimateMinutes: 60 }), task({ name: "none" })];
    const est = (op: "<=" | ">=" | "==", minutes: number) =>
      names(applyTaskView(list, view({ key: "estimate" }, { estimate: { op, minutes } }), ctx()));
    expect(est("<=", 30)).toEqual(["15"]);
    expect(est(">=", 15)).toEqual(["15", "60"]);
    expect(est("==", 60)).toEqual(["60"]);
  });

  it("matches the name case-insensitively", () => {
    const list = [task({ name: "Write Report" }), task({ name: "Gym" })];
    expect(names(applyTaskView(list, view({}, { name: "  report " }), ctx()))).toEqual(["Write Report"]);
  });

  it("applies the status flags", () => {
    const done = task({ name: "done", completed: true });
    const check = task({ name: "check", checklist: [{ id: "c", text: "x", done: false }] });
    const notes = task({ name: "notes", notes: "hi" });
    const parent = task({ name: "parent" });
    const list = [done, check, notes, parent];
    const kids = new Map([[parent.id, [task({ parentId: parent.id })]]]);
    const status = (flag: keyof TaskFilters["status"]) =>
      names(applyTaskView(list, view({ key: "name" }, { status: { ...DEFAULT_FILTERS.status, [flag]: true } }), ctx(kids)));
    expect(status("hideCompleted")).toEqual(["check", "notes", "parent"]);
    expect(status("hasChecklist")).toEqual(["check"]);
    expect(status("hasNotes")).toEqual(["notes"]);
    expect(status("hasSubtasks")).toEqual(["parent"]);
  });

  it("filters by due range", () => {
    const today = task({ name: "today" });
    const fri = task({ name: "fri", startDate: "2026-10-09", endDate: "2026-10-09" });
    const next = task({ name: "next", startDate: "2026-10-13", endDate: "2026-10-13" });
    const late = task({ name: "late", startDate: "2026-10-01", endDate: "2026-10-02" });
    const weekly = task({ name: "weekly", startDate: "2026-09-01", endDate: "2026-09-01", repeat: { kind: "days", every: 7 } });
    const list = [today, fri, next, late, weekly];
    const due = (d: Partial<TaskFilters["due"]>) =>
      names(applyTaskView(list, view({ key: "name" }, { due: { ...DEFAULT_FILTERS.due, ...d } }), ctx()));
    expect(due({ range: "today" })).toEqual(["today"]);
    expect(due({ range: "week" })).toEqual(["fri", "today", "weekly"]);
    expect(due({ range: "overdue" })).toEqual(["late"]);
    expect(due({ range: "custom", from: "2026-10-10", to: "2026-10-14" })).toEqual(["next", "weekly"]);
    expect(due({ range: "custom", from: "2026-10-12", to: "" })).toEqual(["next"]);
    expect(due({ range: "custom", from: "2026-10-14", to: "2026-10-10" })).toEqual([]);
  });

  it("counts active filters", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        categories: ["a"],
        name: "x",
        status: { ...DEFAULT_FILTERS.status, hasNotes: true, hideCompleted: true },
        due: { range: "today", from: "", to: "" },
      }),
    ).toBe(5);
  });
});

describe("persistence", () => {
  it("round-trips through storage", () => {
    taskView.setSort({ key: "due", dir: "desc" });
    taskView.setFilters({ priorities: ["high"], estimate: { op: ">=", minutes: 20 } });
    taskView._reset();
    expect(taskView.getState().sort).toEqual({ key: "due", dir: "desc" });
    expect(taskView.getState().filters.priorities).toEqual(["high"]);
    expect(taskView.getState().filters.estimate).toEqual({ op: ">=", minutes: 20 });
    expect(JSON.parse(localStorage.getItem(TASK_VIEW_KEY) ?? "null").sort.key).toBe("due");
  });

  it("resets filters but keeps the sort", () => {
    taskView.setSort({ key: "name" });
    taskView.setFilters({ name: "x" });
    taskView.resetFilters();
    expect(taskView.getState()).toEqual({ sort: { key: "name", dir: "asc" }, filters: DEFAULT_FILTERS });
  });

  it("falls back field by field for malformed data", () => {
    expect(parseTaskView(null)).toEqual(DEFAULT_TASK_VIEW);
    expect(parseTaskView("{nope")).toEqual(DEFAULT_TASK_VIEW);
    const parsed = parseTaskView(
      JSON.stringify({
        sort: { key: "bogus", dir: "desc" },
        filters: { priorities: ["high", "nope"], estimate: { op: "<", minutes: -3 }, due: { range: "custom", from: "bad", to: "2026-10-10" }, status: { hasNotes: true } },
      }),
    );
    expect(parsed.sort).toEqual({ key: "default", dir: "desc" });
    expect(parsed.filters.priorities).toEqual(["high"]);
    expect(parsed.filters.estimate).toBeNull();
    expect(parsed.filters.due).toEqual({ range: "custom", from: "", to: "2026-10-10" });
    expect(parsed.filters.status.hasNotes).toBe(true);
    expect(parsed.filters.status.hideCompleted).toBe(false);
  });
});
