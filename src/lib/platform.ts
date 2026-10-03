/**
 * Runtime capability checks for code that behaves differently inside the Tauri
 * desktop shell. Deliberately imports nothing from `@tauri-apps/*` at module
 * level, so the web bundle carries no desktop code and never breaks on it.
 */

/** Port the desktop sidecar (server/sidecar.ts) listens on. */
export const SIDECAR_ORIGIN = "http://127.0.0.1:8787";

/** True when running inside the Tauri webview (dev or packaged). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Resolve an `/api/*` path. The packaged desktop app loads from the Tauri
 * asset origin, where no API exists, so it talks to the sidecar instead. The
 * web app and `dev:desktop` both load from the Vite server, where the
 * middleware answers relative paths directly.
 */
export function apiUrl(path: string, dev: boolean = import.meta.env.DEV): string {
  return isDesktop() && !dev ? `${SIDECAR_ORIGIN}${path}` : path;
}

/**
 * Send the user to an external page. On desktop this opens the system browser:
 * Google refuses OAuth inside embedded webviews, and navigating the only app
 * window away would strand the user.
 */
export async function openExternal(url: string): Promise<void> {
  if (isDesktop()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.location.href = url;
}
