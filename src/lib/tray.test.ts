import { afterEach, describe, expect, it, vi } from "vitest";
import { pomodoro } from "./pomodoro";
import {
  TRAY_POMODORO_EVENT,
  applyTrayPomodoroAction,
  initTrayBridge,
  trayPomodoroView,
} from "./tray";

const { invoke, listen, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (e: { payload: unknown }) => void>();
  return {
    handlers,
    invoke: vi.fn((..._args: unknown[]) => Promise.resolve()),
    listen: vi.fn((name: string, cb: (e: { payload: unknown }) => void) => {
      handlers.set(name, cb);
      return Promise.resolve(() => {
        handlers.delete(name);
      });
    }),
  };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

function setDesktop(on: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (on) w.__TAURI_INTERNALS__ = {};
  else delete w.__TAURI_INTERNALS__;
}

afterEach(() => {
  setDesktop(false);
  pomodoro._reset();
  invoke.mockClear();
  listen.mockClear();
  handlers.clear();
});

describe("trayPomodoroView", () => {
  it("marks a stopped timer as paused", () => {
    expect(trayPomodoroView(pomodoro.getState())).toEqual({
      label: "Focus 25:00 (paused)",
      tooltip: "Crystal OS · Focus 25:00 (paused)",
      running: false,
    });
  });

  it("shows the live countdown while running", () => {
    const view = trayPomodoroView({ ...pomodoro.getState(), phase: "break", running: true, remaining: 61 });
    expect(view).toEqual({ label: "Break 01:01", tooltip: "Crystal OS · Break 01:01", running: true });
  });
});

describe("applyTrayPomodoroAction", () => {
  it("toggles and resets the store, and ignores anything else", () => {
    applyTrayPomodoroAction("toggle");
    expect(pomodoro.getState().running).toBe(true);
    applyTrayPomodoroAction("reset");
    expect(pomodoro.getState().running).toBe(false);
    applyTrayPomodoroAction("explode");
    expect(pomodoro.getState().running).toBe(false);
  });
});

describe("initTrayBridge", () => {
  it("does nothing on the web", async () => {
    const cleanup = initTrayBridge();
    await vi.dynamicImportSettled();
    expect(invoke).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    cleanup();
  });

  it("pushes store changes to Rust and applies tray events", async () => {
    setDesktop(true);
    const cleanup = initTrayBridge();
    await vi.waitFor(() => expect(handlers.has(TRAY_POMODORO_EVENT)).toBe(true));

    expect(invoke).toHaveBeenLastCalledWith("update_tray_pomodoro", {
      view: expect.objectContaining({ running: false }),
    });

    handlers.get(TRAY_POMODORO_EVENT)!({ payload: "toggle" });
    expect(pomodoro.getState().running).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith("update_tray_pomodoro", {
      view: expect.objectContaining({ running: true, label: "Focus 25:00" }),
    });

    cleanup();
    expect(handlers.has(TRAY_POMODORO_EVENT)).toBe(false);
  });
});
