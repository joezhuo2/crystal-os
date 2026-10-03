/**
 * Apps the Portal tab can connect, and the pure helpers around them. Nothing
 * here touches Tauri, the DOM, or storage, so it is tested directly.
 */

export interface PortalApp {
  /** Lowercase letters, digits and dashes. Also the app's data folder name. */
  id: string;
  name: string;
  /** Home page. Always https. */
  url: string;
  /**
   * Run at full speed while off screen instead of being throttled. Worth it
   * for an app whose calls or notifications have to stay live, and costs CPU
   * for every app it is turned on for, so it is off by default.
   *
   * Read when the app's webview is built, so a change applies the next time
   * the app loads.
   */
  keepLive?: boolean;
  /**
   * False when the app's webview should be thrown away once it has been off
   * screen for the unload delay, freeing its memory. Reopening the app loads
   * it again from scratch: it stays signed in, but unsent drafts, scroll
   * position and in-page state are lost, and its unread badge stops updating.
   *
   * Left out (meaning on) unless it is off.
   */
  keepLoaded?: false;
}

export interface PortalPreset extends PortalApp {
  /** Brand colour, used for the letter avatar when the favicon fails. */
  color: string;
}

/**
 * The apps offered on the Portal's connect screen.
 *
 * Two carry known WebView2 limits. Google blocks sign-in from embedded
 * webviews, so Gmail may refuse the password step and ask you to sign in
 * through a real browser; an account already signed in elsewhere on the
 * machine is unaffected. Spotify's web player needs Widevine DRM, which
 * WebView2 does not ship, so browsing and playlists work but tracks will not
 * play.
 */
export const PRESETS: PortalPreset[] = [
  { id: "discord", name: "Discord", url: "https://discord.com/app", color: "#5865F2" },
  { id: "instagram", name: "Instagram", url: "https://www.instagram.com/", color: "#E1306C" },
  { id: "linkedin", name: "LinkedIn", url: "https://www.linkedin.com/feed/", color: "#0A66C2" },
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com/", color: "#1DB954" },
  { id: "x", name: "X", url: "https://x.com/", color: "#E7E9EA" },
  { id: "reddit", name: "Reddit", url: "https://www.reddit.com/", color: "#FF4500" },
  { id: "gmail", name: "Gmail", url: "https://mail.google.com/mail/u/0/", color: "#EA4335" },
  { id: "outlook", name: "Outlook", url: "https://outlook.live.com/mail/0/", color: "#0F6CBD" },
];

/** Unread count from a page title, or a dot when the site only flags "unread". */
export type PortalBadge = number | "dot";

const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * Turns user input into an https URL, adding the scheme when it is missing.
 * Returns null for anything that is not an https address with a real host.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^/]+:\d+(\/|$)/.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null;
  return url.href;
}

/** A readable id from the app name, unique among `taken`. */
export function makeId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/, "") || "app";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

export type NewAppResult = { ok: true; app: PortalApp } | { ok: false; error: string };

/** Validates the Add custom app form. */
export function createCustomApp(name: string, url: string, existing: PortalApp[]): NewAppResult {
  const cleanName = name.trim();
  if (!cleanName) return { ok: false, error: "Give the app a name." };
  if (cleanName.length > 40) return { ok: false, error: "Keep the name under 40 characters." };
  const href = normalizeUrl(url);
  if (!href) return { ok: false, error: "Enter an https:// address, like https://example.com." };
  const app = { id: makeId(cleanName, existing.map((a) => a.id)), name: cleanName, url: href };
  return { ok: true, app };
}

/**
 * Reads the saved app list, dropping entries that are malformed or whose id
 * repeats. Bad JSON yields an empty list rather than an error.
 */
export function parseStoredApps(raw: string | null): PortalApp[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const apps: PortalApp[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const { id, name, url, keepLive, keepLoaded } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || typeof url !== "string") continue;
    const href = normalizeUrl(url);
    if (!isValidId(id) || seen.has(id) || !name.trim() || !href) continue;
    seen.add(id);
    // The flag is left off the app unless it is on, matching how it is stored,
    // so apps saved before the setting existed parse exactly as they used to.
    const app: PortalApp = { id, name: name.trim(), url: href };
    if (keepLive === true) app.keepLive = true;
    if (keepLoaded === false) app.keepLoaded = false;
    apps.push(app);
  }
  return apps;
}

/**
 * Reads an unread badge from a document title:
 * - `(3) Discord` gives 3 (Discord, Instagram, Gmail, Outlook, X, Reddit)
 * - `• Discord`, `* LinkedIn`, `! LinkedIn` give a dot
 */
export function parseBadge(title: string): PortalBadge | null {
  const count = /^\s*\((\d+)\+?\)/.exec(title);
  if (count) {
    const n = Number(count[1]);
    return n > 0 ? n : null;
  }
  if (/^\s*[•●*!]\s/.test(title)) return "dot";
  return null;
}

/** Sum of all counts, a dot when there are only dots, or null when nothing is unread. */
export function badgeTotal(badges: Record<string, PortalBadge | null | undefined>): PortalBadge | null {
  let sum = 0;
  let dot = false;
  for (const badge of Object.values(badges)) {
    if (typeof badge === "number") sum += badge;
    else if (badge === "dot") dot = true;
  }
  if (sum > 0) return sum;
  return dot ? "dot" : null;
}

/** Short label for a badge: `99+` past 99. */
export function badgeLabel(badge: PortalBadge): string {
  if (badge === "dot") return "";
  return badge > 99 ? "99+" : String(badge);
}

export function faviconUrl(url: string): string | null {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return null;
  }
}

export function presetFor(id: string): PortalPreset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
