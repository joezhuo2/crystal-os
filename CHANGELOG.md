# Changelog

All notable changes to Crystal OS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.5] - 2026-09-14 - Settings Page

### Added

- **Settings page.** A gear pinned to the bottom of the sidebar opens **Settings** (`src/components/views/SettingsPage.tsx`) with every desktop preference in one place: both global hotkeys, **Launch at login**, and the vault folder. On the web it lists the in-app shortcut and notes that the rest lives in the desktop app.
- **Search bar hotkey.** `Alt+Shift+Space` (desktop, global) shows Crystal OS and focuses the search bar. Saved as `paletteShortcut` in `settings.json`; the two global hotkeys cannot share a combo.
- **`Cmd/Ctrl + K`** focuses the search bar while Crystal OS is focused, on web and desktop. The bar shows the shortcut until focused.

### Changed

- **`Alt+Space` only shows or hides the window.** It no longer opens the search bar. A combo saved before this release (`globalShortcut`) keeps working for show/hide.
- `set_global_shortcut` takes an `action` (`"toggle"` or `"palette"`), `get_global_shortcut` and `set_global_shortcut` return both statuses, and `pause_global_shortcut` releases both combos while one is being recorded.
- The palette's **Change global hotkey** and **Change vault folder** rows are replaced by a single **Open Settings** row. **Launch at login** moved from the hotkey dialog to Settings.

## [0.4.4] - 2026-09-13 - Always-On Hotkey

### Added

- **Launch at login (desktop).** The global hotkey used to work only after you opened Crystal OS yourself. Now the packaged app registers itself to start at sign-in (`tauri-plugin-autostart`; the `HKCU\...\Run` key on Windows, a LaunchAgent on macOS) with `--hidden`, so it waits in the tray and `Alt+Space` works right after login. On by default, and re-applied on every launch so the entry survives a reinstall. **Launch at login** in the **Change global hotkey** dialog turns it off; the choice is saved as `launchAtLogin` in `settings.json`. New commands: `get_launch_at_login`, `set_launch_at_login` (`src-tauri/src/autostart.rs`). Debug builds never register.
- **Single instance.** Opening Crystal OS while it is already running (for example from the Start menu while it sits in the tray) shows the existing window instead of starting a second process that could not claim the hotkey (`tauri-plugin-single-instance`).

### Changed

- **Closing the window hides it to the tray instead of quitting**, so the hotkey stays live. **Quit Crystal OS** in the tray still exits and stops the sidecar.
- The main window is created hidden (`"visible": false`) and shown in `setup` unless the app was started with `--hidden`, so a login launch never flashes the window.

## [0.4.3] - 2026-09-13 - Native Vault

### Added

- **Native vault access (desktop).** The Archive, the home vault widget, the palette's note results, and Quick Add now read and write your Obsidian vault through Rust (`src-tauri/src/vault.rs`) instead of the sidecar's `/api/obsidian` routes. The desktop app no longer needs `OBSIDIAN_VAULT_PATH`.
  - **Commands.** `list_vault` returns every note's path, `mtime`, and size. `read_vault_file` and `write_vault_file` read and write one note. `watch_vault` restarts the file watcher. `get_vault_status` and `pick_vault` report and change the vault folder. Errors come back as `{ code, message }` with a stable code: `not_configured`, `missing`, `permission_denied`, `not_found`, `invalid_path`, `conflict`, or `io`.
  - **Folder picker.** On first launch, The Archive shows **Choose vault folder**, which opens the system folder dialog from Rust (`tauri-plugin-dialog`). The folder is saved as `vaultPath` in `%APPDATA%\com.crystalos.desktop\settings.json` and loaded at startup. **Choose / Change vault folder** in the command palette switches vaults later and shows the current folder.
  - **Live updates.** A recursive watcher (`notify-debouncer-mini`, 250 ms) emits `vault://changed` with the changed note paths. `useVaultLiveUpdates`, mounted once in `Index.tsx`, refetches every vault query, so edits, renames, and deletions made in Obsidian appear without a refresh.
  - **Incremental reads.** `src/lib/vaultNative.ts` caches parsed notes by `mtime` and only re-reads files whose `mtime` changed, 16 at a time. Frontmatter is parsed with `js-yaml`, since `gray-matter` needs Node; invalid YAML is ignored instead of hiding the note.
  - **Safe quick add.** Writes go to a temp file (`.<name>.crystal-tmp`) that is then swapped in, falling back to an in-place write if Windows refuses the swap. Each write sends the `mtime` it read. If Obsidian saved the note in between, Rust returns `conflict` and the append is redone on top of the new content, up to three attempts.
