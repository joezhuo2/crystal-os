import { apiUrl, usesSidecar } from "./platform";
import { apiToken, forgetApiToken } from "./apiToken";
import { sidecarLost } from "./sidecarNative";

/** Carries the HTTP status so retry policy can distinguish 401 from 503. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * react-query retry policy. An expired or missing session is not a transient
 * failure — retrying it produces a burst of doomed requests and delays the
 * login screen. Anything else gets one retry.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return false;
  }
  return failureCount < 1;
}

/**
 * Every call to the local API goes through here, carrying its access token
 * (src/lib/apiToken.ts). On desktop, asking for the token also starts the
 * sidecar, on the first request rather than with the app.
 */
export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
  errorPrefix = "API error",
): Promise<T> {
  return (await apiResponse(url, init, errorPrefix)).json() as Promise<T>;
}

export async function apiResponse(
  url: string,
  init?: RequestInit,
  errorPrefix = "API error",
): Promise<Response> {
  const sidecar = usesSidecar();
  const headers = new Headers(init?.headers);
  try {
    headers.set("Authorization", `Bearer ${await apiToken()}`);
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : String(err), 503);
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(url), { ...init, headers });
  } catch (err) {
    // Connection refused: the sidecar may have exited. The next call checks.
    if (sidecar) sidecarLost();
    throw err;
  }

  if (!res.ok) {
    if (res.status === 401) forgetApiToken();
    // The middleware always replies with { error } — surface that instead of a
    // bare status code, since "OBSIDIAN_VAULT_PATH is not set" is actionable.
    let message = `${errorPrefix}: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON response, keep the status message */
    }
    throw new ApiError(message, res.status);
  }

  return res;
}
