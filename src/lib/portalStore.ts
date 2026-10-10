/**
 * Portal tab state as a module-level store, so the sidebar badge, the Home box
 * and the page itself share it, and badges keep updating while
 * another tab is open.
 *
 * The connected apps and the last active app persist in
 * localStorage. Badges and loaded webviews last for the session only.
 */

import { badgeTotal, parseBadge, parseStoredApps, type PortalApp, type PortalBadge } from "@/lib/portalApps";

export const APPS_KEY = "crystal-os-portal-apps";
export const ACTIVE_KEY = "crystal-os-portal-active";

export interface PortalState {
  apps: PortalApp[];
  activeId: string | null;
  badges: Record<string, PortalBadge>;
  /**
   * Apps whose page has reported a title since it last loaded. The first
   * title carries whatever was already unread, so notifications only count
   * rises after it (src/lib/notifications.ts).
   */
  reported: Record<string, true>;
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

function load(): PortalState {
  const apps = parseStoredApps(read(APPS_KEY));
  const active = read(ACTIVE_KEY);
  return {
    apps,
    activeId: apps.some((app) => app.id === active) ? active : (apps[0]?.id ?? null),
    badges: {},
    reported: {},
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
  // The flags are left out at their defaults, so apps that never changed them
  // are stored exactly as they were before the settings existed.
  write(
    APPS_KEY,
    JSON.stringify(
      apps.map(({ id, name, url, keepLive, keepLoaded, notify }) => ({
        id,
        name,
        url,
        ...(keepLive ? { keepLive } : {}),
        ...(keepLoaded === false ? { keepLoaded } : {}),
        ...(notify === false ? { notify } : {}),
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
    const reported = { ...state.reported };
    delete reported[id];
    saveApps(apps);
    saveActive(activeId);
    set({ ...state, apps, activeId, badges, reported });
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

  /**
   * Turns desktop notifications for one app's unread count on or off. Applies
   * straight away, loaded or not.
   */
  setNotify(id: string, notify: boolean) {
    const app = state.apps.find((a) => a.id === id);
    if (!app || (app.notify ?? true) === notify) return;
    const apps = state.apps.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a };
      if (notify) delete next.notify;
      else next.notify = false;
      return next;
    });
    saveApps(apps);
    set({ ...state, apps });
  },

  /** Drops an app's badge, for when its webview is unloaded and stops reporting titles. */
  clearBadge(id: string) {
    if (!(id in state.badges) && !(id in state.reported)) return;
    const badges = { ...state.badges };
    delete badges[id];
    const reported = { ...state.reported };
    delete reported[id];
    set({ ...state, badges, reported });
  },

  /** Records a page title change and updates that app's badge. */
  setTitle(id: string, title: string) {
    if (!state.apps.some((a) => a.id === id)) return;
    const badge = parseBadge(title);
    const firstReport = !(id in state.reported);
    if (!firstReport && state.badges[id] === (badge ?? undefined)) return;
    const badges = { ...state.badges };
    if (badge === null) delete badges[id];
    else badges[id] = badge;
    const reported = firstReport ? { ...state.reported, [id]: true as const } : state.reported;
    set({ ...state, badges, reported });
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