- **Error states in The Archive (desktop).** A saved folder that is gone at startup, for example renamed or on an unplugged drive, shows **Vault folder not found** with **Choose vault folder** and **Retry**. An unreadable folder shows **Vault folder is not readable**. The watcher restarts when the folder is reachable again. A note deleted while open shows **This note is gone** with **Close note**, instead of a generic error. These errors are not retried automatically.
- **`src/lib/vaultCore.ts`.** Note parsing, search ranking, tag filtering, frontmatter tag upsert, and quick-add formatting (`planQuickAdd`, `queryNotes`, `normalizeNotePath`), with no Node imports. Both the Node middleware and the desktop client use it.
- **`src-tauri/src/settings.rs`.** Shared read-modify-write access to `settings.json`, used by the hotkey (`globalShortcut`) and the vault (`vaultPath`). Writes hold a lock so the two cannot overwrite each other's key.

### Changed

- **The webview can only call app commands it is granted.** `build.rs` now declares every app command, and `src-tauri/capabilities/default.json` allowlists each one (`allow-list-vault`, `allow-get-global-shortcut`, and so on). The webview still has no fs, shell, or dialog plugin permissions. The vault commands accept only `.md` paths inside the picked folder: `..`, absolute paths, drive letters, NTFS stream names, `.obsidian`/`.trash`/`.git`/`node_modules`, and symlinks or junctions that lead outside are all refused. Tauri 2 has no fs allowlist in `tauri.conf.json`, so the scope is enforced in `vault.rs` and in the capability file.
- **`server/obsidian/vault.ts` and `plugin.ts` delegate to `vaultCore.ts`.** The API and responses are unchanged. `appendToNote` now writes the note in one call rather than a frontmatter write followed by an append.
- `hotkey.rs` reads and writes `settings.json` through `settings.rs`.

### Notes

- The web app and `npm run dev` still use the `/api/obsidian` middleware and `OBSIDIAN_VAULT_PATH`. The sidecar still serves those routes, but the desktop Archive no longer calls them.
- New dependencies: `tauri-plugin-dialog` and `notify-debouncer-mini` (Rust), `js-yaml` (npm), and `tempfile` for Rust tests.
- Tests: 9 Rust unit tests in `vault.rs` (path normalisation, escape attempts, ignored folders, stale-write conflicts, deleted notes, missing root, symlink escape, watcher filtering), plus `src/lib/vaultCore.test.ts` and `src/lib/vaultNative.test.ts`. Vitest: 152 passing.
- Not yet verified in a running desktop window.

## [0.4.2] - 2026-09-13 - Tray Menu

### Added

- **System tray (desktop).** Crystal OS now has a tray icon with a menu: **Show / Hide Crystal OS**, a Pomodoro section, **Quick Add…**, and **Quit Crystal OS**.
  - **Icons.** Windows and Linux show a colour gem (`src-tauri/icons/tray/tray-color.png`, 32px). macOS uses a monochrome template image (`tray-template.png`, 44px for Retina) so the menu bar tints it for light and dark mode. Both are rasterised from the SVGs beside them with `tauri icon`.
  - **Clicks.** On Windows, left-clicking the icon shows or hides the window and right-clicking opens the menu. On macOS any click opens the menu. Show/Hide checks whether the window is on screen, not whether it has focus, because clicking the tray takes focus away from the window.
  - **Pomodoro.** A disabled status row shows the phase and time left (`Focus 24:12`, or `Focus 25:00 (paused)`). **Start** relabels itself **Pause** while the timer runs. **Reset** restores the current phase's full length. The tray tooltip shows the same countdown and updates every second.
  - **Quick Add…** shows and focuses the window, then opens the existing Quick Add dialog with an empty draft. Signed out, it just shows the window.
  - **Quit** exits the app; the sidecar is still killed on exit.
  - **IPC.** Tray → Rust → webview event → store. Rust emits `tray://pomodoro` (`"toggle"` or `"reset"`) and `tray://quick-add`. `src/lib/tray.ts` applies them and pushes `{ label, tooltip, running }` back through the `update_tray_pomodoro` command whenever that view changes. Rust keeps no copy of the countdown. The bridge starts in `main.tsx`, outside React, so it works on the login screen and on every page.
  - **Failure is not fatal.** If the tray cannot be created, the error is logged and the window and hotkey work as before.
