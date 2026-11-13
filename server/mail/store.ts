import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MailProvider, StoredAccount } from "./types";

const FILE = "mail-accounts.json";

function isAccount(value: unknown): value is StoredAccount {
  const a = value as Record<string, unknown> | null;
  return (
    !!a &&
    typeof a.id === "string" &&
    (a.provider === "google" || a.provider === "microsoft") &&
    typeof a.email === "string" &&
    typeof a.refreshToken === "string"
  );
}

export function createMailStore(rootDir: string) {
  const file = path.join(rootDir, FILE);
  let queue: Promise<unknown> = Promise.resolve();

  async function list(): Promise<StoredAccount[]> {
    let raw: string;
    try {
      raw = await readFile(file, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.accounts) ? parsed.accounts.filter(isAccount) : [];
    } catch {
      return [];
    }
  }

  function update<T>(fn: (accounts: StoredAccount[]) => { accounts: StoredAccount[]; result: T }): Promise<T> {
    const run = queue.then(async () => {
      const { accounts, result } = fn(await list());
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify({ accounts }, null, 2), { encoding: "utf-8", mode: 0o600 });
      await rename(tmp, file);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  function upsert(provider: MailProvider, email: string, refreshToken: string): Promise<StoredAccount> {
    return update((accounts) => {
      const existing = accounts.find(
        (a) => a.provider === provider && a.email.toLowerCase() === email.toLowerCase(),
      );
      const account = { id: existing?.id ?? randomUUID(), provider, email, refreshToken };
      return {
        accounts: existing ? accounts.map((a) => (a === existing ? account : a)) : [...accounts, account],
        result: account,
      };
    });
  }

  function setToken(id: string, refreshToken: string): Promise<void> {
    return update((accounts) => ({
      accounts: accounts.map((a) => (a.id === id ? { ...a, refreshToken } : a)),
      result: undefined,
    }));
  }

  function remove(id: string): Promise<StoredAccount | null> {
    return update((accounts) => ({
      accounts: accounts.filter((a) => a.id !== id),
      result: accounts.find((a) => a.id === id) ?? null,
    }));
  }

  return { list, upsert, setToken, remove };
}

export type MailStore = ReturnType<typeof createMailStore>;
