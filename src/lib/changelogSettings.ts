/**
 * Whether the "What's new" changelog dialog opens after an update, shared by
 * Settings and src/components/ChangelogNotice.tsx. Persisted in localStorage;
 * off by default.
 */

import { useSyncExternalStore } from "react";

export const SHOW_CHANGELOG_KEY = "crystal-os-show-changelog";

/** Only a stored "true" is on, so the popup stays hidden until it is switched on. */
export function parseShowChangelog(raw: string | null): boolean {
  return raw === "true";
}

function load(): boolean {
  try {
    return parseShowChangelog(localStorage.getItem(SHOW_CHANGELOG_KEY));
  } catch {
    return false;
  }
}

let state = load();
const listeners = new Set<() => void>();

export const changelogSettings = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setEnabled(on: boolean) {
    if (on === state) return;
    state = on;
    try {
      localStorage.setItem(SHOW_CHANGELOG_KEY, String(on));
    } catch {
      // Storage blocked: the change still applies for this session.
    }
    listeners.forEach((l) => l());
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useShowChangelog() {
  return useSyncExternalStore(changelogSettings.subscribe, changelogSettings.getState);
}
