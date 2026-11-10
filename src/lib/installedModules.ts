/**
 * Which modules are installed on this device. Stored as the list of
 * uninstalled ids, so modules added in later versions arrive installed.
 * Uninstalling keeps the module's data; installing it again brings it back.
 */

import { useSyncExternalStore } from "react";
import { MODULES, isModuleId, moduleById, type TabId } from "@/modules/registry";

export const INSTALLED_MODULES_KEY = "crystal-os-modules";

export interface InstalledModules {
  uninstalled: TabId[];
}

const removable = (id: TabId) => !moduleById[id].core;

export function parseInstalledModules(raw: string | null): InstalledModules {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const list = data && typeof data === "object" ? (data as Record<string, unknown>).uninstalled : null;
  const ids = Array.isArray(list) ? list.filter(isModuleId).filter(removable) : [];
  return { uninstalled: [...new Set(ids)] };
}

function load(): InstalledModules {
  try {
    return parseInstalledModules(localStorage.getItem(INSTALLED_MODULES_KEY));
  } catch {
    return parseInstalledModules(null);
  }
}

let state: InstalledModules = load();
const listeners = new Set<() => void>();

function set(next: InstalledModules) {
  state = next;
  try {
    localStorage.setItem(INSTALLED_MODULES_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

export const installedModules = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  isInstalled: (id: TabId) => !state.uninstalled.includes(id),

  install(id: TabId) {
    if (!state.uninstalled.includes(id)) return;
    set({ uninstalled: state.uninstalled.filter((t) => t !== id) });
  },

  uninstall(id: TabId) {
    if (!removable(id) || state.uninstalled.includes(id)) return;
    set({ uninstalled: [...state.uninstalled, id] });
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export const isInstalled = installedModules.isInstalled;

export function useInstalledModules() {
  return useSyncExternalStore(installedModules.subscribe, installedModules.getState);
}

/** Re-renders when `id` is installed or uninstalled. */
export function useIsInstalled(id: TabId) {
  return !useInstalledModules().uninstalled.includes(id);
}

export const installedModuleList = (s: InstalledModules = state) => MODULES.filter((m) => !s.uninstalled.includes(m.id));
