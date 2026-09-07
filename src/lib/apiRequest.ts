import { supabase } from "./supabase";

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
 * Every call to the vault and calendar middleware goes through here.
 *
 * The token is read at call time rather than passed in, and deliberately so.
 * Supabase rotates the access token roughly hourly; a token captured at mount
 * would start returning 401 an hour into a session while the database queries
 * carried on working. Putting it in a react-query `queryKey` would instead
 * invalidate every cached query on each refresh. `getSession()` returns the
 * cached session and refreshes it only when needed, so reading it per call is
 * cheap and makes staleness structurally impossible.
 */
export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
  errorPrefix = "API error",
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
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

  return res.json() as Promise<T>;
}
