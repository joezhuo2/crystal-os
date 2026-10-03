# Supabase Auth + Row Level Security

**Date:** 2026-09-07
**Status:** Approved, not yet implemented
**Scope:** Add authentication and per-user data isolation to Crystal OS, and close the
unauthenticated LAN exposure of the Obsidian vault and Google Calendar routes, so the
repository can be made public.

---

## 1. Problem

Crystal OS currently has no authentication of any kind. There is not a single
`supabase.auth` call in `src/`. Every query in `AppContext.tsx` runs as the Supabase
`anon` role against five tables: `tasks`, `transactions`, `task_categories`,
`financial_categories`, and `settings`. Because the application works today, those
tables must be reachable by `anon` — either Row Level Security is disabled or the
policies are unconditionally true.

The Supabase project URL and anon key were hardcoded in `src/lib/supabase.ts` and are
present in ten commits of git history. They have since been moved to environment
variables, but history still carries them. While the repository is private this is
contained; making it public would hand any reader a working read/write client for the
task and finance data.

There is a second, independent exposure. `vite.config.ts` sets `server.host` to `"::"`,
which binds every network interface, and neither `/api/obsidian/*` nor `/api/calendar/*`
performs any authorization check. Any device on the same network as the dev server can
therefore read the entire Obsidian vault and the connected Google Calendar. This is live
today, involves no Supabase, and is unaffected by any database-level fix.

`README.md` compounds the problem by claiming "Row Level Security enabled on all tables
/ Policies: users can only access their own data." No user exists to scope to, so the
claim is false. The same section lists tables named `profiles` and `categories` that do
not exist; the real tables are the five named above.

## 2. Goals

- Require authentication before any data in the application is reachable.
- Isolate all five tables per user through Row Level Security keyed on `auth.uid()`.
- Stop the dev server from serving the vault and calendar to the local network.
- Require a valid session on the vault and calendar HTTP routes.
- Leave the repository in a state where publishing it exposes nothing sensitive.
- Keep the code legible: this repository is intended as a portfolio piece, so the auth
  pattern should be exemplary rather than merely functional.

## 3. Non-goals

- Multi-user support. Registration stays disabled; exactly one account exists, created
  by hand in the Supabase dashboard.
- Password reset, email verification, or account management UI. A single operator with
  dashboard access does not need them.
- Per-user Obsidian vaults or per-user Google Calendar connections. Both remain
  properties of the machine running the server, which is acceptable because only one
  person can log in.
- Migrating existing data. Current contents are throwaway test data and a new Supabase
  project is being created regardless.

## 4. Decisions

| Question | Decision | Rationale |
|---|---|---|
| Who can log in | One account, signups disabled | Personal dashboard; portfolio piece |
| Sign-in method | Email + password | No external dependency, no SMTP, easy to demo offline |
| Existing data | Discarded | Test data only |
| Scope | Database *and* server routes | The vault leak is the more acute live exposure |
| Supabase project | New project | Retires the leaked anon key at the source |
| Auth state location | Dedicated `AuthContext` | `AppContext.tsx` is already ~330 lines |

An alternative considered and rejected was folding session state into the existing
`AppProvider`. It touches fewer files but worsens a context that already handles data
fetching, mutations, and UI flags. A second alternative, React Router protected routes,
was rejected because the application navigates by tab state rather than routes; adding
a route for a single login screen is ceremony without benefit.

## 5. Architecture

Authentication is introduced as a layer above the existing data layer, not woven
through it. Three units, each with one responsibility:

**`AuthContext`** owns the Supabase session and nothing else. It exposes `session`,
`user`, `loading`, `signIn`, and `signOut`. Internally it calls `getSession` once on
mount and subscribes to `onAuthStateChange` for the lifetime of the provider. It has no
knowledge of tasks, transactions, or any application data.

**`LoginPage`** is a presentational form that calls `signIn` and renders whatever error
comes back. It has no knowledge of Supabase.

**`AppProvider`** keeps its current responsibilities and gains one dependency: it reads
`user` from `AuthContext`, refuses to fetch while `user` is null, refetches when
`user.id` changes, and clears its state on sign-out.

The shell in `Index.tsx` composes them: while `AuthContext.loading` is true it renders
the existing skeleton, when there is no session it renders `LoginPage`, and otherwise it
renders the application as it does today.

On the server side, a single `requireUser` helper sits in front of both existing route
plugins. Neither plugin's routing logic changes; the helper either passes the request
through or terminates it with 401.

## 6. Database schema and RLS

Delivered as one checked-in migration, `supabase/migrations/0001_auth_and_rls.sql`.
`.gitignore` already reserves `supabase/migrations` as a tracked path.

Because a new Supabase project is being created, this migration *creates* all five
tables rather than altering existing ones. There is nothing to drop. Column definitions
are recovered from the mapper functions in `AppContext.tsx`, which are the only existing
record of the schema:

| Table | Columns beyond `id` and `user_id` |
|---|---|
| `tasks` | `name`, `start_date`, `start_time`, `end_date`, `end_time`, `priority`, `category_id`, `completed`, `repeat_days` |
| `transactions` | `name`, `amount`, `type`, `category_id`, `date` |
| `task_categories` | `name`, `color` |
| `financial_categories` | `name`, `color` |
| `settings` | `key`, `value` |

