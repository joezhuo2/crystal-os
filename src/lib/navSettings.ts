/**
 * The sidebar's layout: the order of the pages, which are hidden, and which
 * sit in the group pinned to the bottom. Persisted in localStorage as one JSON
 * object, per device; every change applies at once.
 */

import { useSyncExternalStore } from "react";
import type { TabId } from "@/components/layout/Navigation";

export const NAV_SETTINGS_KEY = "crystal-os-nav";

/** Every page, in the default order. */
export const NAV_TABS: readonly TabId[] = [
  "home", "orbit", "tasks", "calendar", "financials", "weather",
  "archive", "nebula", "portal", "terminal", "settings",
];

const DEFAULT_BOTTOM: readonly TabId[] = ["archive", "nebula", "portal", "terminal", "settings"];

/** Settings can move but never hide, or there would be no way back to this switch. */
export const ALWAYS_SHOWN: TabId = "settings";

export interface NavSettings {
  order: TabId[];
  hidden: TabId[];
  /** Pages in the group pinned to the bottom of the sidebar. */
  bottom: TabId[];
}

export const DEFAULT_NAV_SETTINGS: NavSettings = { order: [...NAV_TABS], hidden: [], bottom: [...DEFAULT_BOTTOM] };

const isTab = (v: unknown): v is TabId => NAV_TABS.includes(v as TabId);
const tabList = (v: unknown): TabId[] | null => (Array.isArray(v) ? [...new Set(v.filter(isTab))] : null);

/** Reads stored settings. Unknown pages are dropped; pages missing from the order go back in their default place. */
export function parseNavSettings(raw: string | null): NavSettings {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const stored = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const order = tabList(stored.order) ?? [];
  for (const id of NAV_TABS) {
    if (order.includes(id)) continue;
    const before = NAV_TABS.slice(0, NAV_TABS.indexOf(id)).reverse().find((b) => order.includes(b));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  }
  return {
    order,
    hidden: (tabList(stored.hidden) ?? []).filter((id) => id !== ALWAYS_SHOWN),
    bottom: tabList(stored.bottom) ?? [...DEFAULT_BOTTOM],
  };
}

/** The pages to draw, in order, split into the top and bottom groups. */
export function navLayout(settings: NavSettings, available: (id: TabId) => boolean = () => true) {
  const shown = settings.order.filter((id) => available(id) && !settings.hidden.includes(id));
  return {
    top: shown.filter((id) => !settings.bottom.includes(id)),
    bottom: shown.filter((id) => settings.bottom.includes(id)),
  };
}

/** Swaps `id` with its neighbour in the same group, `delta` places up (−1) or down (1). Unchanged at the ends. */
export function moveTab(settings: NavSettings, id: TabId, delta: -1 | 1): NavSettings {
  const inBottom = settings.bottom.includes(id);
  const group = settings.order.filter((t) => settings.bottom.includes(t) === inBottom);
  const other = group[group.indexOf(id) + delta];
  if (!other) return settings;
  const order = [...settings.order];
  const a = order.indexOf(id);
  const b = order.indexOf(other);
  [order[a], order[b]] = [order[b], order[a]];
  return { ...settings, order };
}

function load(): NavSettings {
  try {
    return parseNavSettings(localStorage.getItem(NAV_SETTINGS_KEY));
  } catch {
    return parseNavSettings(null);
  }
}

let state: NavSettings = load();
const listeners = new Set<() => void>();

function set(next: NavSettings) {
  state = next;
  try {
    localStorage.setItem(NAV_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

const toggle = (list: TabId[], id: TabId, on: boolean) => (on ? [...list.filter((t) => t !== id), id] : list.filter((t) => t !== id));

export const navSettings = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  move(id: TabId, delta: -1 | 1) {
    const next = moveTab(state, id, delta);
    if (next !== state) set(next);
  },

  setHidden(id: TabId, hidden: boolean) {
    if (id === ALWAYS_SHOWN || state.hidden.includes(id) === hidden) return;
    set({ ...state, hidden: toggle(state.hidden, id, hidden) });
  },

  /** Moves a page to the bottom group (true) or the top one, keeping its place in the order. */
  setBottom(id: TabId, bottom: boolean) {
    if (state.bottom.includes(id) === bottom) return;
    set({ ...state, bottom: toggle(state.bottom, id, bottom) });
  },

  reset() {
    set(parseNavSettings(null));
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useNavSettings() {
  return useSyncExternalStore(navSettings.subscribe, navSettings.getState);
}
