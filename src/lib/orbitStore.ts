/**
 * The Orbit's per-device state, in localStorage: the auto-export setting,
 * which reviews have been seen (the ready badge), announced (the ready
 * toast) and auto-exported. Every change applies at once; blocked storage only means
 * nothing is remembered past this session.
 */

import { useSyncExternalStore } from "react";
import { REVIEW_KINDS, type ReviewKind } from "@/lib/orbitReview";
import { DEFAULT_MOOD_LABELS, MOODS, MOOD_TAGS, type Mood } from "@/lib/dailyNote";

const AUTO_EXPORT_KEY = "crystal-os-orbit-auto-export";
const SEEN_KEY = "crystal-os-orbit-seen";
const EXPORTED_KEY = "crystal-os-orbit-auto-exported";
const NOTIFIED_KEY = "crystal-os-orbit-notified";
const VIEW_KEY = "crystal-os-orbit-view";
const MOOD_LABELS_KEY = "crystal-os-orbit-mood-labels";
const MOOD_TAGS_KEY = "crystal-os-orbit-mood-tags";
const AUTO_SAVE_KEY = "crystal-os-orbit-auto-save-daily";

type ByKind = Partial<Record<ReviewKind, string>>;

/**
 * Where the next visit to The Orbit should open, set by the Home card just
 * before it navigates: this week so far, or the Today card. Not persisted.
 */
export type OrbitLanding = "current" | "today" | null;

export interface OrbitState {
  autoExport: boolean;
  /** Newest period key opened on The Orbit, per kind. */
  seen: ByKind;
  /** Newest period key auto-export has handled, per kind. */
  autoExported: ByKind;
  /** Newest period key the ready toast has announced, per kind. */
  notified: ByKind;
  /** The Weekly/Monthly/Yearly switch, remembered. */
  view: ReviewKind;
  landing: OrbitLanding;
  moodLabels: Record<Mood, string>;
  moodTags: string[];
  /** Saves an unsaved Today entry to its daily note once its day is over. */
  autoSaveDaily: boolean;
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
    for (const kind of REVIEW_KINDS) if (typeof parsed?.[kind] === "string") out[kind] = parsed[kind];
    return out;
  } catch {
    return {};
  }
}

function readMoodLabels(): Record<Mood, string> {
  try {
    const parsed = JSON.parse(read(MOOD_LABELS_KEY) ?? "{}");
    const out = { ...DEFAULT_MOOD_LABELS };
    for (const mood of MOODS) if (typeof parsed?.[mood] === "string" && parsed[mood].trim()) out[mood] = parsed[mood];
    return out;
  } catch {
    return { ...DEFAULT_MOOD_LABELS };
  }
}

function readMoodTags(): string[] {
  try {
    const parsed = JSON.parse(read(MOOD_TAGS_KEY) ?? "null");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [...MOOD_TAGS];
  } catch {
    return [...MOOD_TAGS];
  }
}

function load(): OrbitState {
  return {
    autoExport: read(AUTO_EXPORT_KEY) === "1",
    seen: readByKind(SEEN_KEY),
    autoExported: readByKind(EXPORTED_KEY),
    notified: readByKind(NOTIFIED_KEY),
    view: REVIEW_KINDS.find((kind) => kind === read(VIEW_KEY)) ?? "weekly",
    landing: null,
    moodLabels: readMoodLabels(),
    moodTags: readMoodTags(),
    autoSaveDaily: read(AUTO_SAVE_KEY) === "1",
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

  /** Records that these periods' ready toast has been shown. */
  markNotified(periods: readonly { kind: ReviewKind; key: string }[]) {
    if (periods.length === 0) return;
    const notified = { ...state.notified };
    for (const { kind, key } of periods) notified[kind] = key;
    write(NOTIFIED_KEY, JSON.stringify(notified));
    set({ ...state, notified });
  },

  setView(view: ReviewKind) {
    write(VIEW_KEY, view);
    set({ ...state, view });
  },

  setMoodLabels(moodLabels: Record<Mood, string>) {
    write(MOOD_LABELS_KEY, JSON.stringify(moodLabels));
    set({ ...state, moodLabels });
  },

  setMoodTags(moodTags: string[]) {
    write(MOOD_TAGS_KEY, JSON.stringify(moodTags));
    set({ ...state, moodTags });
  },

  setAutoSaveDaily(on: boolean) {
    write(AUTO_SAVE_KEY, on ? "1" : "0");
    set({ ...state, autoSaveDaily: on });
  },

  land(landing: OrbitLanding) {
    if (state.landing === landing) return;
    set({ ...state, landing });
  },

  /** Test hook: reread storage. */
  _reload() {
    set(load());
  },
};

export function useOrbitStore(): OrbitState {
  return useSyncExternalStore(orbitStore.subscribe, orbitStore.getState);
}
