import { describe, expect, it, vi, beforeEach } from "vitest";

const toastMock = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

import { restorePatch, undoToast, UNDO_MS } from "./undo";

describe("restorePatch", () => {
  it("returns only the changed fields, as they were before", () => {
    const before = { name: "A", startDate: "2026-10-01", endDate: "2026-10-01", priority: "low" };
    expect(restorePatch(before, { startDate: "2026-10-08", endDate: "2026-10-08" })).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-01",
    });
  });

  it("gives back an explicit undefined for a field the change added", () => {
    const before: { name: string; snoozedUntil?: string } = { name: "A" };
    const patch = restorePatch(before, { snoozedUntil: "2026-10-10" });
    expect("snoozedUntil" in patch).toBe(true);
    expect(patch.snoozedUntil).toBeUndefined();
  });

  it("puts back a field the change cleared", () => {
    const before: { name: string; parentId?: string } = { name: "A", parentId: "p1" };
    expect(restorePatch(before, { parentId: undefined })).toEqual({ parentId: "p1" });
  });
});

describe("undoToast", () => {
  beforeEach(() => toastMock.mockReset());

  it("shows an Undo action for 5 s", () => {
    undoToast("Task deleted", () => {}, "detail");
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe("Task deleted");
    expect(options.duration).toBe(UNDO_MS);
    expect(UNDO_MS).toBe(5000);
    expect(options.description).toBe("detail");
    expect(options.action.label).toBe("Undo");
  });

  it("runs the undo once, however often the button is hit", () => {
    const onUndo = vi.fn();
    undoToast("Task deleted", onUndo);
    const { action } = toastMock.mock.calls[0][1];
    action.onClick();
    action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
