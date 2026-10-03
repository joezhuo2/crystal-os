import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequireUser } from "../auth/requireUser";
import { CalendarError } from "./errors";
import {
  type CalendarAuth,
  type CalendarConfig,
  createCalendarAuth,
} from "./oauth";
import {
  type EventInput,
  createEvent,
  deleteEvent,
  listCalendars,
  listEvents,
  updateEvent,
} from "./events";

const ROUTE_PREFIX = "/api/calendar";
const EVENTS_ROUTE = "/events/";
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof CalendarError) {
    sendJson(res, err.status, { error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[calendar] request failed:", message);
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
        reject(new CalendarError("Request body too large", 413));
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
        reject(new CalendarError("Body must be valid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The tiny page the OAuth callback lands on before bouncing back to the app. */
function sendCallbackPage(
  res: ServerResponse,
  status: number,
  heading: string,
  detail: string,
  returnUrl: string | null = "/",
) {
  const ok = status === 200;
  const refresh = ok && returnUrl !== null;
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Google Calendar</title>
    ${refresh ? `<meta http-equiv="refresh" content="1;url=${escapeHtml(returnUrl)}" />` : ""}
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center;
             justify-content: center; background: hsl(222 47% 11%);
             color: hsl(210 40% 98%); font-family: Inter, system-ui, sans-serif; }
      main { text-align: center; padding: 2rem; max-width: 32rem; }
      h1 { font-size: 1.125rem; margin: 0 0 .5rem; }
      p { font-size: .8125rem; color: hsl(215 20% 65%); margin: 0; line-height: 1.5; }
      a { color: hsl(239 84% 67%); }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(detail)}</p>
      ${ok || returnUrl === null ? "" : `<p style="margin-top:1rem"><a href="${escapeHtml(returnUrl)}">Back to Crystal OS</a></p>`}
    </main>
  </body>
</html>`);
}

function parseEventInput(body: unknown): EventInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  return {
    summary: str(b.summary),
    description: str(b.description),
    location: str(b.location),
    allDay: Boolean(b.allDay),
    startDate: str(b.startDate),
    startTime: str(b.startTime),
    endDate: str(b.endDate),
    endTime: str(b.endTime),
    timeZone: str(b.timeZone),
    // Absent means "leave the series alone"; null means "clear it".
    recurrence:
      b.recurrence === undefined
        ? undefined
        : Array.isArray(b.recurrence)
          ? (b.recurrence as string[])
          : null,
  };
}

/**
 * Pick the id an operation should target. With `singleEvents=true` the list
 * returns instances, so "this event" acts on the instance and "all events" acts
 * on the series master the instance points at.
 */
function targetEventId(
  eventId: string,
  scope: string,
  recurringEventId: string | null,
): string {
  return scope === "all" && recurringEventId ? recurringEventId : eventId;
}

async function handleAuthCallback(
  auth: CalendarAuth,
  url: URL,
  res: ServerResponse,
  returnUrl: string | null,
): Promise<void> {
  const error = url.searchParams.get("error");
  if (error) {
    sendCallbackPage(
      res,
      400,
      "Connection cancelled",
      `Google replied: ${error}`,
      returnUrl,
    );
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) throw new CalendarError("Missing authorization code");

  // 1. In-memory first, so this process is connected the moment we reply.
  const refreshToken = await auth.exchangeCode(
    code,
    url.searchParams.get("state"),
  );

  // 2. Respond before touching disk.
  sendCallbackPage(
    res,
    200,
    "Google Calendar connected",
    returnUrl === null
      ? "You can close this tab and return to Crystal OS."
      : "Returning to Crystal OS...",
    returnUrl,
  );

  // 3. Mirror to .env.local detached. Vite restarts the dev server when an env
  //    file changes, so a blocking write here would race the response above.
  setImmediate(() => {
    void auth.persistRefreshToken(refreshToken).catch((err) => {
      console.error(
        "[calendar] failed to persist refresh token:",
        err instanceof Error ? err.message : String(err),
      );
    });
  });
}

export interface CalendarMiddlewareOptions {
  /**
   * Where the OAuth callback page bounces to once connected. `null` shows a
   * "close this tab" page instead — used by the desktop sidecar, where the
   * consent flow runs in the system browser rather than inside the app.
   */
  returnUrl?: string | null;
}

/**
 * Connect-style handler for `/api/calendar/*`. Framework-free so the same code
 * runs inside Vite (dev/preview) and in the desktop sidecar (server/standalone.ts).
 */
export function createCalendarMiddleware(
  config: CalendarConfig,
  requireUser?: RequireUser,
  opts: CalendarMiddlewareOptions = {},
): Connect.NextHandleFunction {
  const auth = createCalendarAuth(config);
  const returnUrl = opts.returnUrl === undefined ? "/" : opts.returnUrl;

  return (req, res, next) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(ROUTE_PREFIX)) return next();

    void (async () => {
      try {
        // Parse the whole URL up front so no query value is ever hand-sliced.
        const url = new URL(rawUrl, "http://localhost");
        const route = url.pathname.slice(ROUTE_PREFIX.length);
        const method = (req.method ?? "GET").toUpperCase();
        const calendarId = url.searchParams.get("calendarId") || "primary";
        const scope = url.searchParams.get("scope") === "all" ? "all" : "single";

        // /auth/callback is the one exemption, and it has to be: it is a
        // redirect issued by Google's servers, which will never send our
        // Authorization header. It carries its own protection — a random state
        // nonce, verified here, expiring after 10 minutes.
        if (route !== "/auth/callback") {
          if (!requireUser) {
            throw new CalendarError("Auth is not configured on the server", 503);
          }
          if (!(await requireUser(req))) {
            throw new CalendarError("Unauthorized", 401);
          }
        }

        if (route === "/status") {
          if (method !== "GET") throw new CalendarError("Use GET", 405);
          sendJson(res, 200, await auth.getStatus());
          return;
        }

        if (route === "/auth/start") {
          if (method !== "GET") throw new CalendarError("Use GET", 405);
          // Returns the URL rather than 302-ing to it. A top-level navigation
          // cannot carry an Authorization header, so this route would be
          // unreachable once gated; the client fetches the URL and navigates
          // itself.
          res.setHeader("Cache-Control", "no-store");
          sendJson(res, 200, { url: auth.buildConsentUrl() });
          return;
        }

        if (route === "/auth/callback") {
          if (method !== "GET") throw new CalendarError("Use GET", 405);
          await handleAuthCallback(auth, url, res, returnUrl);
          return;
        }

        if (route === "/auth/disconnect") {
          if (method !== "POST") throw new CalendarError("Use POST", 405);
          await auth.disconnect();
          sendJson(res, 200, { ok: true });
          return;
        }

        if (route === "/calendars") {
          if (method !== "GET") throw new CalendarError("Use GET", 405);
          sendJson(res, 200, {
            calendars: await listCalendars(auth.getClient()),
          });
          return;
        }

        if (route === "/events") {
          if (method === "GET") {
            const timeMin = url.searchParams.get("timeMin");
            const timeMax = url.searchParams.get("timeMax");
            if (!timeMin || !timeMax) {
              throw new CalendarError("timeMin and timeMax are required");
            }
            sendJson(res, 200, {
              events: await listEvents(
                auth.getClient(),
                calendarId,
                timeMin,
                timeMax,
              ),
            });
            return;
          }
          if (method === "POST") {
            const input = parseEventInput(await readJsonBody(req));
            sendJson(res, 201, {
              event: await createEvent(auth.getClient(), calendarId, input),
            });
            return;
          }
          throw new CalendarError("Use GET or POST", 405);
        }

        if (route.startsWith(EVENTS_ROUTE)) {
          // Google event ids can carry characters that must survive the round
          // trip, so the path segment is decoded rather than used raw.
          const eventId = decodeURIComponent(route.slice(EVENTS_ROUTE.length));
          if (!eventId) throw new CalendarError("Missing event id", 404);

          if (method === "PATCH") {
            const body = (await readJsonBody(req)) as Record<string, unknown>;
            const recurringEventId =
              typeof body.recurringEventId === "string"
                ? body.recurringEventId
                : null;
            sendJson(res, 200, {
              event: await updateEvent(
                auth.getClient(),
                calendarId,
                targetEventId(eventId, scope, recurringEventId),
                parseEventInput(body),
              ),
            });
            return;
          }

          if (method === "DELETE") {
            await deleteEvent(
              auth.getClient(),
              calendarId,
              targetEventId(
                eventId,
                scope,
                url.searchParams.get("recurringEventId"),
              ),
            );
            sendJson(res, 200, { ok: true });
            return;
          }

          throw new CalendarError("Use PATCH or DELETE", 405);
        }

        throw new CalendarError(`Unknown route: ${url.pathname}`, 404);
      } catch (err) {
        sendError(res, err);
      }
    })();
  };
}

/**
 * Serves Google Calendar over `/api/calendar/*` from the Vite dev and preview
 * servers. The client secret and refresh token must never reach the browser, so
 * every Google call happens here and the bundle only ever sees the JSON.
 */
export function calendarApi(
  config: CalendarConfig,
  requireUser?: RequireUser,
): Plugin {
  const middleware = createCalendarMiddleware(config, requireUser);

  return {
    name: "crystal-os:calendar-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
