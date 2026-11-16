import { apiRequest } from "./apiRequest";

export const LOCAL_USER_ID = "local";

export type ImportCredentials = { refreshToken: string } | { email: string; password: string };

interface CachedSession {
  key: string;
  refreshToken: string;
  userId: string | null;
}

type Store = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export function cachedSupabaseSession(storage: Store = localStorage): CachedSession | null {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
    try {
      const session = JSON.parse(storage.getItem(key) ?? "null") as { refresh_token?: unknown; user?: { id?: unknown } } | null;
      if (typeof session?.refresh_token !== "string" || !session.refresh_token) continue;
      return { key, refreshToken: session.refresh_token, userId: typeof session.user?.id === "string" ? session.user.id : null };
    } catch {
      continue;
    }
  }
  return null;
}

export function adoptUserStorage(oldUserId: string, storage: Store = localStorage) {
  const suffix = `:${oldUserId}`;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (key): key is string => !!key && key.endsWith(suffix),
  );
  for (const key of keys) {
    const adopted = `${key.slice(0, -suffix.length)}:${LOCAL_USER_ID}`;
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(adopted) === null) storage.setItem(adopted, value);
  }
}

export async function fetchNeedsImport(): Promise<boolean> {
  const { needsImport } = await apiRequest<{ needsImport: boolean }>("/api/data/status");
  return needsImport;
}

function post(body: unknown) {
  return apiRequest<{ imported: number }>("/api/data/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function importData(credentials: ImportCredentials, storage: Store = localStorage): Promise<number> {
  const cached = cachedSupabaseSession(storage);
  const { imported } = await post(credentials);
  if (cached) {
    if (cached.userId) adoptUserStorage(cached.userId, storage);
    storage.removeItem(cached.key);
  }
  return imported;
}

export async function skipImport(): Promise<void> {
  await post({ skip: true });
}
