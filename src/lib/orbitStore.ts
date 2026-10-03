/**
 * The Orbit's per-device state, in localStorage: the auto-export setting,
 * which reviews have been seen (the ready badge), and which have been
 * auto-exported. Every change applies at once; blocked storage only means
 * nothing is remembered past this session.
 */

import { useSyncExternalStore } from "react";
import type { ReviewKind } from "@/lib/orbitReview";

const AUTO_EXPORT_KEY = "crystal-os-orbit-auto-export";
const SEEN_KEY = "crystal-os-orbit-seen";
const EXPORTED_KEY = "crystal-os-orbit-auto-exported";
const VIEW_KEY = "crystal-os-orbit-view";

type ByKind = Partial<Record<ReviewKind, string>>;

export interface OrbitState {
  autoExport: boolean;
  /** Newest period key opened on The Orbit, per kind. */
  seen: ByKind;
  /** Newest period key auto-export has handled, per kind. */
  autoExported: ByKind;
  /** The Weekly/Monthly switch, remembered. */
  view: ReviewKind;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the change still applies for this session.
  }
}

function readByKind(key: string): ByKind {
  try {
    const parsed = JSON.parse(read(key) ?? "{}");
    const out: ByKind = {};
    if (typeof parsed?.weekly === "string") out.weekly = parsed.weekly;
    if (typeof parsed?.monthly === "string") out.monthly = parsed.monthly;
    return out;
  } catch {
    return {};
  }
}

function load(): OrbitState {
  return {
    autoExport: read(AUTO_EXPORT_KEY) === "1",
    seen: readByKind(SEEN_KEY),
    autoExported: readByKind(EXPORTED_KEY),
    view: read(VIEW_KEY) === "monthly" ? "monthly" : "weekly",
  };
}

let state: OrbitState = load();
const listeners = new Set<() => void>();

function set(next: OrbitState) {
  state = next;
  listeners.forEach((l) => l());
}

export const orbitStore = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setAutoExport(on: boolean) {
    write(AUTO_EXPORT_KEY, on ? "1" : "0");
    set({ ...state, autoExport: on });
  },

  markSeen(kind: ReviewKind, key: string) {
    if (state.seen[kind] === key) return;
    const seen = { ...state.seen, [kind]: key };
    write(SEEN_KEY, JSON.stringify(seen));
    set({ ...state, seen });
  },

  markAutoExported(kind: ReviewKind, key: string) {
    const autoExported = { ...state.autoExported, [kind]: key };
    write(EXPORTED_KEY, JSON.stringify(autoExported));
    set({ ...state, autoExported });
  },

  setView(view: ReviewKind) {
    write(VIEW_KEY, view);
    set({ ...state, view });
  },

  /** Test hook: reread storage. */
  _reload() {
    set(load());
  },
};

export function useOrbitStore(): OrbitState {
  return useSyncExternalStore(orbitStore.subscribe, orbitStore.getState);
}
