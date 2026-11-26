import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onBackdropFpsChange, startFrameLoop } from "./frameLoop";

const perf = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return { scale: 1, listeners, notify: () => listeners.forEach((l) => l()) };
});

vi.mock("@/lib/perfSettings", () => ({
  backdropFps: (base: number) => Math.max(1, Math.round(base * perf.scale)),
  perfSettings: {
    subscribe: (l: () => void) => {
      perf.listeners.add(l);
      return () => perf.listeners.delete(l);
    },
  },
}));

// Fake timers drive requestAnimationFrame at a 16 ms refresh.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startFrameLoop", () => {
  it("draws at the capped rate", () => {
    const onFrame = vi.fn();
    const stop = startFrameLoop(30, onFrame);
    vi.advanceTimersByTime(1000);
    stop();
    // 33 ms frames rounded to a 16 ms refresh: one draw every other refresh.
    expect(onFrame.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(onFrame.mock.calls.length).toBeLessThanOrEqual(31);
  });

  it("sleeps between frames instead of waking every refresh", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const stop = startFrameLoop(12, () => undefined);
    vi.advanceTimersByTime(1000);
    stop();
    // A refresh-rate loop would ask for about 60 frames in a second.
    expect(raf.mock.calls.length).toBeLessThanOrEqual(26);
  });

  it("stops scheduling once stopped, even from inside a frame", () => {
    let stop: () => void = () => undefined;
    const onFrame = vi.fn(() => stop());
    stop = startFrameLoop(30, onFrame);
    vi.advanceTimersByTime(500);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("onBackdropFpsChange", () => {
  it("restarts only when the scaled rate changes", () => {
    const restart = vi.fn();
    const off = onBackdropFpsChange(30, restart);
    perf.notify();
    expect(restart).not.toHaveBeenCalled();
    perf.scale = 0.5;
    perf.notify();
    perf.notify();
    expect(restart).toHaveBeenCalledTimes(1);
    off();
    perf.scale = 1;
    perf.notify();
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
