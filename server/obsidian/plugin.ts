import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequireUser } from "../auth/requireUser";
import {
  VaultError,
  appendToNote,
  collectTags,
  listNotes,
  readNote,
  searchNotes,
  toSummary,
} from "./vault";

const ROUTE_PREFIX = "/api/obsidian";
const DEFAULT_NOTE_PATH = "Inbox.md";
const DEFAULT_LIMIT = 50;
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
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
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

  const all = await listNotes(vaultPath);
  const allTags = collectTags(all);

  const q = url.searchParams.get("q")?.trim() ?? "";
  const tag = url.searchParams.get("tag")?.trim() ?? "";
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;

  let notes = q
    ? searchNotes(all, q)
    : all.map((note) => ({ ...toSummary(note), score: 0, matchContext: null }));

  if (tag) {
    const wanted = tag.toLowerCase();
    notes = notes.filter((n) => n.tags.some((t) => t.toLowerCase() === wanted));
  }

  sendJson(res, 200, {
    notes: notes.slice(0, limit),
    allTags,
    total: notes.length,
  });
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