Implementation must confirm these against the live schema of the old project before it
is deleted, since the mappers only prove which columns are *read and written*, not their
exact types, nullability, or defaults.

Every table gains:

```sql
user_id uuid not null default auth.uid() references auth.users(id) on delete cascade
```

The `default auth.uid()` clause is the load-bearing detail. It means the client never
sends `user_id`, so `mapTaskToDb`, `mapTransactionToDb`, and `mapCategoryToDb` stay
exactly as they are and the insert call sites are untouched. `on delete cascade` means
deleting the account in the dashboard cleans up all of its rows.

Each table gets RLS enabled and four policies:

```sql
alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);
```

Both `using` and `with check` appear on `update` deliberately: `using` decides which
rows are visible to the update, `with check` prevents rewriting a row's `user_id` to
hand it to someone else. Omitting the latter is the common mistake in this pattern.

An index on `user_id` is added to each table.

### Foreign keys

`tasks.category_id` and `transactions.category_id` reference `task_categories` and
`financial_categories` respectively. Delete behaviour must be declared explicitly rather
than left to the default, which would raise a constraint violation whenever a category
in use is deleted — and `CategoryManager.tsx:39` deletes categories on demand.

Both are declared `nullable` with `on delete set null`:

```sql
category_id uuid references public.task_categories(id) on delete set null
```

`cascade` is rejected deliberately: it would mean deleting a category silently deletes
every task filed under it, which is a destructive surprise for a one-click action. The
client already tolerates a missing category — every consumer resolves it through
`.find()` (`TasksPage.tsx:15`, `CommandPalette.tsx:278`, `FinancialsPage.tsx:237`),
which yields `undefined` and renders as uncategorised. No client change is needed.

Note that foreign key enforcement in Postgres runs as the table owner and is not itself
subject to RLS, so a dangling reference cannot be produced by policy filtering. The
reason to declare `on delete set null` is correctness of the delete operation, not RLS.

### The `settings` table

`settings` is the one table whose shape changes beyond the new column. It drops `id`
entirely and takes a composite primary key `(user_id, key)`, because `key` alone would
collide across users and a surrogate `id` alongside a natural composite key serves no
purpose here.

The upsert at `AppContext.tsx:250` changes in two ways:

```
onConflict: "key"   ->   onConflict: "user_id,key"
payload: { key, value }   ->   { user_id: user.id, key, value }
```

Sending `user_id` explicitly is a deliberate exception to the `default auth.uid()`
convention used everywhere else. An upsert is `INSERT ... ON CONFLICT DO UPDATE`, so it
must satisfy the INSERT policy's `with check` *and*, when it collides, the UPDATE
policy's `using` and `with check`. Both exist, so this is sound in principle; supplying
`user_id` from the session removes any dependence on how the column default interacts
with conflict resolution, at a cost of one field at one call site. This is the only
upsert in the codebase.

## 7. Server route authorization

New module `server/auth/requireUser.ts`. It reads the `Authorization: Bearer <token>`
header, validates the token by calling Supabase, and returns the user or null.
Validation goes through Supabase rather than local JWT signature verification so the
implementation stays correct regardless of whether the project issues symmetric or
asymmetric keys.

Because a network round trip per request would be felt on vault browsing, validated
tokens are cached in memory for 60 seconds, keyed by token string. The cache is a plain
`Map` with timestamp entries, bounded by clearing expired entries on write.

Both plugins call it immediately after their prefix match and before routing, returning
401 with a JSON body when it yields null.

### Requests the browser issues without headers

A `fetch` can carry an `Authorization` header. A top-level navigation, an `<img src>`,
an `<iframe>`, and a `window.open` cannot. Any route reached that way will 401 under
this design, so each must be identified and handled rather than discovered at runtime.

Two exist in this codebase, and they resolve differently:

`/api/calendar/auth/start` is reached by `<a href="/api/calendar/auth/start">` at
`CalendarPage.tsx:130`. It is **converted rather than exempted**: the route starts
returning `{ url }` as JSON to an authenticated `fetch`, and the client performs
`window.location.href = url` with the result. The anchor becomes a button. This keeps
the route gated and costs a few lines.

`/api/calendar/auth/callback` **is exempt**, and must be. It is a redirect issued by
Google's servers, which will never send our header. It keeps its existing protection:
the random `state` nonce verified on callback with a 10-minute expiry.

The vault API needs no exemption. It is JSON-only — every call in `useVault.ts` goes
through the shared `request<T>()` helper, and no endpoint serves binary content. This is
a property worth preserving: **if a vault attachment or image endpoint is ever added,
`src="/api/obsidian/..."` will 401**, and the fix at that point is to fetch the asset
with the header and render it from an object URL, or to issue a short-lived signed query
parameter for asset URLs specifically. Recorded here so the constraint is not
rediscovered the hard way.

### Token freshness

Supabase access tokens expire after roughly an hour and are refreshed in the background,
which makes any token captured once at component mount a latent 401 an hour out — the
database queries would keep working while vault and calendar requests began failing.

