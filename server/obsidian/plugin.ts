import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequireUser } from "../auth/requireUser";
import {
  MAX_NOTE_BYTES,
  VaultError,
  appendToNote,
  listNotes,
  readNote,
  readRawNote,
  saveNote,
  createNote,
} from "./vault";
import { DEFAULT_NOTE_PATH, queryNotes } from "../../src/lib/vaultCore";

const ROUTE_PREFIX = "/api/obsidian";
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof VaultError) {
    sendJson(res, err.status, { error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[obsidian] request failed:", message);
  sendJson(res, 500, { error: message });
}

/** Read a JSON request body, aborting rather than buffering unbounded input. */
function readJsonBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new VaultError("Request body too large", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new VaultError("Body must be valid JSON"));
      }
    });

    req.on("error", reject);
  });
}

async function handleNotes(
  vaultPath: string,
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const single = url.searchParams.get("path");
  if (single) {
    sendJson(res, 200, await readNote(vaultPath, single));
    return;
  }

  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const response = queryNotes(await listNotes(vaultPath), {
    q: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  sendJson(res, 200, response);
}

async function handleQuickAdd(
  vaultPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(req)) as {
    text?: unknown;
    notePath?: unknown;
    tags?: unknown;
  };

  const notePath =
    typeof body.notePath === "string" && body.notePath.trim()
      ? body.notePath.trim()
      : DEFAULT_NOTE_PATH;

  // Tags are validated inside appendToNote alongside the text.
  const result = await appendToNote(vaultPath, notePath, body.text as string, {
    tags: body.tags,
  });

  sendJson(res, 200, { ok: true, ...result });
}

/**
 * Connect-style handler for `/api/obsidian/*`. Framework-free so the same code
 * runs inside Vite (dev/preview) and in the desktop sidecar (server/standalone.ts).
 */
export function createObsidianMiddleware(
  vaultPath?: string,
  requireUser?: RequireUser,
): Connect.NextHandleFunction {
  return (req, res, next) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(ROUTE_PREFIX)) return next();

    void (async () => {
      try {
        // Authorization first: an unauthenticated caller should not be able to
        // probe whether a vault is configured on this machine.
        if (!requireUser) {
          throw new VaultError("Auth is not configured on the server", 503);
        }
        if (!(await requireUser(req))) {
          throw new VaultError("Unauthorized", 401);
        }

        if (!vaultPath) {
          throw new VaultError(
            "OBSIDIAN_VAULT_PATH is not set in .env.local",
            503,
          );
        }

        const url = new URL(rawUrl, "http://localhost");
        const route = url.pathname.slice(ROUTE_PREFIX.length);
        const method = (req.method ?? "GET").toUpperCase();

        if (route === "/notes") {
          if (method !== "GET") throw new VaultError("Use GET", 405);
          await handleNotes(vaultPath, url, res);
          return;
        }

        if (route === "/raw") {
          if (method !== "GET") throw new VaultError("Use GET", 405);
          const notePath = url.searchParams.get("path");
          if (!notePath) throw new VaultError("path is required");
          sendJson(res, 200, await readRawNote(vaultPath, notePath));
          return;
        }

        if (route === "/note") {
          if (method !== "PUT") throw new VaultError("Use PUT", 405);
          // JSON escaping can double a note's size, so allow headroom over the cap.
          const body = (await readJsonBody(req, MAX_NOTE_BYTES * 2 + 1024)) as {
            path?: unknown;
            content?: unknown;
            expectedMtime?: unknown;
          };
          if (typeof body.path !== "string" || !body.path.trim()) {
            throw new VaultError("path is required");
          }
          const result = await saveNote(vaultPath, body.path, body.content, body.expectedMtime);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }

        if (route === "/create") {
          if (method !== "POST") throw new VaultError("Use POST", 405);
          const body = (await readJsonBody(req, MAX_NOTE_BYTES * 2 + 1024)) as {
            path?: unknown;
            content?: unknown;
            overwrite?: unknown;
          };
          if (typeof body.path !== "string" || !body.path.trim()) {
            throw new VaultError("path is required");
          }
          const result = await createNote(vaultPath, body.path, body.content, body.overwrite);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }

        if (route === "/quick-add") {
          if (method !== "POST") throw new VaultError("Use POST", 405);
          await handleQuickAdd(vaultPath, req, res);
          return;
        }

        throw new VaultError(`Unknown route: ${url.pathname}`, 404);
      } catch (err) {
        sendError(res, err);
      }
    })();
  };
}

/**
 * Serves the Obsidian vault over `/api/obsidian/*` from the Vite dev and
 * preview servers. `fast-glob` and `gray-matter` are Node-only, and the vault
 * is a local directory, so this middleware is where that work has to happen -
 * the browser bundle only ever sees the JSON.
 */
export function obsidianApi(
  vaultPath?: string,
  requireUser?: RequireUser,
): Plugin {
  const middleware = createObsidianMiddleware(vaultPath, requireUser);

  return {
    name: "crystal-os:obsidian-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
