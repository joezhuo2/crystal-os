import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { RequireUser } from "../auth/requireUser";
import { CalendarError as TradesError } from "../calendar/errors";
import { readJsonBody, sendJson } from "../calendar/plugin";
import { googleClient, searchGmail } from "../mail/google";
import { createMailStore } from "../mail/store";
import type { FetchedMessage, MailConfig, StoredAccount } from "../mail/types";
import { parseTradesCsv, parseWealthsimpleEmail } from "./parse";
import { createTradesStore, toTradesData } from "./store";
import type { Dividend, FxConversion, TradeEvent, TradeGrade, TradeJournal, TradesData } from "./types";

const ROUTE_PREFIX = "/api/trades";
const GMAIL_QUERY = 'from:wealthsimple.com subject:("your order has" OR "your funds have been converted" OR dividend)';
const SYNC_THROTTLE_MS = 60 * 1000;
const GMAIL_CONCURRENCY = 2;
const MAX_TEXT = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const MAX_CSV_CHARS = 4_000_000;
const MAX_CSV_BODY_BYTES = 5 * 1024 * 1024;

const STATUSES = ["filled", "partial", "cancelled", "expired", "rejected"];
const GRADES = ["A", "B", "C", "D", "F"];

type NewEvent = Omit<TradeEvent, "id" | "source">;

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof TradesError) {
    sendJson(res, err.status, { error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[trades] request failed:", message);
  sendJson(res, 500, { error: message });
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TradesError(`${what} must be a JSON object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, required: boolean, max = MAX_TEXT): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new TradesError(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "string" || value.length > max) throw new TradesError(`${name} must be a string up to ${max} characters`);
  return value;
}

function num(value: unknown, name: string, required: boolean, positive = false): number | undefined {
  if (value === undefined || value === null) {
    if (required) throw new TradesError(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
    throw new TradesError(`${name} must be a ${positive ? "positive " : ""}number`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, name: string, allowed: string[], required: boolean): T | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new TradesError(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value)) throw new TradesError(`${name} must be one of ${allowed.join(", ")}`);
  return value as T;
}

function validateEvent(raw: unknown): NewEvent {
  const b = asObject(raw, "Body");
  const time = new Date(text(b.time, "time", true, 64) as string);
  if (Number.isNaN(time.getTime())) throw new TradesError("time must be a valid date");
  const event: NewEvent = {
    status: oneOf<NewEvent["status"]>(b.status, "status", STATUSES, true) as NewEvent["status"],
    account: text(b.account, "account", true, 100) as string,
    side: oneOf<"buy" | "sell">(b.side, "side", ["buy", "sell"], true) as "buy" | "sell",
    orderType: text(b.orderType, "orderType", true, 100) as string,
    symbol: (text(b.symbol, "symbol", true, 20) as string).trim().toUpperCase(),
    quantity: num(b.quantity, "quantity", true, true) as number,
    currency: oneOf<"USD" | "CAD">(b.currency, "currency", ["USD", "CAD"], true) as "USD" | "CAD",
    time: time.toISOString(),
  };
  if (!event.symbol) throw new TradesError("symbol is required");
  const effect = oneOf<"open" | "close">(b.effect, "effect", ["open", "close"], false);
  if (effect) event.effect = effect;
  if (b.option !== undefined && b.option !== null) {
    const o = asObject(b.option, "option");
    const expiry = text(o.expiry, "option.expiry", true, 10) as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new TradesError("option.expiry must be YYYY-MM-DD");
    event.option = {
      strike: num(o.strike, "option.strike", true, true) as number,
      right: oneOf<"call" | "put">(o.right, "option.right", ["call", "put"], true) as "call" | "put",
      expiry,
    };
  }
  const ordered = num(b.orderedQuantity, "orderedQuantity", false, true);
  if (ordered !== undefined) event.orderedQuantity = ordered;
  const price = num(b.price, "price", false);
  if (price !== undefined) event.price = price;
  const total = num(b.total, "total", false);
  if (total !== undefined) event.total = total;
  const url = text(b.url, "url", false, 2000);
  if (url !== undefined) {
    if (!/^https?:\/\//i.test(url)) throw new TradesError("url must be http(s)");
    event.url = url;
  }
  return event;
}

function validateJournal(raw: unknown): Omit<TradeJournal, "updatedAt"> {
  const b = asObject(raw, "Body");
  const tagsRaw = b.tags ?? [];
  if (!Array.isArray(tagsRaw) || tagsRaw.length > MAX_TAGS) throw new TradesError(`tags must be a list of up to ${MAX_TAGS} strings`);
  const tags = tagsRaw.map((t) => {
    if (typeof t !== "string" || t.trim() === "" || t.length > MAX_TAG_LENGTH) throw new TradesError(`each tag must be 1-${MAX_TAG_LENGTH} characters`);
    return t.trim();
  });
  const journal: Omit<TradeJournal, "updatedAt"> = { tags };
  const thesis = text(b.thesis, "thesis", false);
  if (thesis !== undefined) journal.thesis = thesis;
  const review = text(b.review, "review", false);
  if (review !== undefined) journal.review = review;
  const target = num(b.target, "target", false);
  if (target !== undefined) journal.target = target;
  const stop = num(b.stop, "stop", false);
  if (stop !== undefined) journal.stop = stop;
  if (b.followedRules !== undefined && b.followedRules !== null) {
    if (typeof b.followedRules !== "boolean") throw new TradesError("followedRules must be true or false");
    journal.followedRules = b.followedRules;
  }
  const grade = oneOf<TradeGrade>(b.grade, "grade", GRADES, false);
  if (grade) journal.grade = grade;
  return journal;
}

export interface TradesMiddlewareOptions {
  fetchAccount?: (account: StoredAccount, known: ReadonlySet<string>) => Promise<FetchedMessage[]>;
}

export function createTradesMiddleware(
  config: MailConfig,
  requireUser?: RequireUser,
  opts: TradesMiddlewareOptions = {},
): Connect.NextHandleFunction {
  const rootDir = config.rootDir ?? process.cwd();
  const mailStore = createMailStore(rootDir);
  const store = createTradesStore(rootDir);
  const fetchAccount =
    opts.fetchAccount ??
    ((account, known) => searchGmail(googleClient(config, account.refreshToken), account.email, GMAIL_QUERY, known, GMAIL_CONCURRENCY));
  let inflight: Promise<void> | null = null;
  let errors: TradesData["errors"] = [];

  async function data(): Promise<TradesData> {
    const [state, accounts] = await Promise.all([store.read(), mailStore.list()]);
    return {
      ...toTradesData(state),
      syncing: inflight !== null,
      errors,
      connected: accounts.some((a) => a.provider === "google"),
    };
  }

  async function syncAccount(account: StoredAccount): Promise<void> {
    const known = new Set((await store.read()).known[account.id] ?? []);
    const messages = await fetchAccount(account, known);
    const events: TradeEvent[] = [];
    const fx: FxConversion[] = [];
    const dividends: Dividend[] = [];
    for (const m of messages) {
      const parsed = parseWealthsimpleEmail(m);
      if (parsed?.kind === "trade") events.push(parsed.event);
      else if (parsed?.kind === "fx") fx.push(parsed.fx);
      else if (parsed?.kind === "dividend") dividends.push(parsed.dividend);
    }
    await store.update((s) => {
      const ids = new Set(s.events.map((e) => e.id));
      const fxIds = new Set(s.fx.map((f) => f.id));
      const dividendIds = new Set(s.dividends.map((d) => d.id));
      s.events.push(...events.filter((e) => !ids.has(e.id)));
      s.fx.push(...fx.filter((f) => !fxIds.has(f.id)));
      s.dividends.push(...dividends.filter((d) => !dividendIds.has(d.id)));
      s.known[account.id] = [...new Set([...(s.known[account.id] ?? []), ...messages.map((m) => m.messageId)])];
    });
  }

  async function runSync(): Promise<void> {
    const found: TradesData["errors"] = [];
    for (const account of (await mailStore.list()).filter((a) => a.provider === "google")) {
      try {
        await syncAccount(account);
      } catch (err) {
        found.push({ account: account.email, message: err instanceof Error ? err.message : String(err) });
      }
    }
    errors = found;
    await store.update((s) => {
      s.lastSync = new Date().toISOString();
    });
  }

  async function sync(): Promise<TradesData> {
    if (!inflight) {
      const { lastSync } = await store.read();
      if (lastSync && Date.now() - Date.parse(lastSync) < SYNC_THROTTLE_MS) return data();
      inflight ??= runSync().finally(() => {
        inflight = null;
      });
    }
    await inflight;
    return data();
  }

  function eventId(route: string, prefix: string): string {
    const id = decodeURIComponent(route.slice(prefix.length));
    if (!id || id.length > 200) throw new TradesError("Invalid id");
    return id;
  }

  return (req, res, next) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(ROUTE_PREFIX)) return next();

    void (async () => {
      const route = new URL(rawUrl, "http://localhost").pathname.slice(ROUTE_PREFIX.length) || "/";
      const method = (req.method ?? "GET").toUpperCase();

      try {
        if (!requireUser) throw new TradesError("Auth is not configured on the server", 503);
        if (!(await requireUser(req))) throw new TradesError("Unauthorized", 401);

        if (route === "/") {
          if (method !== "GET") throw new TradesError("Use GET", 405);
          sendJson(res, 200, await data());
          return;
        }

        if (route === "/sync") {
          if (method !== "POST") throw new TradesError("Use POST", 405);
          sendJson(res, 200, await sync());
          return;
        }

        if (route === "/events") {
          if (method !== "POST") throw new TradesError("Use POST", 405);
          const event: TradeEvent = { ...validateEvent(await readJsonBody(req)), id: `manual:${randomUUID()}`, source: "manual" };
          await store.update((s) => {
            s.events.push(event);
          });
          sendJson(res, 200, await data());
          return;
        }

        if (route.startsWith("/events/")) {
          const id = eventId(route, "/events/");
          if (method !== "PUT" && method !== "DELETE") throw new TradesError("Use PUT or DELETE", 405);
          const edited = method === "PUT" ? validateEvent(await readJsonBody(req)) : null;
          await store.update((s) => {
            const index = s.events.findIndex((e) => e.id === id);
            if (index < 0) throw new TradesError("Unknown event", 404);
            const original = s.events[index];
            if (original.source === "manual") {
              if (edited) s.events[index] = { ...edited, id, source: "manual" };
              else s.events.splice(index, 1);
            } else s.edits[id] = edited && { ...edited, id, source: original.source };
          });
          sendJson(res, 200, await data());
          return;
        }

        if (route.startsWith("/journal/")) {
          const id = eventId(route, "/journal/");
          if (method !== "PUT") throw new TradesError("Use PUT", 405);
          const journal = validateJournal(await readJsonBody(req));
          const empty = Object.keys(journal).every((k) => k === "tags") && journal.tags.length === 0;
          await store.update((s) => {
            if (empty) delete s.journal[id];
            else s.journal[id] = { ...journal, updatedAt: new Date().toISOString() };
          });
          sendJson(res, 200, await data());
          return;
        }

        if (route === "/import") {
          if (method !== "POST") throw new TradesError("Use POST", 405);
          const body = asObject(await readJsonBody(req, MAX_CSV_BODY_BYTES), "Body");
          const csv = text(body.csv, "csv", true, MAX_CSV_CHARS) as string;
          const parsed = parseTradesCsv(csv);
          const { imported, paid, duplicates } = await store.update((s) => {
            const ids = new Set([...s.events, ...s.dividends].map((e) => e.id));
            const fresh = parsed.events.filter((e) => !ids.has(e.id));
            const freshDividends = parsed.dividends.filter((d) => !ids.has(d.id));
            s.events.push(...fresh);
            s.dividends.push(...freshDividends);
            return {
              imported: fresh.length,
              paid: freshDividends.length,
              duplicates: parsed.events.length + parsed.dividends.length - fresh.length - freshDividends.length,
            };
          });
          sendJson(res, 200, { ...(await data()), imported, dividends_imported: paid, skipped: parsed.skipped + duplicates });
          return;
        }

        throw new TradesError(`Unknown route: ${ROUTE_PREFIX}${route}`, 404);
      } catch (err) {
        sendError(res, err);
      }
    })();
  };
}

export function tradesApi(config: MailConfig, requireUser?: RequireUser): Plugin {
  const middleware = createTradesMiddleware(config, requireUser);
  return {
    name: "crystal-os:trades-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
