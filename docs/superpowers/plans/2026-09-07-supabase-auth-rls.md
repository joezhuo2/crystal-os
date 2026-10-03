# Supabase Auth + RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every piece of Crystal OS data behind an authenticated session — the five Supabase tables via Row Level Security, and the Obsidian vault and Google Calendar HTTP routes via a bearer-token check — so the repository can be published safely.

**Architecture:** Authentication is added as a layer above the existing data layer rather than woven through it. A dedicated `AuthContext` owns the session and nothing else; `AppProvider` becomes a consumer that refuses to fetch until a session exists. On the server, one `requireUser` helper sits in front of both existing Vite middleware plugins without altering their routing logic. Database isolation is enforced by RLS policies on `auth.uid()`, so the client's queries stay almost entirely unchanged.

**Tech Stack:** React 18, TypeScript, Vite 5 (middleware plugins), `@supabase/supabase-js` 2.97, TanStack Query 5, Vitest 3 (jsdom), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-07-supabase-auth-rls-design.md`

## Global Constraints

- Exactly one user account. Signups stay disabled in the Supabase dashboard; there is no registration UI.
- Sign-in is email + password only. No magic link, no OAuth, no password reset UI.
- All five tables (`tasks`, `transactions`, `task_categories`, `financial_categories`, `settings`) carry `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, RLS enabled, four policies each on `auth.uid() = user_id`.
- `update` policies declare **both** `using` and `with check`. Omitting `with check` would let a row's `user_id` be rewritten.
- `category_id` foreign keys are `on delete set null`, never `cascade`.
- `settings` has no `id` column; its primary key is `(user_id, key)`.
- `/api/calendar/auth/callback` is the **only** route exempt from `requireUser`.
- Access tokens are read at call time via `supabase.auth.getSession()`, never captured at mount and never placed in a react-query `queryKey`.
- `server.host` is `"127.0.0.1"`. Correct only while the project runs natively on host hardware.
- No new runtime dependencies. `@supabase/supabase-js` and `dotenv` are already present.
- Existing 76 tests must stay green throughout.

## Prerequisite (human, not agent)

Tasks 1–8 are all implementable and unit-testable without a live database. Three steps require the Supabase dashboard and must be done by the repository owner before Task 9's live verification:

1. Create the new Supabase project; record its URL and anon key into `.env.local`.
2. Authentication → Providers → disable new user signups.
3. Authentication → Users → add one user (email + password).

**Do not delete the old Supabase project until Task 1 is complete** — Task 1 needs it to confirm column types.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0001_auth_and_rls.sql` | Create all five tables with `user_id`, RLS, policies, indexes |
| `scripts/verify-rls.ts` | Prove `anon` reads zero rows and cannot insert |
| `server/auth/requireUser.ts` | Bearer token extraction, verification, 60s cache |
| `server/auth/requireUser.test.ts` | Unit tests for the above |
| `server/obsidian/plugin.ts` | Modified: gate all routes |
| `server/calendar/plugin.ts` | Modified: gate all routes but `/auth/callback`; `/auth/start` returns JSON |
| `src/lib/apiRequest.ts` | Shared authed fetch helper; replaces the duplicated `request<T>` in both hooks |
| `src/lib/apiRequest.test.ts` | Unit tests for the above |
| `src/contexts/AuthContext.tsx` | Session state, `signIn`, `signOut`, offline detection |
| `src/components/auth/LoginPage.tsx` | Email + password form |
| `src/contexts/AppContext.tsx` | Modified: gate fetching on `user`, fix settings upsert |
| `src/pages/Index.tsx` | Modified: loading → login → app |
| `src/App.tsx` | Modified: wrap in `AuthProvider` |
| `src/hooks/useVault.ts` | Modified: use shared helper |
| `src/hooks/useGoogleCalendar.ts` | Modified: use shared helper |
| `src/components/views/CalendarPage.tsx` | Modified: anchor becomes button |
| `vite.config.ts` | Modified: host binding, pass verifier to plugins |
| `README.md` | Modified: correct the false RLS claim and stale table list |
| `LICENSE` | Added |

---

### Task 1: Migration SQL and RLS verification script

**Files:**
- Create: `supabase/migrations/0001_auth_and_rls.sql`
- Create: `scripts/verify-rls.ts`
- Modify: `package.json` (add `verify:rls` script)

**Interfaces:**
- Consumes: nothing.
- Produces: the five tables and their policies. Every later task assumes `user_id` defaults to `auth.uid()` and that `settings` has primary key `(user_id, key)`.

- [ ] **Step 1: Confirm the existing column types before the old project is deleted**

In the old project's SQL editor, run:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

Record the output. The mappers in `AppContext.tsx` prove which columns are read and written but not their types. If anything below disagrees with reality, the migration is what changes.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0001_auth_and_rls.sql`:

```sql
-- Crystal OS: authentication and per-user isolation.
--
-- Every table carries user_id with `default auth.uid()`, so the client never
-- sends it and the existing mapper functions stay unchanged. RLS is enabled on
-- all five tables with four policies each.

create extension if not exists "pgcrypto";

-- ── Categories (created first; tasks/transactions reference them) ──

create table public.task_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null,
  created_at timestamptz not null default now()
);

create table public.financial_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null,
  created_at timestamptz not null default now()
);

-- ── Tasks ──

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  start_date  date,
  start_time  text,
  end_date    date,
  end_time    text,
  priority    text not null default 'medium',
  -- set null, never cascade: deleting a category must not delete its tasks.
  category_id uuid references public.task_categories(id) on delete set null,
  completed   boolean not null default false,
  repeat_days integer,
  created_at  timestamptz not null default now()
);

-- ── Transactions ──

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  amount      numeric(12, 2) not null,
  type        text not null check (type in ('income', 'expense')),
  category_id uuid references public.financial_categories(id) on delete set null,
  date        date not null,
  created_at  timestamptz not null default now()
);

-- ── Settings ──
-- No surrogate id: the natural key is (user_id, key), and `key` alone would
-- collide across users.

create table public.settings (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ── Indexes ──

create index tasks_user_id_idx                on public.tasks (user_id);
create index transactions_user_id_idx         on public.transactions (user_id);
create index task_categories_user_id_idx      on public.task_categories (user_id);
create index financial_categories_user_id_idx on public.financial_categories (user_id);

-- ── Row Level Security ──
-- `using` decides which rows an operation can see; `with check` decides what a
-- row may look like afterwards. Update needs both, or a row's user_id could be
-- rewritten to hand it to another account.

alter table public.tasks                enable row level security;
alter table public.transactions         enable row level security;
alter table public.task_categories      enable row level security;
alter table public.financial_categories enable row level security;
alter table public.settings             enable row level security;

create policy tasks_select_own on public.tasks
  for select using (auth.uid() = user_id);
create policy tasks_insert_own on public.tasks
  for insert with check (auth.uid() = user_id);
create policy tasks_update_own on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_delete_own on public.tasks
  for delete using (auth.uid() = user_id);

create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);
create policy transactions_insert_own on public.transactions
  for insert with check (auth.uid() = user_id);
create policy transactions_update_own on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_delete_own on public.transactions
  for delete using (auth.uid() = user_id);

create policy task_categories_select_own on public.task_categories
  for select using (auth.uid() = user_id);
create policy task_categories_insert_own on public.task_categories
  for insert with check (auth.uid() = user_id);
create policy task_categories_update_own on public.task_categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy task_categories_delete_own on public.task_categories
  for delete using (auth.uid() = user_id);

create policy financial_categories_select_own on public.financial_categories
  for select using (auth.uid() = user_id);
create policy financial_categories_insert_own on public.financial_categories
  for insert with check (auth.uid() = user_id);
create policy financial_categories_update_own on public.financial_categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy financial_categories_delete_own on public.financial_categories
  for delete using (auth.uid() = user_id);

create policy settings_select_own on public.settings
  for select using (auth.uid() = user_id);
create policy settings_insert_own on public.settings
  for insert with check (auth.uid() = user_id);
create policy settings_update_own on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy settings_delete_own on public.settings
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 3: Write the verification script**

Create `scripts/verify-rls.ts`:

```ts
/**
 * Proves the anon role cannot reach any data. Run after applying the migration
 * and after any policy change: `npm run verify:rls`.
 *
 * This is the check that actually demonstrates the vulnerability is closed.
 * Unit tests cannot reach database state, so this lives here rather than in the
 * vitest suite.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const TABLES = [
  "tasks",
  "transactions",
  "task_categories",
  "financial_categories",
  "settings",
] as const;

// No session is established, so every request carries only the anon key.
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;

for (const table of TABLES) {
  const { data, error } = await anon.from(table).select("*").limit(1);

  if (error) {
    // A policy-level rejection is also a pass: nothing leaked.
    console.log(`  PASS  ${table}: rejected (${error.code ?? "error"})`);
    continue;
  }
  if (data && data.length > 0) {
    console.error(`  FAIL  ${table}: returned ${data.length} row(s) to anon`);
    failures++;
    continue;
  }
  console.log(`  PASS  ${table}: 0 rows`);
}

// Reading nothing is not proof on its own — an empty table also reads as zero
// rows. Writing must be refused too.
const { error: insertError } = await anon
  .from("settings")
  .insert({ key: "rls_probe", value: "should not be written" });

if (insertError) {
  console.log(`  PASS  settings: insert refused (${insertError.code ?? "error"})`);
} else {
  console.error("  FAIL  settings: anon insert SUCCEEDED — RLS is not protecting writes");
  failures++;
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed. RLS is not correctly configured.`);
  process.exit(1);
}
console.log("\nAll checks passed: anon cannot read or write any table.");
```

- [ ] **Step 4: Add the npm script**

In `package.json`, add to `scripts`:

```json
"verify:rls": "vite-node scripts/verify-rls.ts"
```

`vite-node` ships with Vitest, which is already a dev dependency, so this adds nothing new.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_auth_and_rls.sql scripts/verify-rls.ts package.json
git commit -m "feat(db): add auth and RLS migration with verification script"
```

---

### Task 2: `requireUser` server helper

**Files:**
- Create: `server/auth/requireUser.ts`
- Test: `server/auth/requireUser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type AuthedUser = { id: string; email?: string }`
  - `interface TokenVerifier { getUser(token: string): Promise<{ data: { user: AuthedUser | null }; error: { message: string } | null }> }`
  - `type RequireUser = (req: IncomingMessage) => Promise<AuthedUser | null>`
  - `createRequireUser(verifier: TokenVerifier, opts?: { ttlMs?: number; now?: () => number }): RequireUser`
  - `createSupabaseVerifier(url: string, anonKey: string): TokenVerifier`
  - `readBearerToken(req: IncomingMessage): string | null`

Tasks 3 and 4 import `RequireUser` and `createRequireUser`; `vite.config.ts` imports `createSupabaseVerifier`.

- [ ] **Step 1: Write the failing tests**

Create `server/auth/requireUser.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { createRequireUser, readBearerToken, type TokenVerifier } from "./requireUser";

const USER = { id: "user-1", email: "me@example.com" };

/** Minimal IncomingMessage stand-in — only headers are read. */
function req(authorization?: string): IncomingMessage {
  return { headers: authorization ? { authorization } : {} } as IncomingMessage;
}

