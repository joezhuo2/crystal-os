import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTradesStore, toTradesData } from "./store";
import type { TradeEvent } from "./types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "trades-store-"));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

const event = (id: string, time: string): TradeEvent => ({
  id,
  source: "email",
  status: "filled",
  account: "TFSA",
  side: "buy",
  orderType: "Limit",
  symbol: "AAA",
  quantity: 1,
  currency: "USD",
  time,
});

describe("trades store", () => {
  it("starts empty and round-trips updates", async () => {
    const store = createTradesStore(dir);
    expect(await store.read()).toEqual({ known: {}, events: [], fx: [], dividends: [], edits: {}, journal: {}, lastSync: null });

    await store.update((s) => {
      s.events.push(event("a", "2026-10-01T00:00:00.000Z"));
      s.known.acct = ["a"];
    });
    const fresh = await createTradesStore(dir).read();
    expect(fresh.events).toHaveLength(1);
    expect(fresh.known).toEqual({ acct: ["a"] });
    expect(JSON.parse(await readFile(path.join(dir, "trades.json"), "utf-8")).events).toHaveLength(1);
  });

  it("serializes concurrent updates", async () => {
    const store = createTradesStore(dir);
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.update((s) => void s.events.push(event(`e${i}`, "2026-10-01T00:00:00.000Z")))));
    expect((await store.read()).events).toHaveLength(10);
  });

  it("does not write when the update throws, and keeps working", async () => {
    const store = createTradesStore(dir);
    await expect(
      store.update(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await store.update((s) => void s.events.push(event("a", "2026-10-01T00:00:00.000Z")));
    expect((await store.read()).events).toHaveLength(1);
  });

  it("treats a corrupt file as empty", async () => {
    await writeFile(path.join(dir, "trades.json"), "{not json");
    expect((await createTradesStore(dir).read()).events).toEqual([]);
  });

  it("applies edits, hides hidden events and sorts by time", () => {
    const edited = { ...event("b", "2026-10-03T00:00:00.000Z"), quantity: 5 };
    const view = toTradesData({
      known: {},
      events: [event("c", "2026-10-04T00:00:00.000Z"), event("b", "2026-10-02T00:00:00.000Z"), event("a", "2026-10-01T00:00:00.000Z"), event("gone", "2026-10-05T00:00:00.000Z")],
      fx: [],
      dividends: [],
      edits: { b: edited, gone: null },
      journal: {},
      lastSync: null,
    });
    expect(view.events.map((e) => [e.id, e.quantity])).toEqual([
      ["a", 1],
      ["b", 5],
      ["c", 1],
    ]);
  });
});
