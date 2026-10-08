import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPLETION_HOLD_MS, REOPEN_HOLD_MS, useCompletionHold } from "./useCompletionHold";

const setup = (completed: boolean, still = false) => {
  const complete = vi.fn();
  const reopen = vi.fn();
  const hook = renderHook((props: { completed: boolean; still: boolean }) => useCompletionHold({ ...props, complete, reopen }), {
    initialProps: { completed, still },
  });
  return { ...hook, complete, reopen };
};

describe("useCompletionHold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the task done at once and saves it after the hold", () => {
    const { result, complete } = setup(false);
    act(() => result.current.toggle());
    expect(result.current.done).toBe(true);
    expect(complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(false);
  });

  it("cancels on a second click during the hold, saving nothing", () => {
    const { result, complete, reopen } = setup(false);
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.done).toBe(false);
    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS * 2));
    expect(complete).not.toHaveBeenCalled();
    expect(reopen).not.toHaveBeenCalled();
  });

  it("saves at once if the card unmounts during the hold", () => {
    const { result, complete, unmount } = setup(false);
    act(() => result.current.toggle());
    unmount();
    expect(complete).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("saves at once with no hold when still (performance mode or reduced motion)", () => {
    const { result, complete } = setup(false, true);
    act(() => result.current.toggle());
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(false);
  });

  it("shows a reopened task open at once and saves it after the shorter hold", () => {
    const { result, reopen, complete } = setup(true);
    expect(result.current.done).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.done).toBe(false);
    expect(reopen).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(REOPEN_HOLD_MS));
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
  });

  it("reopens at once when still", () => {
    const { result, reopen } = setup(true, true);
    act(() => result.current.toggle());
    expect(reopen).toHaveBeenCalledTimes(1);
  });
});
