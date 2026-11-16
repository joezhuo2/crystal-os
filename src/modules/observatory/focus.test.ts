import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
const appendFocus = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock("./focusLog", () => ({ appendFocus: (...a: unknown[]) => appendFocus(...a) }));

const { pomodoro } = await import("@/lib/pomodoro");
const settings = await import("./settings");
const { _resetFocus, checkIdle, focusTopic, releaseFocus, requestFocus } = await import("./focus");

const chain = { code: "MATH117", slug: "chain-rule", title: "Chain rule" };
const limits = { code: "MATH117", slug: "limits", title: "Limits" };

beforeEach(() => {
  pomodoro._reset();
  _resetFocus();
  toast.mockClear();
  appendFocus.mockClear();
  settings.setObservatoryFlag("focusAsk", false);
  settings.setObservatoryFlag("focusAutoStop", true);
  settings.setObservatoryFlag("focusOnTopic", true);
});

describe("Observatory focus", () => {
  it("starts focus on a topic with an Undo toast, retargets it, and pauses it on release", () => {
    requestFocus("topic", chain);
    expect(pomodoro.getState()).toMatchObject({ running: true, task: { id: "topic:MATH117/chain-rule", title: "Chain rule (MATH117)" } });
    expect(toast).toHaveBeenCalledWith("Focus started on Chain rule", expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }));
    requestFocus("topic", limits);
    expect(pomodoro.getState().task?.id).toBe("topic:MATH117/limits");
    releaseFocus();
    expect(pomodoro.getState().running).toBe(false);
  });

  it("asks first when set to, and starts only on Start", () => {
    settings.setObservatoryFlag("focusAsk", true);
    requestFocus("topic", chain);
    expect(pomodoro.getState().running).toBe(false);
    const opts = toast.mock.calls[0]![1] as { action: { onClick: () => void } };
    opts.action.onClick();
    expect(pomodoro.getState().running).toBe(true);
  });

  it("never pauses or retargets a Pomodoro started by hand", () => {
    pomodoro.setTask({ id: "task-1", title: "Essay" });
    pomodoro.start();
    requestFocus("topic", chain);
    expect(pomodoro.getState().task?.id).toBe("task-1");
    expect(toast).toHaveBeenCalledWith("Focus is running on Essay", expect.anything());
    releaseFocus();
    expect(pomodoro.getState().running).toBe(true);
  });

  it("uses the topic's linked task and stops after the idle timeout", () => {
    requestFocus("topic", { ...chain, taskId: "task-9" });
    expect(pomodoro.getState().task?.id).toBe("task-9");
    checkIdle(Date.now() + 4 * 60_000);
    expect(pomodoro.getState().running).toBe(true);
    checkIdle(Date.now() + 6 * 60_000);
    expect(pomodoro.getState().running).toBe(false);
  });

  it("does nothing when the trigger is switched off", () => {
    settings.setObservatoryFlag("focusOnTopic", false);
    requestFocus("topic", chain);
    expect(pomodoro.getState().running).toBe(false);
  });

  it("logs minutes to the topic when focus picked by hand is paused, and for a linked task too", () => {
    focusTopic(chain);
    pomodoro.start();
    vi.useFakeTimers({ now: Date.now() });
    vi.advanceTimersByTime(5 * 60_000);
    pomodoro.pause();
    pomodoro.reset();
    vi.useRealTimers();
    expect(appendFocus).toHaveBeenCalledTimes(1);
    expect(appendFocus).toHaveBeenCalledWith(expect.any(String), "MATH117", expect.objectContaining({ topic: "chain-rule" }));
  });

  it("does not log focus on an ordinary task", () => {
    pomodoro.setTask({ id: "task-1", title: "Essay" });
    pomodoro.start();
    pomodoro.setTask(null);
    expect(appendFocus).not.toHaveBeenCalled();
  });
});