function verifierReturning(
  result: { data: { user: typeof USER | null }; error: { message: string } | null },
): TokenVerifier & { getUser: ReturnType<typeof vi.fn> } {
  return { getUser: vi.fn().mockResolvedValue(result) };
}

describe("readBearerToken", () => {
  it("returns null when the header is absent", () => {
    expect(readBearerToken(req())).toBeNull();
  });

  it("returns null when the scheme is not Bearer", () => {
    expect(readBearerToken(req("Basic abc123"))).toBeNull();
  });

  it("returns null when the token is empty", () => {
    expect(readBearerToken(req("Bearer    "))).toBeNull();
  });

  it("extracts the token", () => {
    expect(readBearerToken(req("Bearer abc123"))).toBe("abc123");
  });
});

describe("createRequireUser", () => {
  it("returns null without contacting Supabase when there is no header", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    const requireUser = createRequireUser(verifier);

    expect(await requireUser(req())).toBeNull();
    expect(verifier.getUser).not.toHaveBeenCalled();
  });

  it("returns null when Supabase rejects the token", async () => {
    const verifier = verifierReturning({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    const requireUser = createRequireUser(verifier);

    expect(await requireUser(req("Bearer bad"))).toBeNull();
  });

  it("returns the user for a valid token", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    const requireUser = createRequireUser(verifier);

    expect(await requireUser(req("Bearer good"))).toEqual(USER);
  });

  it("does not re-contact Supabase within the TTL", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    let clock = 1_000;
    const requireUser = createRequireUser(verifier, { ttlMs: 60_000, now: () => clock });

    await requireUser(req("Bearer good"));
    clock += 59_000;
    await requireUser(req("Bearer good"));

    expect(verifier.getUser).toHaveBeenCalledTimes(1);
  });

  it("re-contacts Supabase once the TTL has passed", async () => {
    const verifier = verifierReturning({ data: { user: USER }, error: null });
    let clock = 1_000;
    const requireUser = createRequireUser(verifier, { ttlMs: 60_000, now: () => clock });

    await requireUser(req("Bearer good"));
    clock += 61_000;
    await requireUser(req("Bearer good"));

    expect(verifier.getUser).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejections", async () => {
    const verifier = verifierReturning({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    const requireUser = createRequireUser(verifier);

    await requireUser(req("Bearer bad"));
    await requireUser(req("Bearer bad"));

    expect(verifier.getUser).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/auth/requireUser.test.ts`
Expected: FAIL — cannot resolve `./requireUser`.

- [ ] **Step 3: Write the implementation**

Create `server/auth/requireUser.ts`:

```ts
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
  return { getUser: (token) => client.auth.getUser(token) as ReturnType<TokenVerifier["getUser"]> };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/auth/requireUser.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add server/auth/requireUser.ts server/auth/requireUser.test.ts
git commit -m "feat(server): add requireUser bearer token check with TTL cache"
```

---

### Task 3: Gate the Obsidian vault routes

**Files:**
- Modify: `server/obsidian/plugin.ts:132-146`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `RequireUser`, `createRequireUser`, `createSupabaseVerifier` from Task 2.
- Produces: `obsidianApi(vaultPath: string | undefined, requireUser: RequireUser | undefined): Plugin`.

- [ ] **Step 1: Change the plugin signature and add the check**

In `server/obsidian/plugin.ts`, add the import:

```ts
import type { RequireUser } from "../auth/requireUser";
```

Change the signature and insert the check. The auth check goes **before** the `vaultPath` check, so an unauthenticated caller cannot learn whether a vault is configured:

```ts
export function obsidianApi(
  vaultPath?: string,
  requireUser?: RequireUser,
): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(ROUTE_PREFIX)) return next();

    void (async () => {
      try {
        // Authorization first: an unauthenticated caller should not be able to
        // probe whether a vault is configured on this machine.
        if (!requireUser) {
          throw new VaultError("Auth is not configured on the server", 503);
        }
        if (!(await requireUser(req))) {
          throw new VaultError("Unauthorized", 401);
        }

        if (!vaultPath) {
          throw new VaultError(
            "OBSIDIAN_VAULT_PATH is not set in .env.local",
            503,
          );
        }
        // ... rest of the handler is unchanged
```

- [ ] **Step 2: Wire it up in `vite.config.ts`**

Add the import:

```ts
import { createRequireUser, createSupabaseVerifier } from "./server/auth/requireUser";
```

Inside the config factory, after `loadEnv`:

```ts
  // Built once per server so the token cache is shared across both plugins.
  const requireUser =
    env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
      ? createRequireUser(
          createSupabaseVerifier(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY),
        )
      : undefined;
```

And change the plugin call:

```ts
      obsidianApi(env.OBSIDIAN_VAULT_PATH, requireUser),
```

- [ ] **Step 3: Verify the whole suite still passes**

Run: `npx vitest run`
Expected: PASS, 86 tests (76 existing + 10 from Task 2).

- [ ] **Step 4: Verify the gate by hand**

Run `npm run dev`, then in a second terminal:

```bash
curl -i http://127.0.0.1:8080/api/obsidian/notes
```

Expected: `HTTP/1.1 401` with body `{"error":"Unauthorized"}`. Before this change it returned vault contents.

- [ ] **Step 5: Commit**

```bash
git add server/obsidian/plugin.ts vite.config.ts
git commit -m "feat(server): require an authenticated session for vault routes"
```

---

### Task 4: Gate the calendar routes and convert `/auth/start`

**Files:**
- Modify: `server/calendar/plugin.ts:198-228`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `RequireUser` from Task 2.
- Produces: `calendarApi(config: CalendarConfig, requireUser: RequireUser | undefined): Plugin`. `GET /api/calendar/auth/start` now responds `200 {"url": string}` instead of `302`.

- [ ] **Step 1: Add the gate with the callback exemption**

In `server/calendar/plugin.ts`, add the import:

```ts
import type { RequireUser } from "../auth/requireUser";
```

Change the signature and insert the check **after** the route is parsed (the exemption depends on knowing the route) but **before** any route is dispatched:

```ts
export function calendarApi(
  config: CalendarConfig,
  requireUser?: RequireUser,
): Plugin {
  const auth = createCalendarAuth(config);

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(ROUTE_PREFIX)) return next();

    void (async () => {
      try {
        // Parse the whole URL up front so no query value is ever hand-sliced.
        const url = new URL(rawUrl, "http://localhost");
        const route = url.pathname.slice(ROUTE_PREFIX.length);
        const method = (req.method ?? "GET").toUpperCase();
        const calendarId = url.searchParams.get("calendarId") || "primary";
        const scope = url.searchParams.get("scope") === "all" ? "all" : "single";

        // /auth/callback is the one exemption, and it has to be: it is a
        // redirect issued by Google's servers, which will never send our
        // Authorization header. It carries its own protection — a random state
        // nonce, verified here, expiring after 10 minutes.
        if (route !== "/auth/callback") {
          if (!requireUser) {
            throw new CalendarError("Auth is not configured on the server", 503);
          }
          if (!(await requireUser(req))) {
            throw new CalendarError("Unauthorized", 401);
          }
        }

        if (route === "/status") {
          // ... unchanged
```

- [ ] **Step 2: Convert `/auth/start` from a redirect to JSON**

Replace the `/auth/start` branch:

```ts
        if (route === "/auth/start") {
          if (method !== "GET") throw new CalendarError("Use GET", 405);
          // Returns the URL rather than 302-ing to it. A top-level navigation
          // cannot carry an Authorization header, so this route would be
          // unreachable once gated; the client fetches the URL and navigates
          // itself. See the spec, "Requests the browser issues without headers".
          res.setHeader("Cache-Control", "no-store");
          sendJson(res, 200, { url: auth.buildConsentUrl() });
          return;
        }
```

- [ ] **Step 3: Wire it up in `vite.config.ts`**

```ts
      calendarApi(
        {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: env.GOOGLE_REDIRECT_URI,
          refreshToken: env.GOOGLE_REFRESH_TOKEN,
        },
        requireUser,
      ),
```

- [ ] **Step 4: Verify the suite still passes**

Run: `npx vitest run`
Expected: PASS, 86 tests. `events.test.ts` and `envFile.test.ts` test modules the plugin calls, not the plugin itself, so they are unaffected.

- [ ] **Step 5: Verify both the gate and the exemption by hand**

```bash
curl -i http://127.0.0.1:8080/api/calendar/status
```
Expected: `401`.

```bash
curl -i "http://127.0.0.1:8080/api/calendar/auth/callback?state=x&code=y"
```
Expected: **not** 401 — it reaches the handler and fails on the invalid state nonce instead. This confirms the exemption is live and still protected.

- [ ] **Step 6: Commit**

```bash
git add server/calendar/plugin.ts vite.config.ts
git commit -m "feat(server): gate calendar routes, return consent URL as JSON"
```

---

### Task 5: Shared authed request helper

**Files:**
- Create: `src/lib/apiRequest.ts`
- Test: `src/lib/apiRequest.test.ts`
- Modify: `src/hooks/useVault.ts:44-60`
- Modify: `src/hooks/useGoogleCalendar.ts:69-84`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`.
- Produces:
  - `class ApiError extends Error { readonly status: number }`
  - `apiRequest<T>(url: string, init?: RequestInit, errorPrefix?: string): Promise<T>`
  - `shouldRetry(failureCount: number, error: unknown): boolean`

  Task 7 wires `shouldRetry` into the `QueryClient`; Task 8 calls `apiRequest` from `CalendarPage.tsx`.

Both hooks currently carry a byte-identical `request<T>` differing only in an error string. Extracting it is what makes "attach the token in exactly one place" possible.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/apiRequest.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./apiRequest";
import { supabase } from "./supabase";

const getSession = vi.spyOn(supabase.auth, "getSession");

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  getSession.mockResolvedValue({
    data: { session: { access_token: "tok-abc" } },
    error: null,
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("apiRequest", () => {
  it("attaches the current access token as a bearer header", async () => {
    const fetchMock = mockFetch({ json: async () => ({ ok: true }) });

    await apiRequest("/api/obsidian/notes");

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-abc");
  });

  it("reads the token on every call rather than caching it", async () => {
    const fetchMock = mockFetch({ json: async () => ({}) });

    await apiRequest("/api/obsidian/notes");
    getSession.mockResolvedValue({
      data: { session: { access_token: "tok-refreshed" } },
      error: null,
    } as never);
    await apiRequest("/api/obsidian/notes");

    const [, second] = fetchMock.mock.calls[1];
    expect(new Headers(second.headers).get("Authorization")).toBe("Bearer tok-refreshed");
  });

  it("preserves caller-supplied headers", async () => {
    const fetchMock = mockFetch({ json: async () => ({}) });

    await apiRequest("/api/obsidian/quick-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok-abc");
  });

  it("sends no Authorization header when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null } as never);
    const fetchMock = mockFetch({ json: async () => ({}) });

    await apiRequest("/api/obsidian/notes");

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("surfaces the server's error message", async () => {
    mockFetch({
      ok: false,
      status: 503,
      json: async () => ({ error: "OBSIDIAN_VAULT_PATH is not set in .env.local" }),
    });

    await expect(apiRequest("/api/obsidian/notes")).rejects.toThrow(
      "OBSIDIAN_VAULT_PATH is not set in .env.local",
    );
  });

  it("falls back to a prefixed status message on a non-JSON error", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(apiRequest("/x", undefined, "Vault API error")).rejects.toThrow(
      "Vault API error: 500",
    );
  });

  it("throws an ApiError carrying the status code", async () => {
    mockFetch({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) });

    await expect(apiRequest("/x")).rejects.toMatchObject({ status: 401 });
  });
});

describe("shouldRetry", () => {
  it("never retries an expired or missing session", () => {
    expect(shouldRetry(0, new ApiError("Unauthorized", 401))).toBe(false);
    expect(shouldRetry(0, new ApiError("Forbidden", 403))).toBe(false);
  });

  it("retries a server error once", () => {
    expect(shouldRetry(0, new ApiError("Boom", 500))).toBe(true);
    expect(shouldRetry(1, new ApiError("Boom", 500))).toBe(false);
  });

  it("retries a non-ApiError once", () => {
    expect(shouldRetry(0, new Error("network"))).toBe(true);
    expect(shouldRetry(1, new Error("network"))).toBe(false);
  });
});
```

Update the import at the top of the test file to `import { ApiError, apiRequest, shouldRetry } from "./apiRequest";`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/apiRequest.test.ts`
Expected: FAIL — cannot resolve `./apiRequest`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/apiRequest.ts`:

```ts
import { supabase } from "./supabase";

/** Carries the HTTP status so retry policy can distinguish 401 from 503. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * react-query retry policy. An expired or missing session is not a transient
 * failure — retrying it produces a burst of doomed requests and delays the
 * login screen. Anything else gets one retry.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return false;
  }
  return failureCount < 1;
}

/**
 * Every call to the vault and calendar middleware goes through here.
 *
 * The token is read at call time rather than passed in, and deliberately so.
 * Supabase rotates the access token roughly hourly; a token captured at mount
 * would start returning 401 an hour into a session while the database queries
 * carried on working. Putting it in a react-query `queryKey` would instead
 * invalidate every cached query on each refresh. `getSession()` returns the
 * cached session and refreshes it only when needed, so reading it per call is
 * cheap and makes staleness structurally impossible.
 */
export async function apiRequest<T>(
  url: string,
  init?: RequestInit,
  errorPrefix = "API error",
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    // The middleware always replies with { error } — surface that instead of a
    // bare status code, since "OBSIDIAN_VAULT_PATH is not set" is actionable.
    let message = `${errorPrefix}: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON response, keep the status message */
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}
```

- [ ] **Step 3b: Replace the per-query retry settings**

In `src/hooks/useVault.ts`, both `useVaultNotes` and `useVaultNote` set `retry: 1`, which would retry a 401. Replace both with the shared policy:

```ts
    retry: shouldRetry,
```

adding `shouldRetry` to the `@/lib/apiRequest` import. Do the same for any `retry:` option in `src/hooks/useGoogleCalendar.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/apiRequest.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Replace the duplicated helper in both hooks**

In `src/hooks/useVault.ts`, delete the local `request<T>` function (lines 44–60) and add at the top:

```ts
import { apiRequest } from "@/lib/apiRequest";

const request = <T,>(url: string, init?: RequestInit) =>
  apiRequest<T>(url, init, "Vault API error");
```

In `src/hooks/useGoogleCalendar.ts`, delete the local `request<T>` function (lines 69–84) and add at the top:

```ts
import { apiRequest } from "@/lib/apiRequest";

const request = <T,>(url: string, init?: RequestInit) =>
  apiRequest<T>(url, init, "Calendar API error");
```

Every existing call site keeps working — the local alias preserves the `request<T>(url, init)` shape.

- [ ] **Step 6: Verify the full suite and types**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, 96 tests; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/apiRequest.ts src/lib/apiRequest.test.ts src/hooks/useVault.ts src/hooks/useGoogleCalendar.ts
git commit -m "feat(client): attach session token to vault and calendar requests"
```

---

### Task 6: `AuthContext` and `LoginPage`

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/components/auth/LoginPage.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`.
- Produces:
  - `AuthProvider: React.FC<{ children: React.ReactNode }>`
  - `useAuth(): { session: Session | null; user: User | null; loading: boolean; signIn(email: string, password: string): Promise<{ error: string | null }>; signOut(): Promise<void> }`
  - `LoginPage: React.FC`

Task 7 consumes `useAuth` from both `Index.tsx` and `AppContext.tsx`.

- [ ] **Step 1: Write `AuthContext`**

Create `src/contexts/AuthContext.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the initial session lookup settles. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Owns the Supabase session and nothing else. It has no knowledge of tasks,
 * transactions, or any other application data — AppProvider consumes it.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // getSession() reads the cached session from local storage and only
    // contacts Supabase when the token needs refreshing, so this resolves
    // offline as long as the cached token is still within its lifetime.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        // Offline with an expired token. Fall through to the login screen,
        // which reports the network failure when a sign-in is attempted.
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Fires on sign-in, sign-out, and every background TOKEN_REFRESHED event.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { error: null };

    // A network failure and a rejected password are very different problems
    // and look identical if both render as "invalid login credentials".
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline || error.message.toLowerCase().includes("fetch")) {
      return { error: "Can't reach Supabase — check your connection." };
    }
    return { error: error.message };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Write `LoginPage`**

Create `src/components/auth/LoginPage.tsx`. It calls `signIn` and renders whatever comes back; it has no knowledge of Supabase.

```tsx
import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await signIn(email, password);
    if (signInError) setError(signInError);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
      >
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">Crystal OS</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx src/components/auth/LoginPage.tsx
git commit -m "feat(auth): add session context and login screen"
```

---

### Task 7: Gate the shell and scope the data layer

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Index.tsx`
- Modify: `src/contexts/AppContext.tsx:156-196` and `:248-252`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth`, `LoginPage` from Task 6.
- Produces: an application that renders no data until a session exists.

- [ ] **Step 1: Wrap the app in `AuthProvider`**

In `src/App.tsx`, add the imports, apply the retry policy to the client, and wrap inside `QueryClientProvider`:

```tsx
import { AuthProvider } from "@/contexts/AuthContext";
import { shouldRetry } from "@/lib/apiRequest";

// Default retry is 3. An expired session would produce four doomed requests
// per query before surfacing anything.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);
```

- [ ] **Step 2: Gate the shell in `Index.tsx`**

Add the imports:

```tsx
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/components/auth/LoginPage";
```

Find the top-level default export (the component that renders `<AppProvider>`) and gate it. `AppProvider` must sit **inside** the session check so it never mounts without a user:

```tsx
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  if (!session) return <LoginPage />;

  // ... the existing <AppProvider>…</AppProvider> tree, unchanged
}
```

- [ ] **Step 3: Scope fetching to the signed-in user in `AppContext.tsx`**

Add the import:

```tsx
import { useAuth } from "@/contexts/AuthContext";
```

Inside `AppProvider`, add near the other hooks:

```tsx
  const { user } = useAuth();
```

Replace the load effect so it keys on the user and clears state on sign-out:

```tsx
  // ── Fetch all data when a user is present ──
  useEffect(() => {
    if (!user) {
      // Signing out must not leave the previous session's tasks on screen
      // while the login form animates in.
      setTasks([]);
      setTransactions([]);
      setTaskCategories(defaultTaskCategories);
      setFinancialCategories(defaultFinancialCategories);
      setDailyFocusState("");
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      const [tasksRes, txRes, taskCatRes, finCatRes, settingsRes] = await Promise.all([
        supabase.from("tasks").select("*").order("start_date").order("start_time"),
        supabase.from("transactions").select("*").order("date", { ascending: false }),
        supabase.from("task_categories").select("*").order("name"),
        supabase.from("financial_categories").select("*").order("name"),
        supabase.from("settings").select("*").eq("key", "daily_focus").maybeSingle(),
      ]);

      if (!active) return;

      if (tasksRes.data) setTasks(tasksRes.data.map(mapTaskFromDb));
      if (txRes.data) setTransactions(txRes.data.map(mapTransactionFromDb));
      if (taskCatRes.data && taskCatRes.data.length > 0)
        setTaskCategories(taskCatRes.data.map(mapCategoryFromDb) as TaskCategory[]);
      if (finCatRes.data && finCatRes.data.length > 0)
        setFinancialCategories(finCatRes.data.map(mapCategoryFromDb) as FinancialCategory[]);
      if (settingsRes.data) setDailyFocusState(settingsRes.data.value ?? "");

      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [user?.id]);
```

No `.eq("user_id", …)` filters are added anywhere. RLS does that server-side, and duplicating it in the client would be a second place to get it wrong.

- [ ] **Step 4: Fix the settings upsert**

Replace `setDailyFocus`:

```tsx
  const setDailyFocus = useCallback(
    async (focus: string) => {
      if (!user) return;
      setDailyFocusState(focus);
      // user_id is sent explicitly here, unlike every insert, which relies on
      // the column default. An upsert is INSERT ... ON CONFLICT DO UPDATE and
      // must satisfy the insert policy's `with check` and, on collision, the
      // update policy's `using` and `with check`. Supplying user_id from the
      // session removes any dependence on how the default interacts with
      // conflict resolution. This is the only upsert in the codebase.
      await supabase
        .from("settings")
        .upsert(
          { user_id: user.id, key: "daily_focus", value: focus },
          { onConflict: "user_id,key" },
        );
    },
    [user],
  );
```

- [ ] **Step 5: Verify types and the full suite**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx vitest run`
Expected: typecheck clean; PASS, 96 tests.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/pages/Index.tsx src/contexts/AppContext.tsx
git commit -m "feat(auth): gate the app shell and scope data loading to the session"
```

---

### Task 8: Convert the calendar connect anchor, bind loopback, and fix the docs

**Files:**
- Modify: `src/components/views/CalendarPage.tsx:128-134`
- Modify: `vite.config.ts:17`
- Modify: `README.md:93`, `README.md:221-234`
- Create: `LICENSE`

**Interfaces:**
- Consumes: `apiRequest` from Task 5.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Replace the anchor with an authenticated fetch**

In `src/components/views/CalendarPage.tsx`, add the imports:

```tsx
import { useState } from "react";
import { apiRequest } from "@/lib/apiRequest";
```

Add inside the component, above the return:

```tsx
  const [connectError, setConnectError] = useState<string | null>(null);

  // A top-level <a href> cannot carry the Authorization header, so this route
  // is fetched rather than navigated to; the server returns the consent URL and
  // the browser goes there afterwards.
  async function startConnect() {
    setConnectError(null);
    try {
      const { url } = await apiRequest<{ url: string }>(
        "/api/calendar/auth/start",
        undefined,
        "Calendar API error",
      );
      window.location.href = url;
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Could not start Google sign-in.");
    }
  }
```

Replace the anchor:

```tsx
        <button
          type="button"
          onClick={startConnect}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <CalendarDays className="w-4 h-4" />
          Connect Google Calendar
        </button>
```

And render the error below it:

```tsx
        {connectError && (
          <p role="alert" className="text-xs text-destructive mt-2">
            {connectError}
          </p>
        )}
```

- [ ] **Step 2: Bind the dev server to loopback**

In `vite.config.ts`, change the server block:

```ts
    server: {
      // Loopback only. "::" bound every interface, which served the vault and
      // calendar to anything on the same network. Correct while this runs
      // natively on host hardware; inside Docker or WSL2 this would have to
      // return to "0.0.0.0" and the route gating would carry the security
      // burden alone.
      host: "127.0.0.1",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
```

- [ ] **Step 3: Correct the README**

Replace the note at `README.md:93` (the environment section) with the account setup:

```markdown
> **Note:** the Supabase URL and anon key are read from `VITE_SUPABASE_URL` and
> `VITE_SUPABASE_ANON_KEY` in `.env.local`. Being `VITE_`-prefixed they are inlined into
> the client bundle and are public at runtime — that is expected for an anon key. Row
> Level Security is what protects the data. Never expose the `service_role` key.
>
> This app has no registration flow by design. Create your single account in the Supabase
> dashboard under Authentication → Users, and disable new signups under
> Authentication → Providers.
```

Replace the schema block at `README.md:221-234`:

```markdown
## 🗄️ Database Schema (Supabase)

```sql
tasks                (id, user_id, name, start_date, start_time, end_date,
                      end_time, priority, category_id, completed, repeat_days)
transactions         (id, user_id, name, amount, type, category_id, date)
task_categories      (id, user_id, name, color)
financial_categories (id, user_id, name, color)
settings             (user_id, key, value)   -- primary key (user_id, key)
```

Row Level Security is enabled on all five tables, with select/insert/update/delete
policies scoped to `auth.uid() = user_id`. `user_id` defaults to `auth.uid()`, so the
client never sends it. Category foreign keys are `on delete set null`, so deleting a
category leaves its tasks intact and uncategorised.

Apply `supabase/migrations/0001_auth_and_rls.sql` in the SQL editor, then run
`npm run verify:rls` to confirm the anon role can read and write nothing.
```

- [ ] **Step 4: Add a LICENSE**

Create `LICENSE` containing the verbatim OSI MIT License text (the standard 21-line form beginning "Permission is hereby granted, free of charge..."), with the copyright line reading exactly:

```
Copyright (c) 2026 Joe Zhuo
```

A public repository without a license grants no reuse rights, so a reader cannot legally build on the code even though they can see it.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx vitest run && npm run lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/CalendarPage.tsx vite.config.ts README.md LICENSE
git commit -m "feat: authenticate calendar connect, bind loopback, correct docs"
```

---

### Task 9: Live verification

**Files:** none — this task verifies rather than changes.

Requires the prerequisite dashboard steps and an applied migration.

- [ ] **Step 1: Apply the migration**

Paste `supabase/migrations/0001_auth_and_rls.sql` into the new project's SQL editor and run it. Expect no errors.

- [ ] **Step 2: Prove the anon role is locked out**

Run: `npm run verify:rls`
Expected: every table reports PASS, the insert is refused, exit code 0. **If any table returns rows, stop — RLS is not configured and nothing else in this plan matters.**

- [ ] **Step 3: Prove the server routes are gated**

With `npm run dev` running:

```bash
curl -i http://127.0.0.1:8080/api/obsidian/notes
```
Expected: `401`.

- [ ] **Step 4: Prove the LAN exposure is closed**

From a second device on the same network, replacing the IP with this machine's:

```bash
curl -m 5 -i http://192.168.1.50:8080/api/obsidian/notes
```
Expected: connection refused or timeout. Before this work it returned vault contents.

- [ ] **Step 5: Exercise the application**

Sign in. Create a task, a transaction, and a category. Set the daily focus and reload to confirm the upsert persisted. Delete a category that has tasks filed under it and confirm the tasks survive as uncategorised — this is the `on delete set null` path. Sign out and confirm the data clears rather than lingering behind the login form.

- [ ] **Step 6: Confirm the token refresh path**

Leave the dashboard open for just over an hour, then browse a vault note. It must load. A 401 here means a token was captured somewhere instead of being read per call.

- [ ] **Step 7: Delete the old Supabase project**

Only now, with the new project verified working. This retires the leaked anon key at its source.

---

## Post-implementation: publishing

Tracked separately in the spec, section 11. In order: scrub `src/lib/supabase.ts` from history with `git filter-repo` after taking a `git clone --mirror` backup, force-push with `--force-with-lease`, then flip the repository to public.
