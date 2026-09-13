import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BREAK, DEFAULT_WORK, formatClock, pomodoro } from "./pomodoro";

beforeEach(() => {
  vi.useFakeTimers();
  pomodoro._reset();
});

afterEach(() => {
  pomodoro._reset();
  vi.useRealTimers();
});

describe("pomodoro store", () => {
  it("starts as a paused 25-minute focus phase", () => {
    expect(pomodoro.getState()).toMatchObject({ phase: "focus", running: false, remaining: DEFAULT_WORK });
  });

  it("counts down from a wall-clock deadline", () => {
    pomodoro.start();
    vi.advanceTimersByTime(10_000);
    expect(pomodoro.getState()).toMatchObject({ running: true, remaining: DEFAULT_WORK - 10 });
  });

  it("pause keeps the time left and start resumes from it", () => {
    pomodoro.start();
    vi.advanceTimersByTime(3_000);
    pomodoro.pause();
    vi.advanceTimersByTime(60_000);
    expect(pomodoro.getState()).toMatchObject({ running: false, remaining: DEFAULT_WORK - 3 });

    pomodoro.toggle();
    vi.advanceTimersByTime(2_000);
    expect(pomodoro.getState().remaining).toBe(DEFAULT_WORK - 5);
  });

  it("flips to a paused break when focus ends", () => {
    pomodoro.start();
    vi.advanceTimersByTime(DEFAULT_WORK * 1000);
    expect(pomodoro.getState()).toMatchObject({ phase: "break", running: false, remaining: DEFAULT_BREAK });
  });

  it("reset restores the current phase's full length", () => {
    pomodoro.start();
    vi.advanceTimersByTime(90_000);
    pomodoro.reset();
    expect(pomodoro.getState()).toMatchObject({ running: false, remaining: DEFAULT_WORK });
  });

  it("setDuration changes the current phase and is ignored while running", () => {
    pomodoro.setDuration(600);
    expect(pomodoro.getState()).toMatchObject({ workDuration: 600, remaining: 600 });

    pomodoro.start();
    pomodoro.setDuration(60);
    expect(pomodoro.getState().workDuration).toBe(600);
  });

  it("notifies subscribers once per visible second, not per poll", () => {
    const listener = vi.fn();
    const unsubscribe = pomodoro.subscribe(listener);
    pomodoro.start();
    listener.mockClear();
    vi.advanceTimersByTime(3_000);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(1500)).toBe("25:00");
    expect(formatClock(65)).toBe("01:05");
  });
});
