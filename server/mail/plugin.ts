import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { RequireUser } from "../auth/requireUser";
import { CalendarError as MailError } from "../calendar/errors";
import { removeEnvValue, upsertEnvValue } from "../calendar/envFile";
import { readJsonBody, sendCallbackPage, sendJson } from "../calendar/plugin";
import { createMailAi } from "./ai";
import { createMailCache } from "./cache";
import { createDigest } from "./digest";
import { googleAuthUrl, googleClient, googleExchange, listGmail, revokeGoogle } from "./google";
import { createPkce, listOutlook, microsoftAuthUrl, microsoftExchange } from "./microsoft";
import { createMailStore } from "./store";
import type { MailConfig, MailProvider, MailStatus } from "./types";

const ROUTE_PREFIX = "/api/mail";
const ACCOUNTS_ROUTE = "/accounts/";
const DEFAULT_REDIRECT_URI = "http://localhost:8080/api/mail/auth/callback";
const STATE_TTL_MS = 10 * 60 * 1000;
const PAGE_TITLE = "Mail";
const OUTLOOK_OVERLAP_MS = 60 * 60 * 1000;

const MISSING_ENV: Record<MailProvider, string> = {
  google: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in .env.local",
  microsoft: "MICROSOFT_CLIENT_ID is not set in .env.local",
};

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof MailError) {
    sendJson(res, err.status, { error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[mail] request failed:", message);
  sendJson(res, 500, { error: message });
}

export interface MailMiddlewareOptions {
  returnUrl?: string | null;
}

export function createMailMiddleware(
  rawConfig: MailConfig,
  requireUser?: RequireUser,
  opts: MailMiddlewareOptions = {},
): Connect.NextHandleFunction {
  const config = { ...rawConfig, redirectUri: rawConfig.redirectUri || DEFAULT_REDIRECT_URI };
  const returnUrl = opts.returnUrl === undefined ? "/" : opts.returnUrl;
  const rootDir = config.rootDir ?? process.cwd();
  const store = createMailStore(rootDir);
  const ai = createMailAi(config.anthropicApiKey || undefined, config.aiModel || undefined);
  const pendingStates = new Map<string, { provider: MailProvider; verifier?: string; expiry: number }>();

  const configured: Record<MailProvider, boolean> = {
    google: Boolean(config.googleClientId && config.googleClientSecret),
    microsoft: Boolean(config.microsoftClientId),
  };

  const cache = createMailCache(rootDir);
  const digest = createDigest({
    store,
    ai,
    cache,
    fetchAccount: (account, { since, newest, known }) =>
      account.provider === "google"
        ? listGmail(googleClient(config, account.refreshToken), account.email, since, known)
        : listOutlook(config, account, Math.max(since, newest - OUTLOOK_OVERLAP_MS), (token) => store.setToken(account.id, token)),
  });

  function startAuth(provider: MailProvider): string {
    if (!configured[provider]) throw new MailError(MISSING_ENV[provider], 503);
    const state = randomBytes(16).toString("hex");
    const now = Date.now();
    for (const [key, entry] of pendingStates) {
      if (entry.expiry < now) pendingStates.delete(key);
    }
    if (provider === "google") {
      pendingStates.set(state, { provider, expiry: now + STATE_TTL_MS });
      return googleAuthUrl(config, state);
    }
    const { verifier, challenge } = createPkce();
    pendingStates.set(state, { provider, verifier, expiry: now + STATE_TTL_MS });
    return microsoftAuthUrl(config, state, challenge);
  }

  async function handleCallback(url: URL, res: ServerResponse): Promise<void> {
    const state = url.searchParams.get("state");
    const pending = state ? pendingStates.get(state) : undefined;
    if (state) pendingStates.delete(state);
    if (!pending || pending.expiry < Date.now()) {
      throw new MailError("Invalid or expired OAuth state", 400);
    }
    const error = url.searchParams.get("error");
    if (error) throw new MailError(`Sign-in was cancelled: ${error}`);
    const code = url.searchParams.get("code");
    if (!code) throw new MailError("Missing authorization code");

    const { email, refreshToken } =
      pending.provider === "google"
        ? await googleExchange(config, code)
        : await microsoftExchange(config, code, pending.verifier as string);
    await store.upsert(pending.provider, email, refreshToken);
    digest.clear();
    sendCallbackPage(
      res,
      200,
      `${email} connected`,
      returnUrl === null ? "You can close this tab and return to Crystal OS." : "Returning to Crystal OS...",
      returnUrl,
      PAGE_TITLE,
    );
  }

  return (req, res, next) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(ROUTE_PREFIX)) return next();

    void (async () => {
      const url = new URL(rawUrl, "http://localhost");
      const route = url.pathname.slice(ROUTE_PREFIX.length);
      const method = (req.method ?? "GET").toUpperCase();

      if (route === "/auth/callback") {
        try {
          if (method !== "GET") throw new MailError("Use GET", 405);
          await handleCallback(url, res);
        } catch (err) {
          const status = err instanceof MailError ? err.status : 500;
          const message = err instanceof Error ? err.message : String(err);
          if (status === 500) console.error("[mail] callback failed:", message);
          sendCallbackPage(res, status, "Connection failed", message, returnUrl, PAGE_TITLE);
        }
        return;
      }

      try {
        if (!requireUser) throw new MailError("Auth is not configured on the server", 503);
        if (!(await requireUser(req))) throw new MailError("Unauthorized", 401);

        if (route === "/status") {
          if (method !== "GET") throw new MailError("Use GET", 405);
          const status: MailStatus = {
            providers: {
              google: { configured: configured.google },
              microsoft: { configured: configured.microsoft },
            },
            ai: { configured: ai.configured, model: ai.model },
            cache: await cache.settings(),
            accounts: (await store.list()).map(({ id, provider, email }) => ({ id, provider, email })),
          };
          sendJson(res, 200, status);
          return;
        }

        if (route === "/auth/start") {
          if (method !== "GET") throw new MailError("Use GET", 405);
          const provider = url.searchParams.get("provider");
          if (provider !== "google" && provider !== "microsoft") {
            throw new MailError("provider must be google or microsoft");
          }
          sendJson(res, 200, { url: startAuth(provider) });
          return;
        }

        if (route.startsWith(ACCOUNTS_ROUTE)) {
          if (method !== "DELETE") throw new MailError("Use DELETE", 405);
          const id = decodeURIComponent(route.slice(ACCOUNTS_ROUTE.length));
          const account = (await store.list()).find((a) => a.id === id);
          if (!account) throw new MailError("Unknown account", 404);
          if (account.provider === "google" && configured.google) {
            await revokeGoogle(config, account.refreshToken);
          }
          await store.remove(id);
          digest.clear();
          sendJson(res, 200, { ok: true });
          return;
        }

        if (route === "/ai") {
          if (method !== "POST") throw new MailError("Use POST", 405);
          const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
          const apiKey = body.apiKey === undefined ? undefined : typeof body.apiKey === "string" ? body.apiKey.trim() : "";
          const model = body.model === undefined ? undefined : typeof body.model === "string" ? body.model.trim() : "";
          if (apiKey && !/^[\w-]{10,300}$/.test(apiKey)) throw new MailError("That does not look like an Anthropic API key");
          if (model && !/^[\w.:-]{1,100}$/.test(model)) throw new MailError("That does not look like a model id");
          ai.set({ apiKey, model });
          digest.clear();
          sendJson(res, 200, { configured: ai.configured, model: ai.model });
          setImmediate(() => {
            void (async () => {
              if (apiKey !== undefined) await (apiKey ? upsertEnvValue(rootDir, "ANTHROPIC_API_KEY", apiKey) : removeEnvValue(rootDir, "ANTHROPIC_API_KEY"));
              if (model !== undefined) await (model ? upsertEnvValue(rootDir, "MAIL_AI_MODEL", model) : removeEnvValue(rootDir, "MAIL_AI_MODEL"));
            })().catch((err) => console.error("[mail] failed to save AI settings:", err instanceof Error ? err.message : String(err)));
          });
          return;
        }

        if (route === "/digest") {
          if (method !== "GET") throw new MailError("Use GET", 405);
          sendJson(res, 200, await digest.get(url.searchParams.get("refresh") === "1"));
          return;
        }

        if (route === "/cache") {
          if (method !== "POST") throw new MailError("Use POST", 405);
          const body = ((await readJsonBody(req)) ?? {}) as Record<string, unknown>;
          for (const key of ["fetchDays", "retainDays"]) {
            if (body[key] !== undefined && !Number.isInteger(body[key])) throw new MailError(`${key} must be a whole number of days`);
          }
          const settings = await cache.setSettings({ fetchDays: body.fetchDays, retainDays: body.retainDays });
          digest.clear();
          sendJson(res, 200, settings);
          return;
        }

        throw new MailError(`Unknown route: ${url.pathname}`, 404);
      } catch (err) {
        sendError(res, err);
      }
    })();
  };
}

export function mailApi(config: MailConfig, requireUser?: RequireUser): Plugin {
  const middleware = createMailMiddleware(config, requireUser);
  return {
    name: "crystal-os:mail-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