- **`src-tauri/src/window.rs`.** Show, hide, and on-screen checks shared by the hotkey and the tray. The hotkey's toggle behaviour is unchanged.

### Changed

- **The Pomodoro timer keeps running when you leave the Tasks page.** Its state moved out of `PomodoroTimer.tsx` into a module-level store (`src/lib/pomodoro.ts`, read with `usePomodoro`). Previously navigating away unmounted the component and threw the countdown away.
- **The Pomodoro countdown no longer drifts.** Time left is computed from a wall-clock deadline instead of subtracting one second per `setInterval` tick, which a throttled background webview could delay. Covered by `src/lib/pomodoro.test.ts` and `src/lib/tray.test.ts`.

### Notes

- Closing the window still quits the app rather than hiding it to the tray.
- The web app is unchanged. `initTrayBridge()` and `useTrayQuickAdd` are no-ops outside Tauri and load `@tauri-apps/api` only through dynamic imports.

## [0.4.1] - 2026-09-13 - Global Hotkey

### Added

- **Global hotkey (desktop).** `Alt+Space` summons Crystal OS from any app and opens the existing command palette with its input focused and any previous query selected. Pressing it again while Crystal OS has focus hides the window. There is no second palette: the hotkey drives `CommandPalette.tsx`.
  - **Toggle.** A hidden or minimised window is restored, centred, shown, and focused. A window that is visible but behind another app is focused where it is, not moved. The window only hides when it already has focus.
  - **Registered in Rust at startup** (`src-tauri/src/hotkey.rs`, via `tauri-plugin-global-shortcut`), so the combo works before the webview has loaded or anyone has signed in. Rust emits `palette://open` after showing the window; `useGlobalHotkey` (`src/hooks/useGlobalHotkey.ts`) listens for it.
  - **Configurable.** "Change global hotkey" in the palette (desktop only, also found by typing "hotkey") opens a dialog that records a new combo. At least one of Ctrl, Alt, Shift, or Win is required, except for F-keys. The current combo is released while the dialog is open, so pressing it there is captured rather than hiding the window. **Reset to Alt + Space** restores the default.
  - **Persisted** as `globalShortcut` in `%APPDATA%\com.crystalos.desktop\settings.json`, next to the sidecar's `.env.local`. Other keys in that file are preserved. A combo is only saved once it registers, so the file never holds one that failed.
  - **Registration failure does not crash the app.** If another app already owns the combo at startup, Crystal OS starts normally, logs a warning, and shows a toast once the palette mounts; the palette row reads "not registered". If a new combo fails in the dialog, the error is shown inline and as a toast, and the previous combo is re-registered.
- **`src/lib/hotkey.ts`.** `acceleratorFromEvent()` turns a `keydown` into the plugin's accelerator format using `KeyboardEvent.code`, so the combo does not depend on keyboard layout. `formatAccelerator()` renders it for display (`Ctrl+Super+KeyK` becomes `Ctrl + Win + K`). Covered by `src/lib/hotkey.test.ts`.

### Notes

- There is no tray icon yet (planned for 1.3), so a window hidden with the hotkey can only be brought back with the hotkey. Closing the window still quits the app.
- The web app is unchanged. `useGlobalHotkey` is a no-op outside Tauri and loads `@tauri-apps/api` only through dynamic imports.

## [0.4.0] - 2026-09-12 - Desktop App

### Added

