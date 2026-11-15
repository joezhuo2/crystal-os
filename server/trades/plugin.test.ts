import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Connect } from "vite";
import { createMailStore } from "../mail/store";
import type { FetchedMessage } from "../mail/types";
import { createTradesMiddleware } from "./plugin";
import type { TradeEvent, TradesData } from "./types";

let server: Server;
let base: string;
let dir: string;
const clock = { offset: 0 };
const fetchAccount = vi.fn<(account: unknown, known: ReadonlySet<string>) => Promise<FetchedMessage[]>>();

const message = (id: string, subject: string, lines: string[]): FetchedMessage => ({
  messageId: id,
  from: "Wealthsimple",
  fromAddress: "notifications@example.invalid",
  subject,
  snippet: "",
  text: [subject, ...lines].join("\n"),
  receivedAt: "2026-10-30T12:00:00.000Z",
  url: `https://mail.example/${id}`,
});

const FILL = message("g1", "Your order has been filled", [
  "Account: TFSA",
  "Type: Limit Buy",
  "Symbol: AAA",
  "Shares: 2",
  "Average price: US$10.00",
  "Total cost: US$20.00",
  "Time: October 30, 2026 08:14 EDT",
]);
const FX = message("g2", "Your funds have been converted", ["Account: TFSA (******X1)", "Amount submitted: $100.00 CAD", "Amount received: 70.00 USD"]);

