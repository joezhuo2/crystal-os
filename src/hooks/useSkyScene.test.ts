import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useWeather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useWeather")>()),
  useWeather: () => ({ data: undefined }),
}));
vi.mock("@/lib/atmosphereStore", () => ({ useAtmosphere: () => ({ cityId: "on-143" }) }));

import { useSkyScene } from "./useSkyScene";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 1, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSkyScene", () => {
  it("re-renders only when the phase changes, not every minute", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSkyScene();
    });
    expect(result.current.phase).toBe("day");
    const before = renders;
    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });
    expect(renders).toBe(before);
    act(() => {
      vi.advanceTimersByTime(7 * 60 * 60_000);
    });
    expect(result.current.phase).toBe("dusk");
    expect(renders).toBe(before + 1);
  });
});