- **Desktop app (Tauri 2).** `npm run dev:desktop` opens Crystal OS in a native window on the Vite dev server. `npm run build:desktop` produces a Windows installer. The web commands are unchanged and need no Rust. The reasoning is recorded in `docs/adr/0001-desktop-shell.md`.
  - **`crystal-api` sidecar.** The packaged app has no Vite server, so the vault and Google Calendar middleware ship as a Node single-executable (`scripts/build-sidecar.mjs`). Tauri launches it on `127.0.0.1:8787` and kills it on exit. It keeps the Supabase-JWT gate on every route and accepts cross-origin requests only from the Tauri webview. It reads `.env.local` from `%APPDATA%\com.crystalos.desktop\`.
  - **`src/lib/platform.ts`.** `isDesktop()`, `apiUrl()`, and `openExternal()`. `apiRequest` routes through `apiUrl`, so only the packaged app talks to the sidecar. The module has no top-level Tauri import, so the web bundle does not carry it.

### Changed

- **Google Calendar Connect opens the system browser on desktop.** Google refuses OAuth inside embedded webviews. The web app still navigates in place.
- **`server/obsidian/plugin.ts` and `server/calendar/plugin.ts` export `createObsidianMiddleware` and `createCalendarMiddleware`.** The Vite plugins and the sidecar share one implementation. Web behaviour is unchanged.

## [0.3.2] - 2026-09-12

### Added

- **Escape closes overlays.** Pressing `Escape` now dismisses the event form and day panel in The Horizon, the transaction drawer in Financials, the task form in Tasks, and the category manager in both. Previously only the command palette, the Pomodoro timer, and the field-control popups responded to it; every other overlay had to be closed with its button or backdrop.
  - **`useEscapeKey`** (`src/hooks/useEscapeKey.ts`) — a shared hook backed by a module-level stack of handlers and a single `keydown` listener that is attached while at least one overlay is mounted. Only the most recently mounted overlay closes on each press, so stacked overlays peel off one at a time: with an event form open over a day panel, the first press closes the form and the second closes the panel.
  - Events that are already `defaultPrevented` are ignored, so an open `ThemedSelect`, `DateField`, or Radix popup inside an overlay closes first without taking the overlay with it. IME composition keystrokes are ignored too.
  - The event form will not close while a create or update is still saving, matching its backdrop.

### Changed

- **The Horizon — month grid shows up to 21 event dots per day.** Dots are smaller (`w-1.5 h-1.5`) and wrap into rows of seven inside a 54px column, instead of a single row capped at three. A day with a dozen events no longer looks the same as a day with three.

## [0.3.1] - 2026-09-10

### Changed

- **The Archive — the left rail is now two independent scroll regions.** The tag cloud and the note list each take half the rail and scroll on their own, so a vault with several dozen tags no longer pushes the note list off the bottom of the panel. Previously the tags were an unbounded `flex-wrap` block above a single scroller: the more tags a vault had, the less of the list was reachable, and past roughly thirty tags none of it was.
  - The rail's height is fixed (`70vh`, or `calc(100vh - 13rem)` from `lg` up) rather than capped with `max-height`, because an equal split needs a definite height to divide. Both halves are `flex-1 basis-0 min-h-0`, so they share the space evenly when both overflow and the tag half still shrinks to its content when a vault has only a few tags.
  - The note count sits between them as a fixed divider, so it stays visible while either half scrolls.
  - The search field remains pinned above both.

## [0.3.0] - 2026-09-07

Authentication and per-user data isolation. Nothing in the application is reachable without a session, and both the Obsidian and Google Calendar routes now require one.

**Breaking:** this release needs a Supabase project with `supabase/migrations/0001_auth_and_rls.sql` applied, plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` — the client throws at import if either is missing. Existing data is not migrated; the migration creates all five tables rather than altering them.

### Added

- **`AuthContext`** (`src/contexts/AuthContext.tsx`) — owns the Supabase session and nothing else, exposing `session`, `user`, `loading`, `signIn`, and `signOut`. It calls `getSession()` once on mount and subscribes to `onAuthStateChange` for the lifetime of the provider, so background token refreshes and sign-outs elsewhere are picked up.
  - `signIn` distinguishes a network failure from a rejected password: offline, or an error mentioning `fetch`, reports "Can't reach Supabase" rather than "invalid login credentials".
- **`LoginPage`** (`src/components/auth/LoginPage.tsx`) — an email and password form that calls `signIn` and renders whatever error comes back. It has no knowledge of Supabase. There is no registration flow by design; the single account is created in the Supabase dashboard.
- **`supabase/migrations/0001_auth_and_rls.sql`** — the first checked-in migration. Creates `tasks`, `transactions`, `task_categories`, `financial_categories`, and `settings`, each with `user_id uuid not null default auth.uid()` referencing `auth.users(id) on delete cascade`, a `user_id` index, RLS enabled, and four policies scoped to `auth.uid() = user_id`. The `update` policies carry both `using` and `with check`, so a row's `user_id` cannot be rewritten to hand it to another account.
  - `settings` has no surrogate id — its primary key is `(user_id, key)`, since `key` alone would collide across users.
  - Category foreign keys are `on delete set null`, so deleting a category leaves its tasks and transactions intact and uncategorised.
