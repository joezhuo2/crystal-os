import { classify } from "./classify";
import type { MailAi } from "./ai";
import type { MailStore } from "./store";
import type { FetchedMessage, MailDigest, MailItem, StoredAccount } from "./types";

const CACHE_MS = 5 * 60 * 1000;

export interface DigestDeps {
  store: MailStore;
  ai: MailAi;
  fetchAccount: (account: StoredAccount, days: number) => Promise<FetchedMessage[]>;
}

export function createDigest({ store, ai, fetchAccount }: DigestDeps) {
  const cache = new Map<number, { at: number; digest: MailDigest }>();

  async function build(days: number): Promise<MailDigest> {
    const accounts = await store.list();
    const errors: MailDigest["errors"] = [];
    const items: MailItem[] = [];

    await Promise.all(
      accounts.map(async (account) => {
        try {
          for (const m of await fetchAccount(account, days)) {
            const { category, confident, ...extras } = classify(m, new Date(m.receivedAt));
            if (!category) continue;
            items.push({
              id: `${account.id}:${m.messageId}`,
              accountId: account.id,
              provider: account.provider,
              account: account.email,
              category,
              confident,
              classifiedBy: "rules",
              from: m.from,
              fromAddress: m.fromAddress,
              subject: m.subject,
              snippet: m.snippet,
              receivedAt: m.receivedAt,
              url: m.url,
              ...extras,
            });
          }
        } catch (err) {
          errors.push({
            accountId: account.id,
            account: account.email,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    const unsure = items.filter((item) => !item.confident);
    const verdicts = await ai.classify(unsure);
    const kept = items.flatMap((item): MailItem[] => {
      const verdict = verdicts.get(item.id);
      if (!verdict) return [item];
      if (!verdict.category) return [];
      const { amount, dueDate, company, jobStatus, ...rest } = item;
      const rules = verdict.category === item.category ? { amount, dueDate, company, jobStatus } : {};
      return [{ ...rest, ...rules, ...verdict, category: verdict.category, confident: true, classifiedBy: "ai" }];
    });

    kept.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { generatedAt: new Date().toISOString(), items: kept, errors };
  }

  async function get(days: number, refresh = false): Promise<MailDigest> {
    const hit = cache.get(days);
    if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.digest;
    const digest = await build(days);
    cache.set(days, { at: Date.now(), digest });
    return digest;
  }

  return { get, clear: () => cache.clear() };
}
