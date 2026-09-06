# Changelog

All notable changes to Crystal OS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
