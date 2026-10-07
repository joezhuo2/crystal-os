import { describe, expect, it } from "vitest";
import { focusTaskOptions, reconcileFocusTask } from "./focusTask";

const t = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  completed: false,
  startDate: "2026-10-07",
  priority: "medium" as const,
  ...extra,
});

describe("reconcileFocusTask", () => {
  const linked = { id: "a", title: "Write report" };

  it("keeps an open task with the same name", () => {
    expect(reconcileFocusTask(linked, [t("a", "Write report")])).toEqual({ action: "keep" });
  });

  it("unlinks a deleted task", () => {
    expect(reconcileFocusTask(linked, [t("b", "Other")])).toEqual({ action: "unlink" });
  });

  it("unlinks a completed task", () => {
    expect(reconcileFocusTask(linked, [t("a", "Write report", { completed: true })])).toEqual({ action: "unlink" });
  });

  it("renames a renamed task", () => {
    expect(reconcileFocusTask(linked, [t("a", "Write final report")])).toEqual({ action: "rename", title: "Write final report" });
  });

  it("does nothing when unlinked", () => {
    expect(reconcileFocusTask(null, [])).toEqual({ action: "keep" });
  });
});

describe("focusTaskOptions", () => {
  const today = "2026-10-07";

  it("lists open, awake tasks: overdue and today first, then by date, priority and name", () => {
    const tasks = [
      t("done", "Done", { completed: true }),
      t("snz", "Snoozed", { someday: true }),
      t("later", "Later", { startDate: "2026-10-20" }),
      t("b", "Beta"),
      t("u", "Urgent", { priority: "urgent" }),
      t("old", "Overdue", { startDate: "2026-10-01" }),
      t("a", "Alpha"),
    ];
    expect(focusTaskOptions(tasks, today).map((x) => x.id)).toEqual(["old", "u", "a", "b", "later"]);
  });

  it("leaves out children of snoozed parents", () => {
    const tasks = [t("p", "Parent", { someday: true }), t("c", "Child", { parentId: "p" })];
    expect(focusTaskOptions(tasks, today)).toEqual([]);
  });
});
