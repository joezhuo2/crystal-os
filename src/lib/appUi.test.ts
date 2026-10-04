import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { appUi, useAppUi } from "./appUi";

afterEach(() => appUi.reset());

describe("appUi", () => {
  it("re-renders a reader only when its own field changes", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useAppUi((s) => s.showQuickAdd);
    });
    expect(result.current).toBe(false);
    const before = renders;

    act(() => appUi.setQuickAddDraft("milk"));
    act(() => appUi.setShowTaskForm(true));
    expect(renders).toBe(before);

    act(() => appUi.setShowQuickAdd(true));
    expect(result.current).toBe(true);
    expect(renders).toBe(before + 1);
  });

  it("ignores a write of the current value", () => {
    const state = appUi.getState();
    appUi.setShowEventForm(false);
    expect(appUi.getState()).toBe(state);
  });

  it("reset closes everything", () => {
    appUi.setShowTransactionForm(true);
    appUi.setSelectedNotePath("a.md");
    appUi.reset();
    expect(appUi.getState().showTransactionForm).toBe(false);
    expect(appUi.getState().selectedNotePath).toBeNull();
  });
});
