import { describe, expect, it } from "vitest";
import {
  canNest,
  cleanChecklist,
  cleanNotes,
  describeProgress,
  makeItem,
  moveItem,
  nestTargets,
  splitByParent,
  subtaskProgress,
  tickAll,
  topLevelTasks,
  untickAll,
  MAX_NOTES,
  type ChecklistItem,
} from "./subtasks";

const t = (id: string, extra: Partial<{ completed: boolean; parentId: string; checklist: ChecklistItem[] }> = {}) => ({
  id,
  completed: false,
  ...extra,
});

describe("cleanNotes", () => {
  it("trims and drops blank notes", () => {
    expect(cleanNotes("  hello \n")).toBe("hello");
    expect(cleanNotes("   ")).toBeUndefined();
    expect(cleanNotes(null)).toBeUndefined();
    expect(cleanNotes(42)).toBeUndefined();
  });

  it("caps the length", () => {
    expect(cleanNotes("x".repeat(MAX_NOTES + 5))).toHaveLength(MAX_NOTES);
  });
});

describe("cleanChecklist", () => {
  it("keeps valid items and drops junk", () => {
    const out = cleanChecklist([
      { id: "a", text: " Buy milk ", done: true },
      { id: "b", text: "  " },
      null,
      "nope",
      { text: "No id" },
    ]);
    expect(out).toHaveLength(2);
    expect(out![0]).toEqual({ id: "a", text: "Buy milk", done: true });
    expect(out![1].text).toBe("No id");
    expect(out![1].done).toBe(false);
    expect(out![1].id).toBeTruthy();
  });

  it("returns undefined for an empty or non-array value", () => {
    expect(cleanChecklist([])).toBeUndefined();
    expect(cleanChecklist(null)).toBeUndefined();
    expect(cleanChecklist({})).toBeUndefined();
  });
});

describe("makeItem", () => {
  it("makes an unticked item, or nothing for blank text", () => {
    expect(makeItem("  Call bank ")).toMatchObject({ text: "Call bank", done: false });
    expect(makeItem(" ")).toBeUndefined();
  });
});

describe("tickAll / untickAll", () => {
  const list = [{ id: "a", text: "A", done: true }, { id: "b", text: "B", done: false }];
  it("ticks and unticks every item", () => {
    expect(tickAll(list)!.every((i) => i.done)).toBe(true);
    expect(untickAll(list)!.every((i) => !i.done)).toBe(true);
    expect(tickAll(undefined)).toBeUndefined();
  });
});

describe("moveItem", () => {
  const list = ["a", "b", "c"].map((id) => ({ id, text: id, done: false }));
  it("moves an item and shifts the rest", () => {
    expect(moveItem(list, 0, 2).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moveItem(list, 2, 0).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
  it("ignores out-of-range moves", () => {
    expect(moveItem(list, 0, 5)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
  });
});

describe("nesting", () => {
  const tasks = [t("p"), t("c", { parentId: "p" }), t("x"), t("done", { completed: true })];

  it("splits top-level tasks from children", () => {
    const { top, children } = splitByParent(tasks);
    expect(top.map((x) => x.id)).toEqual(["p", "x", "done"]);
    expect(children.get("p")!.map((x) => x.id)).toEqual(["c"]);
  });

  it("treats an orphaned child as top-level", () => {
    expect(topLevelTasks([t("c", { parentId: "gone" })]).map((x) => x.id)).toEqual(["c"]);
  });

  it("allows nesting a plain task under a top-level task", () => {
    expect(canNest("x", "p", tasks)).toBe(true);
  });

  it("refuses self, a child as parent, a parent as child, and a repeat nest", () => {
    expect(canNest("x", "x", tasks)).toBe(false);
    expect(canNest("x", "c", tasks)).toBe(false);
    expect(canNest("p", "x", tasks)).toBe(false);
    expect(canNest("c", "p", tasks)).toBe(false);
    expect(canNest("x", "missing", tasks)).toBe(false);
  });

  it("lists open top-level targets other than the task itself", () => {
    expect(nestTargets("x", tasks).map((x) => x.id)).toEqual(["p"]);
    expect(nestTargets(undefined, tasks).map((x) => x.id)).toEqual(["p", "x"]);
    expect(nestTargets("p", tasks)).toEqual([]);
  });
});

describe("progress", () => {
  it("counts open checklist items and child tasks together", () => {
    const parent = t("p", { checklist: [{ id: "a", text: "A", done: true }, { id: "b", text: "B", done: false }] });
    const p = subtaskProgress(parent, [t("c1"), t("c2", { completed: true })]);
    expect(p).toEqual({ open: 2, total: 4 });
    expect(describeProgress(p)).toBe("+2 subtasks");
  });

  it("reads 'All N done' once everything is ticked, and nothing without subtasks", () => {
    expect(describeProgress({ open: 0, total: 3 })).toBe("All 3 done");
    expect(describeProgress({ open: 0, total: 1 })).toBe("Subtask done");
    expect(describeProgress({ open: 1, total: 1 })).toBe("+1 subtask");
    expect(describeProgress({ open: 0, total: 0 })).toBe("");
  });
});
