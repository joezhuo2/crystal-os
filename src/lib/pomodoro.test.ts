import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BREAK, DEFAULT_WORK, formatClock, pomodoro, selectFocusMuted } from "./pomodoro";

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

describe("linked task", () => {
  afterEach(() => pomodoro.setRecorder(null));
  const a = { id: "a", title: "Write report" };
  const b = { id: "b", title: "Review PR" };

  it("starts unlinked and holds the chosen task", () => {
    expect(pomodoro.getState().task).toBeNull();
    pomodoro.setTask(a);
    expect(pomodoro.getState().task).toEqual(a);
    pomodoro.setTask(null);
    expect(pomodoro.getState().task).toBeNull();
  });

  it("logs a finished run against the linked task", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(DEFAULT_WORK * 1000 + 500);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ seconds: DEFAULT_WORK, taskId: "a", taskTitle: "Write report" });
  });

  it("logs unlinked runs with no task", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.start();
    vi.advanceTimersByTime(90_000);
    pomodoro.reset();
    expect(record.mock.calls[0][0]).toMatchObject({ taskId: null, taskTitle: null });
  });

  it("splits a running session when the task changes", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(120_000);
    pomodoro.setTask(b);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ seconds: 120, taskId: "a" });
    expect(pomodoro.getState().running).toBe(true);

    vi.advanceTimersByTime((DEFAULT_WORK - 120) * 1000 + 500);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1][0]).toMatchObject({ seconds: DEFAULT_WORK - 120, taskId: "b" });
  });

  it("splits a paused session too, without logging the pause", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(90_000);
    pomodoro.pause();
    vi.advanceTimersByTime(600_000);
    pomodoro.setTask(b);
    expect(record.mock.calls[0][0]).toMatchObject({ seconds: 90, taskId: "a" });
    pomodoro.start();
    vi.advanceTimersByTime(60_000);
    pomodoro.reset();
    expect(record.mock.calls[1][0]).toMatchObject({ seconds: 60, taskId: "b" });
  });

  it("drops a short first part when switching under a minute in", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(20_000);
    pomodoro.setTask(b);
    expect(record).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100_000);
    pomodoro.reset();
    expect(record.mock.calls[0][0]).toMatchObject({ seconds: 100, taskId: "b" });
  });

  it("a paused switch followed by a reset does not shorten the next run", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(90_000);
    pomodoro.pause();
    pomodoro.setTask(b);
    pomodoro.reset();
    record.mockClear();
    pomodoro.start();
    vi.advanceTimersByTime(DEFAULT_WORK * 1000 + 500);
    expect(record.mock.calls[0][0]).toMatchObject({ seconds: DEFAULT_WORK, taskId: "b" });
  });

  it("setting the same task again does not split", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(120_000);
    pomodoro.setTask({ ...a });
    expect(record).not.toHaveBeenCalled();
  });

  it("unlinkTask logs the time so far, clears the link and keeps running", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(180_000);
    pomodoro.unlinkTask("a");
    expect(record.mock.calls[0][0]).toMatchObject({ seconds: 180, taskId: "a" });
    expect(pomodoro.getState()).toMatchObject({ task: null, running: true });
  });

  it("unlinkTask ignores other tasks", () => {
    pomodoro.setTask(a);
    pomodoro.unlinkTask("b");
    expect(pomodoro.getState().task).toEqual(a);
  });

  it("renameTask updates the title without splitting", () => {
    const record = vi.fn();
    pomodoro.setRecorder(record);
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(120_000);
    pomodoro.renameTask("a", "Write final report");
    expect(record).not.toHaveBeenCalled();
    expect(pomodoro.getState().task).toEqual({ id: "a", title: "Write final report" });
  });

  it("keeps the link across phases", () => {
    pomodoro.setTask(a);
    pomodoro.start();
    vi.advanceTimersByTime(DEFAULT_WORK * 1000 + 500);
    expect(pomodoro.getState()).toMatchObject({ phase: "break", task: a });
  });
});

describe("focusMuted", () => {
  it("is true only while a focus phase is running", () => {
    expect(selectFocusMuted(pomodoro.getState())).toBe(false);
    pomodoro.start();
    expect(selectFocusMuted(pomodoro.getState())).toBe(true);
    pomodoro.pause();
    expect(selectFocusMuted(pomodoro.getState())).toBe(false);
    pomodoro.start();
    vi.advanceTimersByTime(DEFAULT_WORK * 1000 + 500);
    pomodoro.start();
    expect(pomodoro.getState().phase).toBe("break");
    expect(selectFocusMuted(pomodoro.getState())).toBe(false);
  });
});

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(1500)).toBe("25:00");
    expect(formatClock(65)).toBe("01:05");
  });
});
