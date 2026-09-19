/**
 * Whether anyone can see the app, and whether it should animate. Drives the
 * backdrops, CSS animations, and background polling.
 *
 * "Visible" needs both the document to be visible (false when minimised or
 * covered) and the main window not to be hidden in the tray. Rust reports the
 * second with `app://visibility`, because a window hidden with `hide()` does
 * not always mark its document hidden.
 *
 * "Still" is reduced motion: the OS setting, or performance mode.
 */

import { useSyncExternalStore } from "react";
import { focusManager } from "@tanstack/react-query";
import { perfSettings } from "@/lib/perfSettings";
import { isDesktop } from "@/lib/platform";

export const VISIBILITY_EVENT = "app://visibility";

export interface AppActivity {
  visible: boolean;
  still: boolean;
}

let windowShown = true;
const listeners = new Set<() => void>();

const osReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function compute(): AppActivity {
  return {
    visible: windowShown && (typeof document === "undefined" || !document.hidden),
    still: osReducedMotion() || perfSettings.getState().performanceMode,
  };
}

let state = compute();

function update() {
  const next = compute();
  if (next.visible === state.visible && next.still === state.still) return;
  state = next;
  listeners.forEach((l) => l());
}

export const appActivity = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Test hook. */
  _setWindowShown(shown: boolean) {
    windowShown = shown;
    update();
  },
};

export function useAppActivity() {
  return useSyncExternalStore(appActivity.subscribe, appActivity.getState);
}

let started = false;

/**
 * Starts tracking, once. Also:
 * - puts `app-hidden` / `perf-still` on <html>, which pause or stop CSS
 *   animations (index.css);
 * - tells React Query the app is unfocused while hidden, which stops
 *   `refetchInterval` polling and refetches stale data on return.
 */
export function startAppActivity() {
  if (started || typeof document === "undefined") return;
  started = true;

  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle("app-hidden", !state.visible);
    root.classList.toggle("perf-still", perfSettings.getState().performanceMode);
  };
  appActivity.subscribe(apply);
  perfSettings.subscribe(() => {
    update();
    apply();
  });
  apply();

  document.addEventListener("visibilitychange", update);
  window.matchMedia?.("(prefers-reduced-motion: reduce)").addEventListener?.("change", update);

  focusManager.setEventListener((setFocused) => {
    const sync = () => setFocused(state.visible);
    return appActivity.subscribe(sync);
  });

  if (isDesktop()) {
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<boolean>(VISIBILITY_EVENT, ({ payload }) => {
          windowShown = payload;
          update();
        }),
      )
      .catch((err) => console.warn("[activity] could not track window visibility", err));
    // A launch at login starts hidden in the tray, before any event is sent.
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().isVisible())
      .then((shown) => {
        windowShown = shown;
        update();
      })
      .catch(() => undefined);
  }
}