- **`requireUser`** (`server/auth/requireUser.ts`) — the per-request authorization check in front of both API plugins. It reads the bearer token and validates it through Supabase rather than by local signature verification, which stays correct whether the project signs with a symmetric secret or an asymmetric key. Successful validations are cached for 60 seconds, since browsing the vault issues many requests in quick succession; rejections are never cached, and expired entries are swept on write so a long-lived server cannot accumulate rotated tokens.
- **`apiRequest`** (`src/lib/apiRequest.ts`) — one helper for every call to the vault and calendar middleware. It attaches the access token at call time rather than at mount, so an hourly token rotation cannot leave a stale header, and it does so outside the react-query `queryKey`, so a refresh does not invalidate every cached query. Failures throw an `ApiError` carrying the HTTP status.
- **`shouldRetry`** — the shared react-query retry policy. 401 and 403 are not transient failures, so they are never retried; anything else gets one retry. Applied as the client-wide default in `App.tsx`, replacing react-query's default of three.
- **`seedDefaultCategories`** (`src/lib/seedCategories.ts`) — creates the starter categories as real rows on first sign-in and adopts the ids the database assigns. Only `name` and `color` are sent; `id` and `user_id` come from column defaults.
- **`npm run verify:rls`** (`scripts/verify-rls.ts`) — connects with the anon key and no session, and fails if any of the five tables returns a row or accepts an insert. Reading nothing is not proof on its own, so the script probes a write as well.
- Unit tests for `requireUser`, `apiRequest`, and `seedDefaultCategories`. `vitest.config.ts` stubs the two Supabase env vars, so the suite runs on a fresh clone with no `.env.local` and never touches real credentials.
- **`LICENSE`** — MIT.

### Changed

- `AppProvider` reads `user` from `AuthContext`, refuses to fetch while it is null, and clears tasks, transactions, categories, and daily focus on sign-out, so the previous session's data never lingers behind the login form. The fetch effect is keyed on `user?.id`, not `user`, because Supabase hands back a new user object on every hourly token refresh.
  - No `.eq("user_id", …)` filter appears anywhere in the data layer. RLS does that server-side; duplicating it in the client would be a second place to get it wrong.
- Every mutation in `AppProvider` reports a rejected write through a toast and the console instead of silently doing nothing. Each one previously checked `if (!error)`, which is how a rejected insert could close a form and leave no trace.
- The starter categories are seeded as rows rather than kept in memory with hand-written ids like `"work"` and `"salary"`. A task filed under one of those sent a non-uuid `category_id` to a uuid column and the insert was rejected. If seeding fails the in-memory defaults still render, so the UI is not empty, and the failure is surfaced.
- `setDailyFocus` sends `user_id` explicitly and conflicts on `(user_id, key)`. An upsert is `insert … on conflict do update` and must satisfy the insert policy's `with check` and, on collision, the update policy's `using` and `with check`; supplying `user_id` from the session removes any dependence on how the column default interacts with conflict resolution. It is the only upsert in the codebase.
- `Index.tsx` renders a spinner while the session lookup settles, then `LoginPage` when there is no session. `AppProvider` mounts inside that check, so it can never issue an unauthenticated query.
- **Connecting Google Calendar** is a button that fetches `/api/calendar/auth/start` and navigates to the URL it returns, rather than an `<a href>` pointed at that route — a top-level navigation cannot carry an `Authorization` header, so the route would have been unreachable once gated. The route replies `200 { url }` instead of `302`, and a failure renders inline.
- `useVault` and `useGoogleCalendar` drop their near-identical local `request` helpers in favour of `apiRequest`, and use `shouldRetry` in place of `retry: 1`.
- `README.md` documents the real schema. It previously listed `profiles` and `categories`, which do not exist, and claimed RLS policies scoped to each user while no user existed to scope to.
- `.gitignore` covers token and password stores, `.mcp.json`, Supabase local state and seeds, calendar and mailbox exports, HAR captures, and database dumps.

### Security

