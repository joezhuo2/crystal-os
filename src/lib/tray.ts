/**
 * Webview half of the desktop tray (src-tauri/src/tray.rs).
 *
 * Tray clicks arrive as Tauri events and are applied to the Pomodoro store;
 * store changes are pushed back to Rust so the tray tooltip and menu stay
 * live. Like platform.ts, nothing from `@tauri-apps/*` is imported at module
 * level, so the web bundle carries none of this.
 */

import { isDesktop } from "@/lib/platform";
import { formatClock, pomodoro, type PomodoroState } from "@/lib/pomodoro";

/** Emitted by Rust with "toggle" or "reset" when a Pomodoro item is clicked. */
export const TRAY_POMODORO_EVENT = "tray://pomodoro";
/** Emitted by Rust after showing the window from "Quick Add…". */
export const TRAY_QUICK_ADD_EVENT = "tray://quick-add";

/** Mirrors `PomodoroView` in src-tauri/src/tray.rs. */
export interface TrayPomodoroView {
  /** Disabled status row at the top of the Pomodoro section. */
  label: string;
  tooltip: string;
  running: boolean;
}

export function trayPomodoroView(s: PomodoroState): TrayPomodoroView {
  const phase = s.phase === "focus" ? "Focus" : "Break";
  const clock = formatClock(s.remaining);
  const status = s.running ? `${phase} ${clock}` : `${phase} ${clock} (paused)`;
  return {
    label: status,
    tooltip: `Crystal OS · ${status}`,
    running: s.running,
  };
}

export function applyTrayPomodoroAction(action: unknown) {
  if (action === "toggle") pomodoro.toggle();
  else if (action === "reset") pomodoro.reset();
}

/**
 * Wire the tray to the Pomodoro store for the life of the page. Returns a
 * cleanup function; a no-op on the web.
 */
export function initTrayBridge(): () => void {
  if (!isDesktop()) return () => {};

  let cancelled = false;
  const cleanups: Array<() => void> = [];
  let lastSent = "";

  void (async () => {
    const [{ invoke }, { listen }] = await Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/api/event"),
    ]);
    if (cancelled) return;

    const push = () => {
      const view = trayPomodoroView(pomodoro.getState());
      const key = JSON.stringify(view);
      // The store also emits for changes the tray does not show.
      if (key === lastSent) return;
      lastSent = key;
      invoke("update_tray_pomodoro", { view }).catch((err) =>
        console.warn("[crystal-os] tray update failed:", err),
      );
    };

    cleanups.push(pomodoro.subscribe(push));
    push();

    const unlisten = await listen(TRAY_POMODORO_EVENT, (e) => applyTrayPomodoroAction(e.payload));
    if (cancelled) unlisten();
    else cleanups.push(unlisten);
  })();

  return () => {
    cancelled = true;
    cleanups.forEach((fn) => fn());
  };
}
