import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailAi } from "./ai";
import { createDigest } from "./digest";
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

afterEach(() => vi.unstubAllGlobals());

describe("digest", () => {
  it("keeps working when one account throws, drops unclassified mail and sorts newest first", async () => {
    const fetchAccount = vi.fn(async (account: StoredAccount) => {
      if (account.id === "m") throw new Error("Microsoft sign-in failed: invalid_grant");
      return [
        msg("1", "Your order has shipped", "Track your package", "2026-11-01T00:00:00.000Z"),
        msg("2", "Lunch?", "", "2026-11-05T00:00:00.000Z"),
        msg("3", "Security alert", "New sign-in from Chrome", "2026-11-03T00:00:00.000Z"),
      ];
    });
    const digest = createDigest({ store, ai: createMailAi(undefined), fetchAccount });

    const result = await digest.get(30);
    expect(result.items.map((i) => i.id)).toEqual(["g:3", "g:1"]);
    expect(result.items[1]).toMatchObject({ category: "order", account: "me@gmail.com", classifiedBy: "rules" });
    expect(result.errors).toEqual([
      { accountId: "m", account: "me@outlook.com", message: "Microsoft sign-in failed: invalid_grant" },
    ]);

    await digest.get(30);
    expect(fetchAccount).toHaveBeenCalledTimes(2);
    await digest.get(30, true);
    expect(fetchAccount).toHaveBeenCalledTimes(4);
  });

  it("falls back to the rules guess when AI fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const digest = createDigest({
      store: { list: async () => [accounts[0]] } as unknown as MailStore,
      ai: createMailAi("key"),
      fetchAccount: async () => [msg("1", "Re: the invoice", "see attached", "2026-11-01T00:00:00.000Z")],
    });
    const result = await digest.get(30);
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
      fetchAccount: async () => [
        msg("1", "Order and invoice", "", "2026-11-02T00:00:00.000Z"),
        msg("2", "Re: the invoice", "", "2026-11-01T00:00:00.000Z"),
      ],
    });
    const result = await digest.get(30);
    expect(result.items).toEqual([
      expect.objectContaining({ id: "g:2", category: "bill", confident: true, classifiedBy: "ai", amount: "$9" }),
    ]);
  });
});