- **The Supabase anon key is no longer hardcoded.** It sat in `src/lib/supabase.ts` across ten commits and remains in git history, so the project it belonged to has been retired in favour of a new one; both values now come from `VITE_` env vars. They are still public at runtime by design — RLS is what protects the data.
- **The dev server no longer binds every network interface.** `server.host` was `"::"`, which served `/api/obsidian/*` and `/api/calendar/*` — the entire Obsidian vault and the connected Google Calendar — to any device on the same network, with no authorization check on either. It is now `127.0.0.1`. Running under Docker or WSL2 would have to return to `0.0.0.0`, at which point the route gating carries the burden alone.
- **Both API plugins require a valid session.** The Obsidian plugin checks authorization before it checks whether a vault is configured, so an unauthenticated caller cannot even probe the machine for one. Missing server-side auth configuration returns 503 rather than failing open.
  - `/api/calendar/auth/callback` is the one exemption, and has to be: it is a redirect issued by Google's servers, which will never carry our `Authorization` header. It keeps its own protection — a random `state` nonce, verified on return, expiring after 10 minutes.
- Row Level Security is enabled on all five tables, replacing unconditional `anon` access.

## [0.2.5] - 2026-09-06

### Added

- **Command palette: "Add a new event"** — a quick action, always offered alongside Quick Add, that opens The Horizon's create-event form for today from any tab.
- `showEventForm` / `setShowEventForm` on `AppContext` — UI-only, never persisted — so the palette can request the form and The Horizon can honour it once mounted.

### Changed

- `CalendarPage` consumes the request in an effect that waits for the calendar status query to settle, so a still-loading `connected === false` cannot swallow it, and clears the flag either way so it never re-fires on a later visit.

## [0.2.4] - 2026-09-06

### Fixed

- **The Vault — number rounding.** The savings running total is rounded to cents before it reaches the chart, and both Y axes format ticks to two decimals, so floating-point accumulation no longer surfaces as `1234.5600000000002` on an axis or in a tooltip.
- **The Vault — chart hovering.** Recharts tooltips inherited the page's own colours and rendered near-invisible text on the dark surface. Cash Flow, Category and Savings tooltips now set explicit content, label, and item colours, and the Savings tooltip formats its value as currency instead of a bare number.

## [0.2.3] - 2026-09-06

### Added

- **Themed field controls** (`src/components/ui/field-controls.tsx`) — `ThemedSelect`, `DateField`, and `TimeField`, drop-in replacements for the native `<select>`, `<input type="date">`, and `<input type="time">`.
  - Popups render in a portal, so a dialog's overflow or stacking context can never clip them, and are pinned to their trigger with fixed coordinates that flip above when the viewport has no room below.
  - Panels re-measure after render, reposition on scroll and resize, and dismiss on outside pointer-down or Escape.
  - `ThemedSelect` options accept an optional colour swatch, used for task and transaction categories.
  - `DateField` wraps the shadcn calendar, parses `YYYY-MM-DD` at local noon so DST never shifts the day, honours `min`, and supports an optional `clearable` placeholder for The Horizon's "Repeat until".

### Changed

- Every native `<select>`, date, and time input across The Engine, The Vault, The Atmosphere, and The Horizon now uses the themed controls. The browser's own popup rendered as OS chrome — a white sheet on Windows/Chrome — punched through the dark glass theme.
- `color-scheme: dark` on `:root`, so remaining native chrome (number spinners, scrollbars, browser pickers) stays dark.
- `tailwind.config.ts` imports `tailwindcss-animate` and `@tailwindcss/typography` as ES modules instead of calling `require()`.

## [0.2.2] - 2026-09-06

### Added

- **Today on the Horizon** — a full-width widget on The Pulse showing the day's Google Calendar events: a count, all-day events first, then events sorted by start and end time, each with a friendly 12-hour time range. Clicking it opens The Horizon.
  - Reads the same `localStorage` key as The Horizon, so the widget follows whichever calendar you picked there.
  - Queries local midnight to local midnight and then filters by date, so a multi-day event that merely overlaps today is shown with its end date rather than as a stray row.
  - Distinct copy for the not-connected, error, and empty states — it never renders a bare zero when Google Calendar simply is not wired up.

## [0.2.1] - 2026-09-06

### Added

- **Skeleton loaders** (`src/components/ui/dashboard-skeletons.tsx`) — per-widget placeholders that match the shape of the content they stand in for: weather, AI smart summary, daily focus, Today on the Horizon, and the vault widget.
- A `shimmer` keyframe and animation in `tailwind.config.ts`, plus a `.skeleton-shimmer` utility in `src/index.css` — a tinted glass block with a highlight sweeping across it, which degrades to a static tint under `prefers-reduced-motion: reduce`.