The shared `request<T>()` helper therefore reads the token at call time via
`supabase.auth.getSession()`, which returns the cached session and refreshes it when
needed, rather than receiving a token from props or context. This is chosen over
threading `session.access_token` through `AuthContext`: a token in a react-query
`queryKey` would invalidate every cached vault query on each hourly refresh, and a token
in a dependency array would rebuild the query functions for the same reason. Reading it
at call time keeps the cache stable and makes staleness structurally impossible.

### Network binding

`vite.config.ts` changes `server.host` from `"::"` to `"127.0.0.1"`. This alone closes
the LAN exposure; the route gating defends against anything else running on the same
machine and makes the app's authorization story consistent.

This is correct while the project runs natively on host hardware, which it does. If it
is ever moved into Docker, WSL2, or a dev container, `127.0.0.1` binds only the
container's loopback and port forwarding to the host will break; the binding would then
need to return to `0.0.0.0` with the route gating carrying the security burden alone.
Noted so the change is understood rather than cargo-culted.

## 8. Error handling

- Bad credentials surface Supabase's own message on the login form. No attempt is made
  to distinguish "wrong password" from "no such user"; both should read identically.
- An expired session triggers `onAuthStateChange`, which drops `session` to null and
  returns the shell to `LoginPage`. In-flight queries fail closed under RLS.
- A 401 from a server route causes the corresponding hook to surface an error state
  rather than retry, so an expired token does not produce a request loop.
- If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing, `src/lib/supabase.ts`
  already throws at import with a message pointing at `.env.example`.
- Offline start-up is distinguished from bad credentials. `getSession()` reads the
  cached session from local storage and only contacts Supabase when the token needs
  refreshing, so an offline launch inside the token lifetime works normally. Outside it,
  refresh and sign-in both fail with a network error, which `LoginPage` reports as "can't
  reach Supabase — check your connection" rather than as a rejected password. Without
  this the offline case is indistinguishable from a wrong password, which is a
  frustrating thing to debug on a plane.

## 9. Testing

Test-driven where the unit permits it. `requireUser` is written test-first:

- missing `Authorization` header yields null
- malformed header (no `Bearer` prefix, empty token) yields null
- token Supabase rejects yields null
- valid token yields the user
- a second call within the TTL does not re-contact Supabase
- a call after the TTL does re-contact Supabase

The Supabase client is injected so these run without network access, matching the
existing style in `server/calendar/envFile.test.ts`.

The 76 existing tests must remain green; none of them touch Supabase.

RLS itself is verified out of band, since it is database state rather than something
unit tests can reach. `scripts/verify-rls.ts`, run via an added
`npm run verify:rls`, connects with the anon key and no session and asserts that each of
the five tables returns zero rows and that an insert is rejected. It exits non-zero on
any table that answers. This is the check that actually proves the vulnerability is
closed, so it stays in the repository rather than being a one-off.

## 10. Setup runbook

1. Create the new Supabase project. Record its URL and anon key.
2. Authentication → Providers → disable new user signups.
3. Authentication → Users → add one user with your email and a password.
4. Run `supabase/migrations/0001_auth_and_rls.sql` in the SQL editor.
5. Put the new URL and anon key in `.env.local` (git-ignored).
6. Run the RLS verification script; confirm zero rows on all five tables as `anon`.
7. Confirm login works and data round-trips.
8. Delete the old Supabase project. This retires the leaked anon key at the source.

## 11. Publishing checklist

Once the above is done and verified:

- Scrub `src/lib/supabase.ts` from history with `git filter-repo`, then force-push.
  The leaked key is inert after step 8, but a committed credential in a portfolio
  repository reads badly regardless.

  Scope of the scrub was verified rather than assumed. A pattern scan across all 14
  commits for JWTs, `sk-`/`AIza`/`ghp_`/`GOCSPX-` prefixes, and PEM private key headers
  returned hits in exactly one file, `src/lib/supabase.ts`. No `.env`, `.env.local`, or
  other secret file was ever added in any commit; `.env.example` has only ever held
  empty placeholders. So the single-path rewrite is sufficient.

  `filter-repo` rewrites every commit hash from the first affected commit onward. The
  blast radius here is small and known: one branch, `main`, with no open pull requests
  and no other remote branches. Mirror the repository first
  (`git clone --mirror`) so the pre-rewrite state is recoverable, and use
  `--force-with-lease` on the push.
- Correct the false RLS claim and the stale table list in `README.md`, and document the
  one-time account creation.
- Add a LICENSE file. A public repository without one grants no reuse rights.
- Optionally reconsider the Markham default in `useWeather.ts:11`, which discloses
  approximate location.

## 12. Risks

The `default auth.uid()` clause silently writes null if the migration is ever run in a
context without an authenticated JWT, which the `not null` constraint would then reject.
This is the desired failure mode — loud, not silent — but it means seeding data must
happen through an authenticated client rather than the SQL editor.

Caching token validation for 60 seconds means a revoked session keeps vault access for
up to a minute. For a single-user local application this is an acceptable trade against
a round trip per request.
