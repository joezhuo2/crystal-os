import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_UNLOAD_DELAY, MAX_UNLOAD_DELAY, PERF_MODE_KEY, UNLOAD_DELAY_KEY, clampUnloadDelay, perfSettings } from "./perfSettings";

beforeEach(() => {
  localStorage.clear();
  perfSettings._reset();
});

describe("perf settings", () => {
  it("defaults to performance mode off and a 60 s unload delay", () => {
    expect(perfSettings.getState()).toEqual({ performanceMode: false, unloadDelay: DEFAULT_UNLOAD_DELAY });
  });

  it("persists both settings across a reload", () => {
    perfSettings.setPerformanceMode(true);
    perfSettings.setUnloadDelay("300");
    expect(localStorage.getItem(PERF_MODE_KEY)).toBe("1");
    expect(localStorage.getItem(UNLOAD_DELAY_KEY)).toBe("300");
    perfSettings._reset();
    expect(perfSettings.getState()).toEqual({ performanceMode: true, unloadDelay: 300 });
  });

  it("clamps the delay to whole seconds in range", () => {
    expect(clampUnloadDelay(-5)).toBe(0);
    expect(clampUnloadDelay(0)).toBe(0);
    expect(clampUnloadDelay(12.6)).toBe(13);
    expect(clampUnloadDelay(99999)).toBe(MAX_UNLOAD_DELAY);
    expect(clampUnloadDelay("abc")).toBe(DEFAULT_UNLOAD_DELAY);
    expect(clampUnloadDelay("")).toBe(DEFAULT_UNLOAD_DELAY);
  });

  it("falls back to the default when storage holds garbage", () => {
    localStorage.setItem(UNLOAD_DELAY_KEY, "soon");
    perfSettings._reset();
    expect(perfSettings.getState().unloadDelay).toBe(DEFAULT_UNLOAD_DELAY);
  });

  it("notifies subscribers only on real changes", () => {
    let calls = 0;
    const off = perfSettings.subscribe(() => calls++);
    perfSettings.setPerformanceMode(false);
    perfSettings.setUnloadDelay(60);
    expect(calls).toBe(0);
    perfSettings.setPerformanceMode(true);
    expect(calls).toBe(1);
    off();
  });
});
