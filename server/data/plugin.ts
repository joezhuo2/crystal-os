import type { ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { RequireUser } from "../auth/requireUser";
import { CalendarError as DataError } from "../calendar/errors";
import { readJsonBody, sendJson } from "../calendar/plugin";
import { type Credentials, importFromSupabase } from "./import";
import { DuplicateError, parseQuery } from "./query";
import { createDataStore } from "./store";

const ROUTE_PREFIX = "/api/data";
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface DataConfig {
  rootDir?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface DataMiddlewareOptions {
  importData?: typeof importFromSupabase;
}

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof DataError) {
    sendJson(res, err.status, { error: err.message, ...(err instanceof DuplicateError ? { code: err.code } : {}) });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[data] request failed:", message);
  sendJson(res, 500, { error: message });
}

function credentials(body: unknown): Credentials {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.refreshToken === "string" && b.refreshToken) return { refreshToken: b.refreshToken };
  if (typeof b.email === "string" && b.email && typeof b.password === "string" && b.password) {
    return { email: b.email, password: b.password };
  }
  throw new DataError("Enter your Supabase email and password");
}

export function createDataMiddleware(
  config: DataConfig,
  requireUser?: RequireUser,
  opts: DataMiddlewareOptions = {},
): Connect.NextHandleFunction {
  const store = createDataStore(config.rootDir ?? process.cwd());
  const importData = opts.importData ?? importFromSupabase;
  const canImport = Boolean(config.supabaseUrl && config.supabaseAnonKey);

  return (req, res, next) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(ROUTE_PREFIX)) return next();

    void (async () => {
      const route = new URL(rawUrl, "http://localhost").pathname.slice(ROUTE_PREFIX.length) || "/";
      const method = (req.method ?? "GET").toUpperCase();

      try {
        if (!requireUser) throw new DataError("Auth is not configured on the server", 503);
        if (!(await requireUser(req))) throw new DataError("Unauthorized", 401);

        if (route === "/status") {
          if (method !== "GET") throw new DataError("Use GET", 405);
          const meta = await store.meta();
          sendJson(res, 200, { needsImport: canImport && !meta.importedAt && !meta.skippedAt });
          return;
        }

        if (method !== "POST") throw new DataError("Use POST", 405);
        const body = await readJsonBody(req, MAX_BODY_BYTES);

        if (route === "/query") {
          sendJson(res, 200, { data: await store.run(parseQuery(body)) });
          return;
        }

        if (route === "/import") {
          if ((body as { skip?: unknown } | null)?.skip === true) {
            await store.merge({}, { skippedAt: new Date().toISOString() });
            sendJson(res, 200, { imported: 0 });
            return;
          }
          if (!canImport) throw new DataError("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set in .env.local", 503);
          const db = await importData({
            url: config.supabaseUrl as string,
            anonKey: config.supabaseAnonKey as string,
            credentials: credentials(body),
          });
          await store.merge(db, { importedAt: new Date().toISOString() });
          sendJson(res, 200, { imported: Object.values(db).reduce((n, rows) => n + rows.length, 0) });
          return;
        }

        throw new DataError(`Unknown route: ${route}`, 404);
      } catch (err) {
        sendError(res, err);
      }
    })();
  };
}

export function dataApi(config: DataConfig, requireUser?: RequireUser): Plugin {
  const middleware = createDataMiddleware(config, requireUser);
  return {
    name: "crystal-os:data-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
