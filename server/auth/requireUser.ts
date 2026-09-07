import type { IncomingMessage } from "node:http";
import { createClient } from "@supabase/supabase-js";

export type AuthedUser = { id: string; email?: string };

/**
 * The slice of the Supabase client this module needs. Narrowed to an interface
 * so tests can supply a stub and run without network access.
 */
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
 * Validation goes through Supabase rather than local signature verification so
 * this stays correct whether the project signs with a symmetric secret or an
 * asymmetric key. Because that is a network round trip, successful validations
 * are cached briefly — vault browsing issues many requests in quick succession
 * and should not pay for a round trip each time. Rejections are never cached.
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

/** The production verifier, backed by the project's anon key. */
export function createSupabaseVerifier(url: string, anonKey: string): TokenVerifier {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    getUser: (token) => client.auth.getUser(token) as ReturnType<TokenVerifier["getUser"]>,
  };
}
