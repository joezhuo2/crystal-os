import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast, useToast } from "./use-toast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes a dismissed toast within a second", () => {
    const { result } = renderHook(() => useToast());

    let id = "";
    act(() => {
      id = toast({ title: "Saved" }).id;
    });
    expect(result.current.toasts.map((t) => t.id)).toEqual([id]);

    act(() => result.current.dismiss(id));
    // Still mounted so the close animation can play.
    expect(result.current.toasts[0]?.open).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.toasts).toEqual([]);
  });
});
