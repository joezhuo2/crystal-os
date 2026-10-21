/**
 * Privacy mode, shared by Settings and src/lib/appActivity.ts, which puts
 * `privacy-mode` on <html> while it is on. index.css then blurs every element
 * marked `data-private`: money amounts, and Archive note names and previews
 * until the note is opened. Persisted in localStorage; on by default.
 */

import { useSyncExternalStore } from "react";

export const PRIVACY_MODE_KEY = "crystal-os-privacy-mode";

/** Anything but a stored "false" is on, so the default holds until it is switched off. */
export function parsePrivacyMode(raw: string | null): boolean {
  return raw !== "false";
}

function load(): boolean {
  try {
    return parsePrivacyMode(localStorage.getItem(PRIVACY_MODE_KEY));
  } catch {
    return true;
  }
}

let state = load();
const listeners = new Set<() => void>();

export const privacySettings = {
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
      localStorage.setItem(PRIVACY_MODE_KEY, String(on));
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

export function usePrivacyMode() {
  return useSyncExternalStore(privacySettings.subscribe, privacySettings.getState);
}
