import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { CalendarError } from "./errors";
import { removeEnvValue, upsertEnvValue } from "./envFile";
import { type CalendarSource, getPrimaryCalendarId } from "./events";

export const REFRESH_TOKEN_KEY = "GOOGLE_REFRESH_TOKEN";
export const EXTRA_TOKENS_KEY = "GOOGLE_REFRESH_TOKENS_EXTRA";

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

const isRevoked = (err: unknown) => /invalid_grant/.test(err instanceof Error ? err.message : String(err));

export interface CalendarConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  refreshToken?: string;
  extraRefreshTokens?: string;
  /** Project root, i.e. where .env.local lives. Defaults to process.cwd(). */
  rootDir?: string;
}

export interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  account?: string;
  accounts?: string[];
  error?: string;
}

/**
 * Holds the refresh tokens for the life of the process and mirrors them into
 * .env.local. The access tokens stay inside each OAuth2Client's memory — they
 * live an hour, OAuth2Client refreshes them automatically, and no token is
 * ever sent to the browser.
 */
export function createCalendarAuth(config: CalendarConfig) {
  const rootDir = config.rootDir ?? process.cwd();
  const redirectUri = config.redirectUri || DEFAULT_REDIRECT_URI;

  let tokens = [config.refreshToken, ...(config.extraRefreshTokens ?? "").split(",")]
    .map((t) => (t ?? "").trim())
    .filter(Boolean);
  const clients = new Map<string, OAuth2Client>();
  const accounts = new Map<string, string>();

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
    return new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri,
    });
  }

  function clientFor(token: string): OAuth2Client {
    let client = clients.get(token);
    if (!client) {
      client = newClient();
      client.setCredentials({ refresh_token: token });
      clients.set(token, client);
    }
    return client;
  }

  function requireConnected(): void {
    requireConfigured();
    if (tokens.length === 0) {
      throw new CalendarError("Google Calendar is not connected", 401);
    }
  }

  async function accountOf(token: string): Promise<string> {
    let account = accounts.get(token);
    if (!account) {
      account = (await getPrimaryCalendarId(clientFor(token))) ?? "connected";
      accounts.set(token, account);
    }
    return account;
  }

  async function getSources(): Promise<CalendarSource[]> {
    requireConnected();
    const settled = await Promise.allSettled(
      tokens.map(async (token) => ({ account: await accountOf(token), client: clientFor(token) })),
    );
    const sources = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (sources.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
    return sources;
  }

  /** An authorized client for `account`, or for the first account when omitted. */
  async function getClient(account?: string): Promise<OAuth2Client> {
    requireConnected();
    if (!account) return clientFor(tokens[0]);
    const source = (await getSources()).find((s) => s.account === account);
    if (!source) throw new CalendarError(`${account} is not connected`, 401);
    return source.client;
  }

  /**
   * Mirror the tokens into .env.local. Callers schedule this *after* responding:
   * Vite watches .env files and restarts on change, so a blocking write here
   * would race the callback's own HTTP response.
   */
  async function persistTokens(): Promise<void> {
    const [first, ...extra] = tokens;
    if (first) await upsertEnvValue(rootDir, REFRESH_TOKEN_KEY, first);
    else await removeEnvValue(rootDir, REFRESH_TOKEN_KEY);
    if (extra.length) await upsertEnvValue(rootDir, EXTRA_TOKENS_KEY, extra.join(","));
    else await removeEnvValue(rootDir, EXTRA_TOKENS_KEY);
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

  /** Exchange the callback code. Persisting the tokens is the caller's. */
  async function exchangeCode(
    code: string,
    state: string | null,
  ): Promise<void> {
    consumeState(state);
    const { tokens: granted } = await newClient().getToken(code);
    const token = granted.refresh_token;
    if (!token) {
      throw new CalendarError(
        "Google did not return a refresh token. Revoke the app's access at " +
          "https://myaccount.google.com/permissions and connect again.",
        400,
      );
    }
    const account = await accountOf(token);
    const replaced = tokens.filter((t) => t !== token && accounts.get(t) === account);
    for (const old of replaced) forget(old);
    tokens = [...tokens.filter((t) => !replaced.includes(t) && t !== token), token];
  }

  function forget(token: string): void {
    clients.delete(token);
    accounts.delete(token);
  }

  async function disconnect(account?: string): Promise<void> {
    const leaving = account ? tokens.filter((t) => accounts.get(t) === account) : tokens;
    tokens = tokens.filter((t) => !leaving.includes(t));
    // Not revoked: Google revokes the whole grant for this client, which would sign Courier out too.
    for (const token of leaving) forget(token);
    await persistTokens();
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
    if (tokens.length === 0) return { configured: true, connected: false };

    try {
      const list = (await getSources()).map((s) => s.account);
      return { configured: true, connected: true, account: list[0], accounts: list };
    } catch (err) {
      // A revoked or expired grant looks like a live token until it is used.
      // Anything else (offline after sleep, a Google outage) is not a sign-out.
      const message = err instanceof Error ? err.message : String(err);
      return { configured: true, connected: !isRevoked(err), error: message };
    }
  }

  return {
    isConfigured,
    getClient,
    getSources,
    getStatus,
    buildConsentUrl,
    exchangeCode,
    persistTokens,
    disconnect,
  };
}

export type CalendarAuth = ReturnType<typeof createCalendarAuth>;