beforeAll(async () => {
  const realNow = Date.now;
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + clock.offset);
  dir = await mkdtemp(path.join(tmpdir(), "trades-plugin-"));
  await createMailStore(dir).upsert("google", "me@example.invalid", "rt");
  const middleware = createTradesMiddleware(
    { rootDir: dir },
    async (req) => (req.headers.authorization === "Bearer ok" ? { id: "u" } : null),
    { fetchAccount },
  );
  server = createServer((req, res) => middleware(req as Connect.IncomingMessage, res, () => res.end()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/trades`;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

const headers = { authorization: "Bearer ok", "content-type": "application/json" };
const call = (method: string, route: string, body?: unknown) =>
  fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async <T = TradesData>(res: Response) => (await res.json()) as T;

const manual = {
  status: "filled",
  account: "TFSA",
  side: "buy",
  orderType: "Limit",
  symbol: "bbb",
  quantity: 3,
  price: 5,
  currency: "CAD",
  time: "2026-10-01T10:00:00Z",
};

describe("trades middleware", () => {
  it("requires a user on every route", async () => {
    for (const [method, route] of [["GET", ""], ["POST", "/sync"], ["POST", "/events"], ["PUT", "/events/x"], ["DELETE", "/events/x"], ["PUT", "/journal/x"], ["POST", "/import"]]) {
      expect((await fetch(`${base}${route}`, { method })).status).toBe(401);
    }
  });

  it("starts empty and connected", async () => {
    expect(await json(await call("GET", ""))).toEqual({ events: [], fx: [], journal: {}, lastSync: null, syncing: false, errors: [], connected: true });
  });

  it("answers unknown routes and wrong methods", async () => {
    expect((await call("GET", "/nope")).status).toBe(404);
    expect((await call("GET", "/sync")).status).toBe(405);
  });

  it("rejects bad event bodies", async () => {
    for (const bad of [
      { ...manual, status: "done" },
      { ...manual, quantity: "3" },
      { ...manual, quantity: 0 },
      { ...manual, price: "5" },
      { ...manual, currency: "EUR" },
      { ...manual, time: "never" },
      { ...manual, symbol: "" },
      { ...manual, account: "x".repeat(101) },
      { ...manual, option: { strike: 1, right: "put", expiry: "soon" } },
      { ...manual, url: "javascript:alert(1)" },
      "nope",
    ]) {
      expect((await call("POST", "/events", bad)).status).toBe(400);
    }
    expect((await json(await call("GET", ""))).events).toEqual([]);
  });

  it("adds, edits and deletes a manual event", async () => {
    const added = await json(await call("POST", "/events", { ...manual, extra: "ignored" }));
    const [event] = added.events;
    expect(event).toMatchObject({ source: "manual", symbol: "BBB", time: "2026-10-01T10:00:00.000Z" });
    expect(event.id).toMatch(/^manual:/);
    expect(event).not.toHaveProperty("extra");

    const edited = await json(await call("PUT", `/events/${encodeURIComponent(event.id)}`, { ...manual, quantity: 4 }));
    expect(edited.events).toHaveLength(1);
    expect(edited.events[0]).toMatchObject({ id: event.id, source: "manual", quantity: 4 });

    expect((await call("PUT", "/events/missing", manual)).status).toBe(404);
    expect((await json(await call("DELETE", `/events/${encodeURIComponent(event.id)}`))).events).toEqual([]);
  });

  it("syncs emails, throttles within 60 seconds and ignores known ids afterwards", async () => {
    fetchAccount.mockResolvedValueOnce([FILL, FX, message("g3", "Your statement is ready", ["Hello"])]);
    const first = await json(await call("POST", "/sync"));
    expect(first.events).toMatchObject([{ id: "g1", source: "email", symbol: "AAA", total: 20, currency: "USD", time: "2026-10-30T12:14:00.000Z" }]);
    expect(first.fx).toMatchObject([{ id: "g2", account: "TFSA", fromAmount: 100, toAmount: 70 }]);
    expect(first.lastSync).not.toBeNull();
    expect(first.errors).toEqual([]);

    const again = await json(await call("POST", "/sync"));
    expect(fetchAccount).toHaveBeenCalledTimes(1);
    expect(again.events).toHaveLength(1);

    clock.offset += 61_000;
    fetchAccount.mockResolvedValueOnce([]);
    await call("POST", "/sync");
    expect(fetchAccount).toHaveBeenCalledTimes(2);
    expect([...(fetchAccount.mock.calls[1][1] as Set<string>)].sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("runs one sync at a time and reports a failing account without failing the request", async () => {
    clock.offset += 61_000;
    let release: (m: FetchedMessage[]) => void = () => undefined;
    fetchAccount.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const a = call("POST", "/sync");
    const b = call("POST", "/sync");
    await vi.waitFor(() => expect(fetchAccount).toHaveBeenCalledTimes(3));
    expect((await json(await call("GET", ""))).syncing).toBe(true);
    release([]);
    expect((await json(await a)).syncing).toBe(false);
    await b;
    expect(fetchAccount).toHaveBeenCalledTimes(3);

    clock.offset += 61_000;
    fetchAccount.mockRejectedValueOnce(new Error("Quota exceeded"));
    const failed = await call("POST", "/sync");
    expect(failed.status).toBe(200);
    expect((await json(failed)).errors).toEqual([{ account: "me@example.invalid", message: "Quota exceeded" }]);
  });

  it("hides and edits an email event through overrides", async () => {
    const edited = await json(await call("PUT", "/events/g1", { ...manual, symbol: "AAA", quantity: 9 }));
    expect(edited.events.find((e: TradeEvent) => e.id === "g1")).toMatchObject({ source: "email", quantity: 9 });
    const hidden = await json(await call("DELETE", "/events/g1"));
    expect(hidden.events.find((e: TradeEvent) => e.id === "g1")).toBeUndefined();
  });

  it("stores and clears a journal and validates it", async () => {
    const key = encodeURIComponent("manual:abc");
    const saved = await json(await call("PUT", `/journal/${key}`, { thesis: "breakout", target: 12, followedRules: false, grade: "B", tags: [" fomo ", "earnings"] }));
    expect(saved.journal["manual:abc"]).toMatchObject({ thesis: "breakout", target: 12, followedRules: false, grade: "B", tags: ["fomo", "earnings"] });
    expect(typeof saved.journal["manual:abc"].updatedAt).toBe("string");

    for (const bad of [{ grade: "Z" }, { tags: "x" }, { tags: Array(21).fill("t") }, { tags: ["x".repeat(41)] }, { thesis: "x".repeat(5001) }, { target: "1" }, { followedRules: "yes" }]) {
      expect((await call("PUT", `/journal/${key}`, bad)).status).toBe(400);
    }
    expect((await json(await call("PUT", `/journal/${key}`, { tags: [] }))).journal).toEqual({});
  });

  it("imports a CSV once and counts skipped rows", async () => {
    const csv = ["date,account,side,symbol,quantity,price,currency", "2026-09-01,TFSA,buy,CCC,1,2,USD", "2026-09-02,TFSA,hold,CCC,1,2,USD"].join("\n");
    const first = await json<TradesData & { imported: number; skipped: number }>(await call("POST", "/import", { csv }));
    expect([first.imported, first.skipped]).toEqual([1, 1]);
    expect(first.events.filter((e) => e.source === "csv")).toHaveLength(1);
    const second = await json<TradesData & { imported: number; skipped: number }>(await call("POST", "/import", { csv }));
    expect([second.imported, second.skipped]).toEqual([0, 2]);
    expect((await call("POST", "/import", {})).status).toBe(400);
  });
});