### Changed

- `Skeleton` takes a `variant` of `"shimmer"` (default) or `"pulse"`, and is `aria-hidden`; the wrappers announce the busy region instead, so screen readers hear one status rather than a pile of empty blocks.
- The Pulse's widgets render these skeletons while loading, replacing the ad-hoc `animate-pulse` divs that were inlined in `HomePage.tsx`.

## [0.2.0] - 2026-09-06

The Horizon — the calendar tab now reads and writes a real Google Calendar
instead of rendering local tasks.

### Added

**The Horizon — Google Calendar integration**

- Vite middleware plugin (`server/calendar/plugin.ts`) serving Google Calendar over `/api/calendar/*` on both the dev server and `vite preview`. `googleapis` is Node-only, so every Google call happens server side and the browser bundle only ever sees JSON.
  - `GET /api/calendar/status` — `{ configured, connected, account? }`, which drives the whole tab.
  - `GET /api/calendar/auth/start` — redirect to Google's consent screen.
  - `GET /api/calendar/auth/callback` — exchange the code and store the refresh token.
  - `POST /api/calendar/auth/disconnect` — revoke the grant and forget the token.
  - `GET /api/calendar/calendars` — the calendars available to pick between.
  - `GET /api/calendar/events` — list events for a `calendarId` and `timeMin`/`timeMax` window.
  - `POST /api/calendar/events`, `PATCH|DELETE /api/calendar/events/:id` — event CRUD, with `?scope=single|all` for recurring events.
- OAuth layer (`server/calendar/oauth.ts`): consent URL generation, code exchange, token revocation, and a status probe that reports a revoked grant as disconnected rather than as a live token.
- Event layer (`server/calendar/events.ts`): calendar and event listing, create/patch/delete, and the mapping between Google's schema and the app's own event shape.
- `.env.local` writer (`server/calendar/envFile.ts`) that rewrites a single key's line as raw text, so comments, key order, and `OBSIDIAN_VAULT_PATH` all survive untouched.
- Date flattening — Google's `date`/`dateTime` union becomes the `YYYY-MM-DD` + `HH:MM` strings the rest of Crystal OS already uses, and an all-day event's exclusive end date is shifted back so it reads inclusively. Wall-clock parts are read straight off Google's strings, so an event shows the time its own calendar reports, not the server's.
- Recurrence — the event form composes and parses a single `RRULE` (daily/weekly/monthly/yearly with an optional end date). Listing uses `singleEvents`, so a series arrives as instances and an edit or delete asks whether it means *this event* or *all events*; leaving the repeat field alone never rewrites the series.
- Rewritten calendar page (`src/components/views/CalendarPage.tsx`) — month grid and 30-day agenda view, a day panel, an event form with all-day/timed, location, description and recurrence fields, a delete confirmation dialog, a calendar picker coloured by each calendar's own colour, and a connect/disconnect panel that names the missing environment variable when the integration is not configured.
- `useGoogleCalendar` hook — React Query bindings (`useCalendarStatus`, `useCalendarList`, `useCalendarEvents`, `useCreateEvent`, `useUpdateEvent`, `useDeleteEvent`, `useDisconnectCalendar`) that surface the API's own error messages instead of a bare status code.
- The selected calendar is remembered in `localStorage`.
- 33 unit tests: 21 over the event mappers (all-day boundaries, timezone handling, RRULE round trips, validation) and 12 over the `.env.local` writer (upsert, removal, comment and EOL preservation).

### Changed

