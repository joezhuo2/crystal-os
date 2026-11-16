/**
 * Starts the desktop sidecar (crystal-api) on the first `/api/*` request
 * instead of with the app (src-tauri/src/sidecar.rs). Only called in the
 * packaged desktop app, where `apiUrl` points at the sidecar.
 */

let ready: Promise<string> | null = null;

/** Resolves with the sidecar's access token once it accepts connections. Shared by concurrent callers. */
export function ensureSidecar(): Promise<string> {
  if (!ready) {
    ready = import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("sidecar_ensure"))
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

/** A request failed to connect: ask Rust again next time, which restarts a sidecar that died. */
export function sidecarLost() {
  ready = null;
}
