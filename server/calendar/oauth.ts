import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { CalendarError } from "./errors";
import { removeEnvValue, upsertEnvValue } from "./envFile";

export const REFRESH_TOKEN_KEY = "GOOGLE_REFRESH_TOKEN";

/**
 * `calendar.events` alone cannot call calendarList.list, so `calendar.readonly`
 * is requested alongside it to power the calendar picker. Neither scope allows
 * creating or deleting calendars themselves.
 */
export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const DEFAULT_REDIRECT_URI = "http://localhost:8080/api/calendar/auth/callback";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface CalendarConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  refreshToken?: string;
  /** Project root, i.e. where .env.local lives. Defaults to process.cwd(). */
  rootDir?: string;
}

export interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  account?: string;
  error?: string;
}

/**
 * Holds the refresh token for the life of the process and mirrors it into
 * .env.local. The access token stays inside the OAuth2Client's memory — it
 * lives an hour, googleapis refreshes it automatically, and neither token is
 * ever sent to the browser.
 */
export function createCalendarAuth(config: CalendarConfig) {
  const rootDir = config.rootDir ?? process.cwd();
  const redirectUri = config.redirectUri || DEFAULT_REDIRECT_URI;

  let refreshToken = config.refreshToken || null;
  let client: OAuth2Client | null = null;
  let accountCache: string | null = null;

  /** Pending CSRF nonces from /auth/start, consumed by /auth/callback. */
  const pendingStates = new Map<string, number>();

  const isConfigured = () => Boolean(config.clientId && config.clientSecret);

  function requireConfigured(): void {
    if (!isConfigured()) {
      throw new CalendarError(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in .env.local",
        503,
      );
    }
  }

  function newClient(): OAuth2Client {
    requireConfigured();
    return new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      redirectUri,
    );
  }

  /** An authorized client, or a 401 telling the UI to run the connect flow. */
  function getClient(): OAuth2Client {
    requireConfigured();
    if (!refreshToken) {
      throw new CalendarError("Google Calendar is not connected", 401);
    }
    if (!client) {
      client = newClient();
      client.setCredentials({ refresh_token: refreshToken });
    }
    return client;
  }

  function setRefreshToken(token: string): void {
    refreshToken = token;
    accountCache = null;
    // Force a fresh client so the next call uses the new grant.
    client = null;
  }

  /**
   * Mirror the token into .env.local. Callers schedule this *after* responding:
   * Vite watches .env files and restarts on change, so a blocking write here
   * would race the callback's own HTTP response.
   */
  async function persistRefreshToken(token: string): Promise<void> {
    await upsertEnvValue(rootDir, REFRESH_TOKEN_KEY, token);
  }

  function buildConsentUrl(): string {
    const state = randomBytes(16).toString("hex");
    const now = Date.now();
    for (const [key, expiry] of pendingStates) {
      if (expiry < now) pendingStates.delete(key);
    }
    pendingStates.set(state, now + STATE_TTL_MS);

    return newClient().generateAuthUrl({
      access_type: "offline",
      // Google only returns a refresh token on an explicit re-consent.
      prompt: "consent",
      scope: SCOPES,
      state,
    });
  }

  function consumeState(state: string | null): void {
    if (!state || !pendingStates.has(state)) {
      throw new CalendarError("Invalid or expired OAuth state", 400);
    }
    const expiry = pendingStates.get(state) as number;
    pendingStates.delete(state);
    if (expiry < Date.now()) {
      throw new CalendarError("Invalid or expired OAuth state", 400);
    }
  }

  /** Exchange the callback code. Returns the token; persisting is the caller's. */
  async function exchangeCode(
    code: string,
    state: string | null,
  ): Promise<string> {
    consumeState(state);
    const { tokens } = await newClient().getToken(code);
    if (!tokens.refresh_token) {
      throw new CalendarError(
        "Google did not return a refresh token. Revoke the app's access at " +
          "https://myaccount.google.com/permissions and connect again.",
        400,
      );
    }
    setRefreshToken(tokens.refresh_token);
    return tokens.refresh_token;
  }

  async function disconnect(): Promise<void> {
    const token = refreshToken;
    refreshToken = null;
    client = null;
    accountCache = null;
    if (token) {
      try {
        await newClient().revokeToken(token);
      } catch {
        // Already revoked or offline — clearing local state is what matters.
      }
    }
    await removeEnvValue(rootDir, REFRESH_TOKEN_KEY);
  }

  /**
   * The connected account's address. The primary calendar's id is the account
   * email, which avoids requesting a userinfo scope just for a label.
   */
  async function getAccount(): Promise<string> {
    if (accountCache) return accountCache;
    const calendar = google.calendar({ version: "v3", auth: getClient() });
    const { data } = await calendar.calendarList.get({ calendarId: "primary" });
    accountCache = data.id ?? "connected";
    return accountCache;
  }

  async function getStatus(): Promise<CalendarStatus> {
    if (!isConfigured()) {
      return {
        configured: false,
        connected: false,
        error:
          "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in .env.local",
      };
    }
    if (!refreshToken) return { configured: true, connected: false };

    try {
      return { configured: true, connected: true, account: await getAccount() };
    } catch (err) {
      // A revoked or expired grant looks like a live token until it is used.
      const message = err instanceof Error ? err.message : String(err);
      return { configured: true, connected: false, error: message };
    }
  }

  return {
    isConfigured,
    getClient,
    getStatus,
    buildConsentUrl,
    exchangeCode,
    persistRefreshToken,
    disconnect,
  };
}

export type CalendarAuth = ReturnType<typeof createCalendarAuth>;
