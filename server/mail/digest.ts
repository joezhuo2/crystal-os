import { classify } from "./classify";
import { extractOrderDetails } from "./details";
import type { MailAi } from "./ai";
import type { MailCache } from "./cache";
import type { MailStore } from "./store";
import type { FetchedMessage, MailDigest, MailItem, StoredAccount } from "./types";

const CACHE_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

export interface FetchRange {
  since: number;
  newest: number;
  known: ReadonlySet<string>;
}

export interface DigestDeps {
  store: MailStore;
  ai: MailAi;
  cache: MailCache;
  fetchAccount: (account: StoredAccount, range: FetchRange) => Promise<FetchedMessage[]>;
}

export function createDigest({ store, ai, cache, fetchAccount }: DigestDeps) {
  let last: { at: number; digest: MailDigest } | undefined;

  async function build(): Promise<MailDigest> {
    const accounts = await store.list();
    const { fetchDays, retainDays } = await cache.settings();
    const now = Date.now();
    const errors: MailDigest["errors"] = [];

    await Promise.all(
      accounts.map(async (account) => {
        try {
          const cached = await cache.messages(account.id);
          const range = {
            since: now - fetchDays * DAY_MS,
            newest: Math.max(0, ...cached.map((m) => Date.parse(m.receivedAt))),
            known: new Set(cached.map((m) => m.messageId)),
          };
          await cache.merge(account.id, await fetchAccount(account, range));
        } catch (err) {
          errors.push({
            accountId: account.id,
            account: account.email,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
    await cache.prune(
      accounts.map((a) => a.id),
      now - retainDays * DAY_MS,
    );

    const items: MailItem[] = [];
    const bodies = new Map<string, string>();
    for (const account of accounts) {
      for (const m of await cache.messages(account.id)) {
        const { category, confident, ...extras } = classify(m, new Date(m.receivedAt));
        if (!category) continue;
        const id = `${account.id}:${m.messageId}`;
        bodies.set(id, m.text ?? m.snippet);
        items.push({
          id,
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
    }

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

    for (const item of kept) {
      if (item.category !== "order") continue;
      const details = extractOrderDetails(item.subject, bodies.get(item.id) ?? "");
      if (details.length) item.details = details;
    }

    kept.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { generatedAt: new Date().toISOString(), items: kept, errors };
  }

  async function get(refresh = false): Promise<MailDigest> {
    if (!refresh && last && Date.now() - last.at < CACHE_MS) return last.digest;
    const digest = await build();
    last = { at: Date.now(), digest };
    return digest;
  }

  return {
    get,
    clear: () => {
      last = undefined;
    },
  };
}
