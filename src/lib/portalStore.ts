/**
 * Portal tab state as a module-level store, so the sidebar badge, the Settings
 * theme picker, and the page itself share it, and badges keep updating while
 * another tab is open.
 *
 * The connected apps, the last active app, and the theme persist in
 * localStorage. Badges and loaded webviews last for the session only.
 */

import { badgeTotal, parseBadge, parseStoredApps, type PortalApp, type PortalBadge } from "@/lib/portalApps";

export type PortalTheme = "void" | "horizon" | "stargate";

export interface PortalThemeInfo {
  id: PortalTheme;
  name: string;
  description: string;
  /** Background, then the two ring colours, for the Settings preview. */
  swatch: [string, string, string];
}

export const PORTAL_THEMES: PortalThemeInfo[] = [
  {
    id: "void",
    name: "Void swirl",
    description: "Near-black with a slow violet and cyan nebula.",
    swatch: ["#07060d", "#8b5cf6", "#22d3ee"],
  },
  {
    id: "horizon",
    name: "Event horizon",
    description: "Pure black with a pulsing amber accretion ring.",
    swatch: ["#000000", "#f59e0b", "#ea580c"],
  },
  {
    id: "stargate",
    name: "Stargate blue",
    description: "Deep navy with an electric-blue shimmer and faint stars.",
    swatch: ["#030b1f", "#3b82f6", "#7dd3fc"],
  },
];

export const DEFAULT_PORTAL_THEME: PortalTheme = "void";

/**
 * Root class per theme (colours in index.css). Written out in full so
 * Tailwind's content scan keeps the rules: a class built with a template
 * string is purged, which leaves every `--portal-*` variable undefined.
 */
export const PORTAL_THEME_CLASS: Record<PortalTheme, string> = {
  void: "portal-theme-void",
  horizon: "portal-theme-horizon",
  stargate: "portal-theme-stargate",
};

export const APPS_KEY = "crystal-os-portal-apps";
export const ACTIVE_KEY = "crystal-os-portal-active";
export const THEME_KEY = "crystal-os-portal-theme";

export interface PortalState {
  apps: PortalApp[];
  activeId: string | null;
  badges: Record<string, PortalBadge>;
  theme: PortalTheme;
  /**
   * Open overlays (dialogs, menus) that the native webviews would cover.
   * While above zero the page hides the active webview.
   */
  occluders: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the change still applies for this session.
  }
}

function isTheme(value: unknown): value is PortalTheme {
  return PORTAL_THEMES.some((theme) => theme.id === value);
}

function load(): PortalState {
  const apps = parseStoredApps(read(APPS_KEY));
  const active = read(ACTIVE_KEY);
  const theme = read(THEME_KEY);
  return {
    apps,
    activeId: apps.some((app) => app.id === active) ? active : (apps[0]?.id ?? null),
    badges: {},
    theme: isTheme(theme) ? theme : DEFAULT_PORTAL_THEME,
    occluders: 0,
  };
}

let state: PortalState = load();
const listeners = new Set<() => void>();

function set(next: PortalState) {
  state = next;
  listeners.forEach((l) => l());
}

function saveApps(apps: PortalApp[]) {
  // Both flags are left out at their defaults, so apps that never changed them
  // are stored exactly as they were before the settings existed.
  write(
    APPS_KEY,
    JSON.stringify(
      apps.map(({ id, name, url, keepLive, keepLoaded }) => ({
        id,
        name,
        url,
        ...(keepLive ? { keepLive } : {}),
        ...(keepLoaded === false ? { keepLoaded } : {}),
      })),
    ),
  );
}

function saveActive(id: string | null) {
  write(ACTIVE_KEY, id);
}

export const portal = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Connects an app and makes it active. Ignored if the id is already used. */
  add(app: PortalApp) {
    if (state.apps.some((a) => a.id === app.id)) return;
    const apps = [...state.apps, app];
    saveApps(apps);
    saveActive(app.id);
    set({ ...state, apps, activeId: app.id });
  },

  /** Disconnects an app. The next app along (or the previous one) becomes active. */
  remove(id: string) {
    const index = state.apps.findIndex((a) => a.id === id);
    if (index === -1) return;
    const apps = state.apps.filter((a) => a.id !== id);
    let activeId = state.activeId;
    if (activeId === id) activeId = apps[Math.min(index, apps.length - 1)]?.id ?? null;
    const badges = { ...state.badges };
    delete badges[id];
    saveApps(apps);
    saveActive(activeId);
    set({ ...state, apps, activeId, badges });
  },

  /** Applies a new order. Ignored unless it holds exactly the current apps. */
  reorder(ids: string[]) {
    if (ids.length !== state.apps.length) return;
    const byId = new Map(state.apps.map((a) => [a.id, a]));
    const apps = ids.map((id) => byId.get(id));
    if (apps.some((a) => !a) || new Set(ids).size !== ids.length) return;
    const next = apps as PortalApp[];
    if (next.every((a, i) => a === state.apps[i])) return;
    saveApps(next);
    set({ ...state, apps: next });
  },

  setActive(id: string) {
    if (id === state.activeId || !state.apps.some((a) => a.id === id)) return;
    saveActive(id);
    set({ ...state, activeId: id });
  },

  setTheme(theme: PortalTheme) {
    if (!isTheme(theme) || theme === state.theme) return;
    write(THEME_KEY, theme);
    set({ ...state, theme });
  },

  /**
   * Turns "keep live in the background" on or off for one app. The webview
   * reads this when it is built, so an app already loaded keeps its current
   * behaviour until it is reloaded.
   */
  setKeepLive(id: string, keepLive: boolean) {
    const app = state.apps.find((a) => a.id === id);
    if (!app || (app.keepLive ?? false) === keepLive) return;
    const apps = state.apps.map((a) => (a.id === id ? { ...a, keepLive } : a));
    saveApps(apps);
    set({ ...state, apps });
  },

  /**
   * Turns "keep loaded in background" on or off for one app. Off means the
   * app's webview is thrown away once it has been off screen for the unload
   * delay (see portalLifecycle.ts).
   */
  setKeepLoaded(id: string, keepLoaded: boolean) {
    const app = state.apps.find((a) => a.id === id);
    if (!app || (app.keepLoaded ?? true) === keepLoaded) return;
    const apps = state.apps.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a };
      if (keepLoaded) delete next.keepLoaded;
      else next.keepLoaded = false;
      return next;
    });
    saveApps(apps);
    set({ ...state, apps });
  },

  /** Drops an app's badge, for when its webview is unloaded and stops reporting titles. */
  clearBadge(id: string) {
    if (!(id in state.badges)) return;
    const badges = { ...state.badges };
    delete badges[id];
    set({ ...state, badges });
  },

  /** Records a page title change and updates that app's badge. */
  setTitle(id: string, title: string) {
    if (!state.apps.some((a) => a.id === id)) return;
    const badge = parseBadge(title);
    if (state.badges[id] === (badge ?? undefined)) return;
    const badges = { ...state.badges };
    if (badge === null) delete badges[id];
    else badges[id] = badge;
    set({ ...state, badges });
  },

  /** Marks an overlay as open. Call the returned function when it closes. */
  occlude(): () => void {
    set({ ...state, occluders: state.occluders + 1 });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set({ ...state, occluders: Math.max(0, state.occluders - 1) });
    };
  },

  /** Test hook: reload from storage and drop session state. */
  _reset() {
    set(load());
  },
};

/** Badge for the sidebar Portal button: all apps combined. */
export function selectBadgeTotal(s: PortalState): PortalBadge | null {
  return badgeTotal(s.badges);
}
