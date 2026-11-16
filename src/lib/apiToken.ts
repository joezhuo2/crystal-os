import { usesSidecar } from "./platform";
import { ensureSidecar } from "./sidecarNative";

let devToken: Promise<string> | null = null;

export function apiToken(): Promise<string> {
  if (usesSidecar()) return ensureSidecar();
  devToken ??= fetch("/api/session")
    .then((res) => {
      if (!res.ok) throw new Error(`The local API refused to start a session (${res.status})`);
      return res.json() as Promise<{ token: string }>;
    })
    .then((body) => body.token)
    .catch((err) => {
      devToken = null;
      throw err;
    });
  return devToken;
}

export function forgetApiToken() {
  devToken = null;
}
