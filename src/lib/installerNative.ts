/**
 * Webview side of Settings → Install & update. Everything real happens in Rust
 * (src-tauri/src/installer.rs): GitHub is not in the webview's `connect-src`,
 * and neither the Downloads folder nor a build toolchain is reachable from
 * here. Desktop only — nothing from `@tauri-apps/*` loads until a function in
 * this module is called.
 */

/** Mirrors `Asset` in src-tauri/src/installer.rs. */
export interface ReleaseAsset {
  name: string;
  /** Bytes, as GitHub reports them. 0 when the release JSON omitted it. */
  size: number;
  url: string;
}

/** Mirrors `Release` in src-tauri/src/installer.rs. */
export interface Release {
  /** Git tag, and the id `downloadInstaller` takes. */
  tag: string;
  /** Tag without a leading `v`, for comparing against the running build. */
  version: string;
  name: string;
  /** ISO-8601 UTC, or null for a release GitHub has not dated. */
  publishedAt: string | null;
  prerelease: boolean;
  /** First 4000 characters of the release notes. */
  notes: string | null;
  /** Null when the release has no Windows installer attached. */
  asset: ReleaseAsset | null;
}

/** Mirrors `Status` in src-tauri/src/installer.rs. */
export interface InstallerStatus {
  currentVersion: string;
  repo: string;
  sourceDir: string | null;
  /** False when `sourceDir` is set but is no longer a Crystal OS checkout. */
  sourceOk: boolean;
  building: boolean;
  downloading: boolean;
}

export interface DownloadProgress {
  tag: string;
  received: number;
  total: number;
  done: boolean;
  path: string | null;
  error: string | null;
}

export interface BuildProgress {
  line: string | null;
  done: boolean;
  path: string | null;
  error: string | null;
}

export const DOWNLOAD_EVENT = "installer://download";
export const BUILD_EVENT = "installer://build";

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

export function installerStatus() {
  return invoke<InstallerStatus>("installer_status");
}

/** Published releases, newest first. */
export function listReleases() {
  return invoke<Release[]>("installer_releases");
}

/** Saves the installer for `tag` to Downloads and resolves with its path. */
export function downloadInstaller(tag: string) {
  return invoke<string>("installer_download", { tag });
}

/** Folder picker for the checkout builds run in. Null when cancelled. */
export function pickSourceFolder() {
  return invoke<string | null>("installer_pick_source");
}

/** Runs `npm run build:desktop` and resolves with the installer it produced. */
export function buildInstaller() {
  return invoke<string>("installer_build");
}

export function cancelBuild() {
  return invoke<void>("installer_cancel_build");
}

/** Opens File Explorer with the file selected. */
export function revealFile(path: string) {
  return invoke<void>("installer_reveal", { path });
}

/**
 * Subscribes to one installer event. The unsubscribe is safe to call before
 * the listener has finished registering.
 */
function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let cancelled = false;
  let unlisten: (() => void) | null = null;
  import("@tauri-apps/api/event").then(({ listen }) =>
    listen<T>(event, ({ payload }) => cb(payload)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    }),
  );
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

export function onDownloadProgress(cb: (progress: DownloadProgress) => void) {
  return subscribe<DownloadProgress>(DOWNLOAD_EVENT, cb);
}

export function onBuildProgress(cb: (progress: BuildProgress) => void) {
  return subscribe<BuildProgress>(BUILD_EVENT, cb);
}

/** `12.3 MB`, or an em dash when the size is unknown. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * Compares two dotted versions numerically, so `0.6.10` sorts above `0.6.9`.
 * Anything non-numeric in a segment counts as 0, and the shorter version is
 * padded, so `0.7` equals `0.7.0`.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.split(/[.\-+]/).map((part) => (/^\d+$/.test(part) ? Number(part) : 0));
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** Where a release sits relative to the running build. */
export function releaseStanding(release: Release, currentVersion: string): "current" | "newer" | "older" {
  const order = compareVersions(release.version, currentVersion);
  if (order === 0) return "current";
  return order > 0 ? "newer" : "older";
}
