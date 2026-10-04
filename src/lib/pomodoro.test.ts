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

  it("wakes once a second, when the shown second changes", () => {
    pomodoro.start();
    expect(vi.getTimerCount()).toBe(1);
    const started = Date.now();
    for (let i = 1; i <= 3; i++) {
      vi.advanceTimersToNextTimer();
      expect(Date.now() - started).toBe(i * 1000);
      expect(pomodoro.getState().remaining).toBe(DEFAULT_WORK - i);
    }
    expect(vi.getTimerCount()).toBe(1);
  });

  it("realigns to the deadline after a late wake-up", () => {
    pomodoro.start();
    const started = Date.now();
    // A throttled timer fires 300 ms late; the next one must land back on the second.
    vi.setSystemTime(started + 1300);
    vi.advanceTimersToNextTimer();
    expect(pomodoro.getState().remaining).toBe(DEFAULT_WORK - 2);
    vi.advanceTimersToNextTimer();
    expect((Date.now() - started) % 1000).toBe(0);
  });

  it("stops waking once paused", () => {
    pomodoro.start();
    pomodoro.pause();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("focus sessions", () => {
  afterEach(() => pomodoro.setRecorder(null));

  it("logs a finished focus phase once, without the paused time", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.start();
    vi.advanceTimersByTime(60_000);
    pomodoro.pause();
    vi.advanceTimersByTime(300_000);
    pomodoro.start();
    vi.advanceTimersByTime((DEFAULT_WORK - 60) * 1000 + 500);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].seconds).toBe(DEFAULT_WORK);
  });

  it("logs the elapsed part of a reset run of a minute or more", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.start();
    vi.advanceTimersByTime(90_000);
    pomodoro.reset();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].seconds).toBe(90);
  });

  it("skips short resets and break phases", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.start();
    vi.advanceTimersByTime(30_000);
    pomodoro.reset();
    expect(record).not.toHaveBeenCalled();

    pomodoro.start();
    vi.advanceTimersByTime(DEFAULT_WORK * 1000 + 500);
    record.mockClear();
    pomodoro.start();
    vi.advanceTimersByTime(120_000);
    pomodoro.reset();
    expect(pomodoro.getState().phase).toBe("break");
    expect(record).not.toHaveBeenCalled();
  });
});

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(1500)).toBe("25:00");
    expect(formatClock(65)).toBe("01:05");
  });
});
