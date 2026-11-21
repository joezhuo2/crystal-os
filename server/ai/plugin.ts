import type { ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { RequireUser } from "../auth/requireUser";
import { readJsonBody, sendJson } from "../calendar/plugin";
import { chat, chatStream, parseChatInput } from "./chat";
import { AiError, type AiConfig } from "./config";

const ROUTE_PREFIX = "/api/ai";
const MAX_CHAT_BYTES = 15 * 1024 * 1024;

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof AiError) {
    sendJson(res, err.status, { error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[ai] request failed:", message);
  sendJson(res, 500, { error: message });
}

export function createAiMiddleware(ai: AiConfig, requireUser?: RequireUser): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== ROUTE_PREFIX && !url.pathname.startsWith(`${ROUTE_PREFIX}/`)) return next();

    void (async () => {
      try {
        if (!requireUser) throw new AiError("Auth is not configured on the server", 503);
        if (!(await requireUser(req))) throw new AiError("Unauthorized", 401);
        const route = url.pathname.slice(ROUTE_PREFIX.length);
        const method = (req.method ?? "GET").toUpperCase();

        if (route === "/status") {
          if (method !== "GET") throw new AiError("Use GET", 405);
          sendJson(res, 200, ai.status());
          return;
        }

        if (route === "/config") {
          if (method !== "POST") throw new AiError("Use POST", 405);
          const saved = ai.update(await readJsonBody(req));
          sendJson(res, 200, ai.status());
          void saved.catch((err) => console.error("[ai] failed to save AI settings:", err instanceof Error ? err.message : String(err)));
          return;
        }

        if (route === "/chat") {
          if (method !== "POST") throw new AiError("Use POST", 405);
          sendJson(res, 200, await chat(ai, parseChatInput(await readJsonBody(req, MAX_CHAT_BYTES))));
          return;
        }

        if (route === "/chat/stream") {
          if (method !== "POST") throw new AiError("Use POST", 405);
          const input = parseChatInput(await readJsonBody(req, MAX_CHAT_BYTES));
          const stop = new AbortController();
          res.on("close", () => stop.abort());
          const write = (e: unknown) => {
            if (!res.headersSent) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
              res.setHeader("Cache-Control", "no-store");
            }
            res.write(`${JSON.stringify(e)}\n`);
          };
          try {
            await chatStream(ai, input, write, stop.signal);
          } catch (err) {
            if (!res.headersSent) throw err;
            if (!stop.signal.aborted) write({ type: "error", error: err instanceof Error ? err.message : String(err) });
          }
          res.end();
          return;
        }

        throw new AiError(`Unknown route: ${url.pathname}`, 404);
      } catch (err) {
        sendError(res, err);
      }
    })();
  };
}

export function aiApi(ai: AiConfig, requireUser?: RequireUser): Plugin {
  const middleware = createAiMiddleware(ai, requireUser);
  return {
    name: "crystal-os:ai-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
