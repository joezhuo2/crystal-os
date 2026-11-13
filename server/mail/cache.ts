import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FetchedMessage, MailCacheSettings } from "./types";

const FILE = "mail-cache.json";
export const DEFAULT_CACHE_SETTINGS: MailCacheSettings = { fetchDays: 30, retainDays: 90 };
const MAX_FETCH_DAYS = 90;
const MAX_RETAIN_DAYS = 365;

interface CacheState {
  settings: MailCacheSettings;
  accounts: Record<string, FetchedMessage[]>;
}

const clampDays = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function normalizeCacheSettings(raw: Partial<Record<keyof MailCacheSettings, unknown>>, base = DEFAULT_CACHE_SETTINGS): MailCacheSettings {
  const fetchDays = clampDays(raw.fetchDays, base.fetchDays, 1, MAX_FETCH_DAYS);
  return { fetchDays, retainDays: clampDays(raw.retainDays, Math.max(base.retainDays, fetchDays), fetchDays, MAX_RETAIN_DAYS) };
}

export function createMailCache(rootDir: string) {
  const file = path.join(rootDir, FILE);
  let state: CacheState | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<CacheState> {
    if (state) return state;
    let parsed: Partial<CacheState> = {};
    try {
      parsed = JSON.parse(await readFile(file, "utf-8")) ?? {};
    } catch {
      parsed = {};
    }
    const accounts: CacheState["accounts"] = {};
    for (const [id, messages] of Object.entries(parsed.accounts ?? {})) {
      if (Array.isArray(messages)) accounts[id] = messages.filter((m) => typeof m?.messageId === "string" && typeof m.receivedAt === "string");
    }
    state ??= { settings: normalizeCacheSettings(parsed.settings ?? {}), accounts };
    return state;
  }

  function save(): Promise<void> {
    const run = queue.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(await load()), { encoding: "utf-8", mode: 0o600 });
      await rename(tmp, file);
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    settings: async () => (await load()).settings,
    async setSettings(raw: Partial<Record<keyof MailCacheSettings, unknown>>): Promise<MailCacheSettings> {
      const s = await load();
      s.settings = normalizeCacheSettings(raw, s.settings);
      await save();
      return s.settings;
    },
    messages: async (accountId: string) => (await load()).accounts[accountId] ?? [],
    async merge(accountId: string, fresh: FetchedMessage[]): Promise<void> {
      const s = await load();
      const byId = new Map((s.accounts[accountId] ?? []).map((m) => [m.messageId, m]));
      for (const m of fresh) byId.set(m.messageId, m);
      s.accounts[accountId] = [...byId.values()];
    },
    async prune(accountIds: string[], olderThan: number): Promise<void> {
      const s = await load();
      const keep = new Set(accountIds);
      for (const id of Object.keys(s.accounts)) {
        if (!keep.has(id)) delete s.accounts[id];
        else s.accounts[id] = s.accounts[id].filter((m) => Date.parse(m.receivedAt) >= olderThan);
      }
      await save();
    },
  };
}

export type MailCache = ReturnType<typeof createMailCache>;
