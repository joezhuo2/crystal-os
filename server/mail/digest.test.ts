import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailAi } from "./ai";
import { createMailCache } from "./cache";
import { createDigest, type FetchRange } from "./digest";
import type { MailStore } from "./store";
import type { FetchedMessage, StoredAccount } from "./types";

const accounts: StoredAccount[] = [
  { id: "g", provider: "google", email: "me@gmail.com", refreshToken: "x" },
  { id: "m", provider: "microsoft", email: "me@outlook.com", refreshToken: "y" },
];
const store = { list: async () => accounts } as unknown as MailStore;

const msg = (messageId: string, subject: string, snippet: string, receivedAt: string): FetchedMessage => ({
  messageId,
  from: "Shop",
  fromAddress: "hello@shop.com",
  subject,
  snippet,
  receivedAt,
  url: `https://mail/${messageId}`,
});

const tmpCache = () => createMailCache(mkdtempSync(path.join(tmpdir(), "mail-digest-")));
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

afterEach(() => vi.unstubAllGlobals());

describe("digest", () => {
  it("keeps working when one account throws, drops unclassified mail and sorts newest first", async () => {
    const fetchAccount = vi.fn(async (account: StoredAccount) => {
      if (account.id === "m") throw new Error("Microsoft sign-in failed: invalid_grant");
      return [
        msg("1", "Your order has shipped", "Track your package", daysAgo(5)),
        msg("2", "Lunch?", "", daysAgo(1)),
        msg("3", "Security alert", "New sign-in from Chrome", daysAgo(3)),
      ];
    });
    const digest = createDigest({ store, ai: createMailAi(undefined), cache: tmpCache(), fetchAccount });

    const result = await digest.get();
    expect(result.items.map((i) => i.id)).toEqual(["g:3", "g:1"]);
    expect(result.items[1]).toMatchObject({ category: "order", account: "me@gmail.com", classifiedBy: "rules" });
    expect(result.errors).toEqual([
      { accountId: "m", account: "me@outlook.com", message: "Microsoft sign-in failed: invalid_grant" },
    ]);

    await digest.get();
    expect(fetchAccount).toHaveBeenCalledTimes(2);
    await digest.get(true);
    expect(fetchAccount).toHaveBeenCalledTimes(4);
  });

  it("falls back to the rules guess when AI fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const digest = createDigest({
      store: { list: async () => [accounts[0]] } as unknown as MailStore,
      ai: createMailAi("key"),
      cache: tmpCache(),
      fetchAccount: async () => [msg("1", "Re: the invoice", "see attached", daysAgo(5))],
    });
    const result = await digest.get();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ category: "bill", confident: false, classifiedBy: "rules" });
  });

  it("applies AI verdicts to unsure items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ content: [{ type: "text", text: '[{"i":0,"category":"none"},{"i":1,"category":"bill","amount":"$9"}]' }] })),
      ),
    );
    const digest = createDigest({
      store: { list: async () => [accounts[0]] } as unknown as MailStore,
      ai: createMailAi("key"),
      cache: tmpCache(),
      fetchAccount: async () => [
        msg("1", "Order and invoice", "", daysAgo(4)),
        msg("2", "Re: the invoice", "", daysAgo(5)),
      ],
    });
    const result = await digest.get();
    expect(result.items).toEqual([
      expect.objectContaining({ id: "g:2", category: "bill", confident: true, classifiedBy: "ai", amount: "$9" }),
    ]);
  });

  it("only asks for mail newer than the cache, keeps older mail, and drops it after the retention period", async () => {
    const cache = tmpCache();
    const one = { list: async () => [accounts[0]] } as unknown as MailStore;
    const old = daysAgo(40);
    const recent = daysAgo(2);
    const fetchAccount = vi
      .fn<(account: StoredAccount, range: FetchRange) => Promise<FetchedMessage[]>>()
      .mockResolvedValueOnce([msg("1", "Your order has shipped", "", old), msg("2", "Security alert", "New sign-in", recent)])
      .mockResolvedValue([]);
    const digest = createDigest({ store: one, ai: createMailAi(undefined), cache, fetchAccount });

    await digest.get();
    expect(fetchAccount.mock.calls[0][1].since).toBeLessThan(Date.parse(daysAgo(29)));
    expect(fetchAccount.mock.calls[0][1].known.size).toBe(0);
    const second = await digest.get(true);
    expect([...fetchAccount.mock.calls[1][1].known].sort()).toEqual(["1", "2"]);
    expect(fetchAccount.mock.calls[1][1].newest).toBe(Date.parse(recent));
    expect(second.items.map((i) => i.id)).toEqual(["g:2", "g:1"]);

    await cache.setSettings({ fetchDays: 7, retainDays: 30 });
    expect((await digest.get(true)).items.map((i) => i.id)).toEqual(["g:2"]);
  });

  it("serves cached mail when a refresh fails and adds order details from the body", async () => {
    const fetchAccount = vi
      .fn<(account: StoredAccount, range: FetchRange) => Promise<FetchedMessage[]>>()
      .mockResolvedValueOnce([
        {
          ...msg("1", "Your order has shipped", "Track your package", daysAgo(1)),
          text: ["Order #112-5550001-2223334", "2 x Blue Widget", "Order total: $41.50", "Arriving Friday, November 20", "Shipped with UPS, tracking number 1Z999AA10123456784"].join("\n"),
        },
      ])
      .mockRejectedValue(new Error("offline"));
    const digest = createDigest({
      store: { list: async () => [accounts[0]] } as unknown as MailStore,
      ai: createMailAi(undefined),
      cache: tmpCache(),
      fetchAccount,
    });
    await digest.get();
    const result = await digest.get(true);
    expect(result.errors).toHaveLength(1);
    expect(result.items[0].details).toEqual([
      { label: "Status", value: "Shipped" },
      { label: "Order number", value: "112-5550001-2223334" },
      { label: "Total", value: "$41.50" },
      { label: "Arriving", value: "Friday, November 20" },
      { label: "Carrier", value: "UPS" },
      { label: "Tracking", value: "1Z999AA10123456784" },
      { label: "Items", value: "2 × Blue Widget" },
    ]);
    expect(JSON.stringify(result)).not.toContain("Order total");
  });
});
