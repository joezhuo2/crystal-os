import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";
import { type RequireUser } from "./auth/requireUser";
import { createCalendarMiddleware } from "./calendar/plugin";
import { createObsidianMiddleware } from "./obsidian/plugin";

/**
 * Webview origins the packaged desktop app loads from. Tauri serves the bundle
 * from `http://tauri.localhost` on Windows and `tauri://localhost` elsewhere.
 * Nothing else may call the sidecar cross-origin — a random web page open in
 * the user's browser must not be able to read the vault through it.
 */
export const DESKTOP_ORIGINS = new Set([
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
]);

export interface ApiEnv {
  OBSIDIAN_VAULT_PATH?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_REFRESH_TOKEN?: string;
}

export interface ApiHandlerOptions {
  env: ApiEnv;
  requireUser?: RequireUser;
  /** Where `.env.local` lives, so the calendar refresh token is written back there. */
  rootDir: string;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

/**
 * The vault and calendar middleware from the Vite plugins, mounted on a bare
 * `node:http` handler. This is what the desktop sidecar serves: the packaged
 * app has no Vite server, so without it Archive and Google Calendar would have
 * no backend.
 */
export function createApiHandler({ env, requireUser, rootDir }: ApiHandlerOptions): Handler {
  const chain: Connect.NextHandleFunction[] = [
    createObsidianMiddleware(env.OBSIDIAN_VAULT_PATH, requireUser),
    createCalendarMiddleware(
      {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI,
        refreshToken: env.GOOGLE_REFRESH_TOKEN,
        rootDir,
      },
      requireUser,
      // Consent runs in the system browser, which has no app to bounce back to.
      { returnUrl: null },
    ),
  ];

  return (req, res) => {
    const origin = req.headers.origin;
    const allowed = Boolean(origin && DESKTOP_ORIGINS.has(origin));
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin as string);
      res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      if (allowed) {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Max-Age", "600");
        res.statusCode = 204;
      } else {
        res.statusCode = 403;
      }
      res.end();
      return;
    }

    const path = (req.url ?? "").split("?")[0];
    if (path === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    let index = 0;
    const next = () => {
      const middleware = chain[index++];
      if (!middleware) {
        sendJson(res, 404, { error: `Unknown route: ${path}` });
        return;
      }
      middleware(req as Connect.IncomingMessage, res, next);
    };
    next();
  };
}
