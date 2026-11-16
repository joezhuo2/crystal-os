import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export type AuthedUser = { id: string; email?: string };

/** Checks a bearer token. An interface so tests can supply a stub. */
export interface TokenVerifier {
  getUser(token: string): Promise<{
    data: { user: AuthedUser | null };
    error: { message: string } | null;
  }>;
}

export type RequireUser = (req: IncomingMessage) => Promise<AuthedUser | null>;

interface CacheEntry {
  user: AuthedUser;
  expiresAt: number;
}

export function readBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const match = /^Bearer\s+(.*)$/i.exec(header);
  if (!match) return null;

  return match[1].trim() || null;
}

/**
 * Builds the per-request authorization check used by both API plugins.
 *
 * Successful checks are cached briefly; rejections are never cached.
 */
export function createRequireUser(
  verifier: TokenVerifier,
  { ttlMs = 60_000, now = Date.now }: { ttlMs?: number; now?: () => number } = {},
): RequireUser {
  const cache = new Map<string, CacheEntry>();

  return async function requireUser(req) {
    const token = readBearerToken(req);
    if (!token) return null;

    const cached = cache.get(token);
    if (cached && cached.expiresAt > now()) return cached.user;

    const { data, error } = await verifier.getUser(token);
    if (error || !data.user) {
      cache.delete(token);
      return null;
    }

    const at = now();
    // Sweep expired entries on write so a long-lived server cannot accumulate
    // an unbounded map of rotated tokens.
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= at) cache.delete(key);
    }
    cache.set(token, { user: data.user, expiresAt: at + ttlMs });

    return data.user;
  };
}

export function createLocalVerifier(token: string): TokenVerifier {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const expected = digest(token);
  return {
    getUser: async (candidate) =>
      token && timingSafeEqual(digest(candidate), expected)
        ? { data: { user: { id: "local" } }, error: null }
        : { data: { user: null }, error: { message: "Invalid token" } },
  };
}
