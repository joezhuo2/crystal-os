/**
 * Webview side of the Portal tab. The app webviews live in Rust
 * (src-tauri/src/portal.rs); this module tells Rust which one to show and
 * where. Desktop only: nothing from `@tauri-apps/*` loads until a function
 * here is called.
 */

import type { PortalApp } from "@/lib/portalApps";

/** Mirrors `Bounds` in src-tauri/src/portal.rs. CSS pixels in the main window. */
export interface PortalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PortalNavAction = "back" | "forward" | "reload" | "home";

/** A page title changed. Titles carry unread counts, e.g. `(3) Discord`. */
export interface PortalTitleEvent {
  id: string;
  title: string;
}

export const PORTAL_TITLE_EVENT = "portal://title";

/** A tab shortcut pressed while an app page had keyboard focus. */
export type PortalShortcut = "next" | "previous" | "close" | "reload";

export const PORTAL_SHORTCUT_EVENT = "portal://shortcut";

let tauriCore: Promise<typeof import("@tauri-apps/api/core")> | undefined;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  tauriCore ??= import("@tauri-apps/api/core");
  const core = await tauriCore;
  try {
    return await core.invoke<T>(cmd, args);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Show and hide run strictly in call order. Otherwise a slow `portal_show`
 * (the first one creates the webview) could finish after a later hide and put
 * the webview back over a dialog.
 */
let visibility: Promise<unknown> = Promise.resolve();

function inOrder<T>(run: () => Promise<T>): Promise<T> {
  const next = visibility.then(run, run);
  visibility = next.catch(() => undefined);
  return next;
}

/**
 * Shows `app` at `bounds`, loading it on first use, and hides the others.
 * Pass `fade: false` when a snapshot of the page is already on screen.
 */
export function showPortalApp(app: PortalApp, bounds: PortalBounds, fade = true) {
  return inOrder(() =>
    invoke<void>("portal_show", { id: app.id, url: app.url, bounds, fade, keepLive: app.keepLive === true }),
  );
}

/** Hides every app webview. They keep running in the background. */
export function hidePortal() {
  return inOrder(() => invoke<void>("portal_hide"));
}

/**
 * Captures the app on screen, then hides every app webview. Resolves to an
 * object URL of the picture (the caller revokes it), or null when there was
 * nothing to capture. Used when a menu or dialog opens over the Portal, so
 * the page stays visible behind it.
 */
export function snapshotAndHidePortal() {
  return inOrder(async () => {
    let url: string | null = null;
    try {
      const image = await invoke<ArrayBuffer>("portal_snapshot");
      if (image.byteLength > 0) url = URL.createObjectURL(new Blob([image], { type: "image/jpeg" }));
    } catch (err) {
      console.warn("[portal] snapshot failed", err);
    }
    await invoke<void>("portal_hide");
    return url;
  });
}

/** How long `fadeOutPortal` takes. The next app is shown after this. */
export const PORTAL_FADE_MS = 150;

/** Starts fading out the app on screen, before switching to another. */
export function fadeOutPortal() {
  return inOrder(() => invoke<void>("portal_fade_out"));
}

export function navigatePortalApp(app: PortalApp, action: PortalNavAction) {
  return invoke<void>("portal_nav", { id: app.id, action, url: app.url });
}

/** Opens the page the app is on (or its home page) in the default browser. */
export function openPortalAppExternally(app: PortalApp) {
  return invoke<void>("portal_open_external", { id: app.id, url: app.url });
}

/** Wipes the app's cookies and storage and returns it to its home page. */
export function signOutPortalApp(app: PortalApp) {
  return invoke<void>("portal_sign_out", { id: app.id, url: app.url });
}

/** Closes the app's webview and deletes its data folder. */
export function removePortalApp(id: string) {
  return invoke<void>("portal_remove", { id });
}

/**
 * Throws the app's webview away, keeping its data folder, so the next show
 * builds a fresh one. Used for settings WebView2 only reads at build time,
 * such as "keep live in background". The app stays signed in.
 */
export function rebuildPortalApp(id: string) {
  return invoke<void>("portal_rebuild", { id });
}

/** Deletes data folders left behind by apps that are no longer connected. */
export function prunePortal(keep: string[]) {
  return invoke<void>("portal_prune", { keep });
}

/** Subscribes to title changes from every app webview. */
export function onPortalEvent(cb: (event: PortalTitleEvent) => void): () => void {
  return listenTo(PORTAL_TITLE_EVENT, cb);
}

/** Subscribes to tab shortcuts pressed inside app pages (Windows). */
export function onPortalShortcut(cb: (shortcut: PortalShortcut) => void): () => void {
  return listenTo(PORTAL_SHORTCUT_EVENT, cb);
}

function listenTo<T>(event: string, cb: (payload: T) => void): () => void {
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen<T>(event, ({ payload }) => cb(payload)))
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