- The calendar tab is now **The Horizon** and shows Google Calendar events. The previous local view — habit-streak heatmap, drag-and-drop weekly task board, and task day modal — has been replaced; tasks remain on their own tab.
- `.env.example` documents `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `GOOGLE_REFRESH_TOKEN`.
- README: Google Cloud setup steps, the endpoint table, the token/date/recurrence behaviour notes, and the updated project structure.

### Security

- The client secret and refresh token never reach the browser; only the refresh token is persisted, and the access token lives in process memory where `googleapis` refreshes it automatically.
- The `GOOGLE_*` keys are deliberately not `VITE_`-prefixed, so nothing is inlined into the client bundle.
- The consent flow carries a random `state` nonce that is verified on callback and expires after 10 minutes.
- Request bodies capped at 64 KB, matching the vault API.
- Deleting an event is the only destructive action in the app and is behind a confirmation dialog.

### Dependencies

- Added `googleapis`, `dotenv`.

## [0.1.0] - 2026-09-05

First tagged release. Crystal OS is a personal productivity dashboard — tasks,
calendar, finances, weather, Pomodoro — with an Obsidian vault wired in as a
first-class surface.

### Added

**The Archive — Obsidian vault integration**

- Vite middleware plugin (`server/obsidian/plugin.ts`) serving the vault over `/api/obsidian/*` on both the dev server and `vite preview`. `fast-glob` and `gray-matter` are Node-only, so all vault work stays server side and the browser bundle only ever sees JSON.
  - `GET /api/obsidian/notes` — list notes, with `?q=` search, `?tag=` filter, and `?limit=`.
  - `GET /api/obsidian/notes?path=<rel>` — read a single note including its body.
  - `POST /api/obsidian/quick-add` — append `{ text, notePath?, tags? }` to a note.
- Vault engine (`server/obsidian/vault.ts`): frontmatter parsing, title derivation, tag normalisation, markdown stripping for excerpts, and an mtime-keyed note cache.
- Ranked search — title (exact > prefix > substring) beats tags beats path beats body, with a snippet returned for body matches so the UI can show why a note matched.
- Quick Add appends a `- **HH:MM** text` bullet under a `## YYYY-MM-DD` heading, creating the note and any parent directories when missing. New notes fall back to an `inbox` tag so untagged captures stay findable.
- Frontmatter tag upsert that patches the YAML textually: the existing list style (inline `[a, b]` or block `- a`) is preserved and no other key is reformatted.
- The Archive page (`src/components/views/ArchivePage.tsx`) — searchable note list with tag chips and a GFM markdown reader that renders frontmatter, tags, and status. Obsidian wikilinks (`[[Note]]`, `[[Note|alias]]`) resolve to in-app navigation; unresolved links stay plain text instead of becoming dead anchors.
- Quick Add dialog (`src/components/QuickAddDialog.tsx`) — capture text, optional target note path, and tag entry with suggestions drawn from the vault's existing tags. Failures keep the dialog open so text is never lost.
- Vault widget on the home dashboard: recent notes, top tags as filters, and a quick-add shortcut.
- `useVault` hook — React Query bindings (`useVaultNotes`, `useVaultNote`, `useQuickAdd`) that surface the API's own error messages, so "OBSIDIAN_VAULT_PATH is not set" reaches the user instead of a bare status code.
- 42 unit tests over the vault engine covering path safety, tag normalisation, search ranking, frontmatter upsert across YAML styles, and quick-add appends.

**Command palette**

- Vault notes now appear in palette results, searched server-side across note bodies (2+ characters, debounced 250 ms).
- Quick Add is always offered as the first row, seeded with whatever has been typed.
- Selecting a note result opens it in The Archive.

**Elsewhere**

- `archive` tab in the sidebar and bottom navigation.
- `useDebouncedValue` helper in `src/lib/utils.ts`.
- `.env.example` documenting `OBSIDIAN_VAULT_PATH`.
- Weather section: current conditions and a 7-day forecast for saved Ontario locations, plus a home-dashboard widget.
- Category management UI for task and financial categories.

### Changed

- `AppContext` carries vault UI state (`selectedNotePath`, `showQuickAdd`, `quickAddDraft`) so the palette, the home widget, and The Archive can drive one another.
- Vitest now collects from `server/**` in addition to `src/**`.
- `@tailwindcss/typography` added to the Tailwind plugin list for the note reader.
- README rewritten: the Obsidian layer, the real dev port (8080), the actual environment variables, and the current project structure.

### Security

- Every vault filesystem access goes through `resolveVaultPath`, which rejects absolute paths, drive letters, and any traversal escaping the vault root.
- `OBSIDIAN_VAULT_PATH` is deliberately not `VITE_`-prefixed, so the vault location is never inlined into the client bundle.
- Request bodies capped at 64 KB, capture text at 10,000 characters, tags at 12 per request and 60 characters each, validated against the Obsidian tag charset.

### Dependencies

- Added `fast-glob`, `gray-matter`, `react-markdown`, `remark-gfm`.
