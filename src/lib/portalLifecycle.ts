/**
 * Unloads Portal apps that have "Keep loaded in background" turned off.
 *
 * An app counts as on screen while the Portal tab is open and it is the
 * active app. Menus and dialogs that briefly hide the webview do not count,
 * so opening a context menu never starts the countdown. Every other loaded
 * app with the setting off gets a timer of `unloadDelay` seconds; when it
 * fires, the app's webview is closed.
 *
 * The timer is re-checked against the latest state when it fires, and the
 * close itself is queued behind any show already issued (see portalNative),
 * with Rust refusing to close the app on screen. Opening an app just as its
 * timer fires therefore either keeps it or reloads it, never leaves it blank.
 */

import type { PortalApp } from "@/lib/portalApps";

export interface UnloaderDeps {
  getApps: () => PortalApp[];
  /** Seconds. */
  getDelay: () => number;
  /** Resolves true when the webview was closed. */
  unload: (id: string) => Promise<boolean>;
  /** Called after an app was unloaded, e.g. to drop its stale badge. */
  onUnloaded?: (id: string) => void;
}

export function createPortalUnloader(deps: UnloaderDeps) {
  const loaded = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let viewing: string | null = null;

  const cancel = (id: string) => {
    const timer = timers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(id);
  };

  const shouldUnload = (id: string) => {
    const app = deps.getApps().find((a) => a.id === id);
    return !!app && app.keepLoaded === false && id !== viewing && loaded.has(id);
  };

  const fire = (id: string) => {
    timers.delete(id);
    if (!shouldUnload(id)) return;
    deps
      .unload(id)
      .then((closed) => {
        if (!closed) return;
        // A show queued after the close may already have reloaded it.
        if (id !== viewing) loaded.delete(id);
        deps.onUnloaded?.(id);
      })
      .catch((err) => console.warn(`[portal] could not unload ${id}`, err));
  };

  /** Starts or stops timers to match the current apps, settings, and view. */
  const sync = () => {
    const ids = new Set(deps.getApps().map((a) => a.id));
    for (const id of [...loaded]) {
      if (!ids.has(id)) {
        loaded.delete(id);
        cancel(id);
      }
    }
    for (const id of loaded) {
      if (!shouldUnload(id)) cancel(id);
      else if (!timers.has(id)) timers.set(id, setTimeout(() => fire(id), deps.getDelay() * 1000));
    }
  };

  return {
    sync,

    /** Records that the app's webview exists (a show succeeded). */
    markLoaded(id: string) {
      loaded.add(id);
      sync();
    },

    /** The app on screen, or null when the Portal tab is closed. */
    setViewing(id: string | null) {
      if (id === viewing) return;
      viewing = id;
      sync();
    },

    /** Restarts every countdown, for when the delay changes. */
    restart() {
      for (const id of [...timers.keys()]) cancel(id);
      sync();
    },

    /** Test hooks. */
    _pending: () => [...timers.keys()],
    _loaded: () => [...loaded],
  };
}

export type PortalUnloader = ReturnType<typeof createPortalUnloader>;
