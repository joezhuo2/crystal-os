import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFrameLoop } from "./frameLoop";

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
