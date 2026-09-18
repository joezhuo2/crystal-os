# Crystal OS

> A personal productivity dashboard built with React, TypeScript, Supabase, your Google Calendar, and your Obsidian vault. Tasks, calendar, finances, weather, a Pomodoro timer, and a searchable read/write view of your notes — all behind one glassmorphic interface and one command palette.

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2.97-3ECF8E?logo=supabase&logoColor=white)
![Tests](https://img.shields.io/badge/tests-301%20passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.6.6-6366F1)
![License](https://img.shields.io/badge/License-MIT-green)

Current release: **v0.6.6** — see [CHANGELOG.md](CHANGELOG.md) for release history.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📋 Tasks** | Full CRUD task management with categories, due dates, priorities, and completion tracking |
| **📅 The Horizon** | Google Calendar, live: month and agenda views, create/edit/delete events (delete confirmed), all-day and recurring events, multi-calendar picker, up to 15 event dots per day in the month grid |
| **🏠 Home widgets** | Clock, weather, AI smart summary, the Engine (top 3 tasks with quick-complete and add), today's calendar events, daily focus, and a vault widget — each with its own shimmer skeleton while loading |
| **💰 Financials** | Transaction tracking (income/expenses), categories, monthly summaries, and balance overview |
| **🌤️ Weather** | Current conditions + 7-day forecast for saved Ontario locations |
| **📖 The Archive** | Browse, search, and read your Obsidian vault in-app — frontmatter, tags, wikilinks, GFM markdown. The browser rail splits into an independently scrolling tag cloud and note list. Its own amethyst theme: glass crystals growing in from the screen edges, sparkles, and a cursor light the crystals reflect |
| **🌌 The Nebula** | A coding agent for your project folders (desktop). Three model tiers: Low (OmniRoute), Medium (NVIDIA NIM Kimi K3 → DeepSeek V4 Flash → Nemotron 3 → OmniRoute), and High (Claude Code). Also: Claude-style effort levels and Auto/Manual/Plan modes, your Claude skills and MCP servers, chat history per project, a context-window meter, per-model token counts, and a swirling three-colour nebula |
| **🌀 The Portal** | Discord, Instagram, and any other https web app as signed-in pages inside Crystal OS: its own app navbar, per-app sessions, unread badges, and three themes (desktop; the web build opens apps in new tabs) |
| **📝 Quick Add** | Append a timestamped, tagged capture to any vault note without leaving the dashboard |
| **⏱️ Pomodoro** | Customizable focus/break intervals, session tracking, audio notifications, and tray controls (Tasks view) |
| **🖥️ Desktop shell** | Native Tauri window with PowerShell terminal, tray (Pomodoro + Quick Add), always-on global hotkeys, and launch-at-login — the web build is unaffected |
| **⚙️ Settings** | Dedicated sidebar page for every preference: hotkeys, launch at login, vault folder, Nebula keys, models and look, Portal theme, and downloading or building an installer |
| **⌨️ Command Palette** | Global search over tasks, transactions, and vault note bodies, plus natural-language `add` / `log` commands and quick actions for a new capture or a new calendar event |
| **🎨 Theming** | Glassmorphism UI with light/dark mode, smooth Framer Motion animations, and themed select/date/time controls in place of native OS chrome |
| **📱 Responsive** | Mobile-first design with bottom navigation and collapsible sidebar |

---

## 🏗️ Tech Stack

| Category | Technologies |
|----------|--------------|
| **Frontend** | React 18, TypeScript, Vite |
| **UI** | shadcn/ui (Radix UI), Tailwind CSS, Lucide Icons |
| **State** | React Context + TanStack Query (React Query v5) |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime) |
| **Vault** | Vite middleware plugin + `fast-glob` + `gray-matter` (Node-only, server side) |
| **Calendar** | Vite middleware plugin + `google-auth-library` OAuth2 and the Calendar v3 REST API (Node-only, server side) |
| **Desktop** | Tauri 2 (Rust): global hotkeys, autostart, tray, native vault fs — plus a Node sidecar for the web APIs |
| **Terminal** | xterm.js + ConPTY in Rust (PowerShell, desktop only) |
| **The Portal** | Tauri child webviews (WebView2), one data directory per app, throttled and cache-trimmed while off screen (desktop only) |
| **Markdown** | react-markdown + remark-gfm + `@tailwindcss/typography` |
| **Forms** | React Hook Form + Zod validation |
| **Animation** | Framer Motion |
| **Date/Time** | date-fns |
| **Testing** | Vitest + React Testing Library |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- Supabase account (free tier works)
- An Obsidian vault on disk — optional; the app runs without one and The Archive shows a "vault unavailable" notice

### Installation

```bash
git clone https://github.com/joezhuo2/crystal-os.git
cd crystal-os
npm install
cp .env.example .env.local
npm run dev
```

Then edit `.env.local` to point `OBSIDIAN_VAULT_PATH` at your vault, and open http://localhost:8080.

### Environment Variables

```env
# .env.local

# Absolute path to your Obsidian vault. Use forward slashes on Windows.
# Read server-side only (see server/obsidian/plugin.ts) — deliberately NOT
# VITE_-prefixed, so it is never inlined into the client bundle.
OBSIDIAN_VAULT_PATH=C:/Users/you/Documents/MyVault

# Google Calendar. Same rule: server-side only, never VITE_-prefixed.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8080/api/calendar/auth/callback
# Written automatically after you click Connect. Leave blank.
GOOGLE_REFRESH_TOKEN=
```

Changing `OBSIDIAN_VAULT_PATH` or the `GOOGLE_*` keys requires a dev-server restart — Vite reads them once at config time. The one exception is `GOOGLE_REFRESH_TOKEN`, which the OAuth callback also holds in memory, so connecting takes effect immediately.

> **Note:** the Supabase URL and anon key are read from `VITE_SUPABASE_URL` and
> `VITE_SUPABASE_ANON_KEY` in `.env.local`. Being `VITE_`-prefixed, they are inlined
> into the client bundle and are public at runtime — that is normal for the anon key.
> Row Level Security is what protects the data. Never expose the `service_role` key.
>
> This app has no registration flow by design. Create your single account in the
> Supabase dashboard under **Authentication → Users**, and disable new signups under
> **Authentication → Providers**.

---

## 📁 Project Structure

```
server/
├── obsidian/
│   ├── plugin.ts               # Vite middleware: /api/obsidian/* routes
│   ├── vault.ts                # Node vault I/O (fast-glob, gray-matter) over src/lib/vaultCore.ts
│   └── vault.test.ts           # 42 unit tests over vault.ts
├── calendar/
│   ├── plugin.ts               # Vite middleware: /api/calendar/* routes
│   ├── oauth.ts                # OAuth2 client, refresh-token store, consent + revoke
│   ├── events.ts               # Google Calendar calls + event shape mapping
│   ├── envFile.ts              # Read/upsert a single key in .env.local
│   ├── errors.ts               # CalendarError (message + HTTP status)
│   ├── envFile.test.ts         # 12 unit tests over envFile.ts
│   └── events.test.ts          # 21 unit tests over the event mappers
├── auth/
│   └── requireUser.ts          # Supabase token check for authenticated routes
├── sidecar.ts                  # Node sidecar (crystal-api): serves the APIs on 127.0.0.1:8787
└── standalone.ts               # Both middlewares, shared by dev server, preview, and sidecar

src/
├── components/
│   ├── layout/
│   │   ├── AppSplash.tsx       # "Crystal OS / Loading…" splash while the session restores
│   │   ├── Navigation.tsx      # Sidebar + BottomNav (Terminal/Portal/Nebula/Archive restyle the sidebar)
│   │   ├── TerminalStatic.tsx  # Static-noise backdrop for the Terminal tab
│   │   ├── PortalBackdrop.tsx  # Themed backdrop for The Portal
│   │   └── ObsidianBackdrop.tsx # Crystal backdrop and cursor light for The Archive
│   ├── portal/
│   │   ├── PortalNavbar.tsx    # App pills (drag, right-click menu), browser controls
│   │   ├── PortalSkeleton.tsx  # Themed placeholder shown while an app's page loads
│   │   └── AddPortalAppDialog.tsx # Presets + custom https app
│   ├── ui/                     # shadcn/ui components (40+)
│   │   ├── field-controls.tsx  # ThemedSelect, DateField, TimeField (portalled popups)
│   │   └── dashboard-skeletons.tsx # Per-widget loading skeletons for the home page
│   ├── views/                  # Page-level components
│   │   ├── HomePage.tsx        # Clock, weather, smart summary, Engine, today's events, daily focus, vault widget
│   │   ├── TasksPage.tsx       # Task list, form, filtering, Pomodoro
│   │   ├── CalendarPage.tsx    # Google Calendar: month + agenda, event CRUD
│   │   ├── FinancialsPage.tsx  # Transactions, summaries, charts
│   │   ├── WeatherPage.tsx     # Detailed weather view
│   │   ├── ArchivePage.tsx     # Vault browser: search, tags, markdown reader
│   │   ├── TerminalPage.tsx    # Up to 5 PowerShell terminals in tabs (xterm.js, desktop only)
│   │   ├── PortalPage.tsx      # The Portal: places the active app's webview over its frame
│   │   ├── SettingsPage.tsx    # Hotkeys, launch at login, vault folder, Portal theme, Install & update
│   │   ├── InstallerSection.tsx # Release picker, installer download, build-from-source log
│   │   ├── PomodoroTimer.tsx   # Focus timer component
│   │   └── CategoryManager.tsx # Category CRUD for tasks/finances
│   ├── CommandPalette.tsx      # Search, NL commands, vault note results
│   ├── QuickAddDialog.tsx      # Append a capture to a vault note
│   └── NavLink.tsx
├── contexts/
│   └── AppContext.tsx          # Global state (tasks, transactions, categories, vault + event-form UI)
├── hooks/
│   ├── useVault.ts             # React Query bindings: /api/obsidian/* on web, Rust on desktop
│   ├── useGoogleCalendar.ts    # React Query bindings for /api/calendar/*
│   ├── useGlobalHotkey.ts      # useGlobalHotkeys (toggle window) + usePaletteHotkey (search)
│   ├── usePomodoro.ts          # Pomodoro store bindings (page + tray share src/lib/pomodoro.ts)
│   ├── usePortal.ts            # Portal store bindings, overlay occlusion, session start
│   ├── useTrayQuickAdd.ts      # Tray Quick Add events
│   ├── useEscapeKey.ts         # Stacked Escape-to-close for overlays (topmost closes first)
│   ├── useWeather.ts           # Weather API integration
│   ├── use-toast.ts            # Toast notifications (Sonner)
│   └── use-mobile.tsx          # Responsive breakpoint hook
├── lib/
│   ├── supabase.ts             # Supabase client + helpers
│   ├── vaultCore.ts            # Shared vault logic: parsing, search, tags, quick-add formatting
│   ├── vaultNative.ts          # Desktop vault client for src-tauri/src/vault.rs
│   ├── obsidianScene.ts        # Archive backdrop: crystal shapes, edge layout, cursor light maths
│   ├── terminalNative.ts       # Desktop terminal bridge (terminal_* commands, event routing per shell)
│   ├── portalApps.ts           # Portal presets, URL/id validation, badge parsing
│   ├── portalStore.ts          # Module-level Portal store: apps, active app, badges, theme
│   ├── portalNative.ts         # Desktop Portal bridge (portal_* commands)
│   ├── installerNative.ts      # Desktop installer bridge (installer_* commands, version helpers)
│   ├── pomodoro.ts             # Module-level Pomodoro store (page + tray agree)
│   ├── tray.ts                 # Tauri tray events → app, app state → tray menu
│   ├── hotkey.ts               # Hotkey parsing + combo validation
│   ├── platform.ts             # isDesktop(), apiUrl(), openExternal()
│   ├── apiRequest.ts           # Authenticated fetch wrapper for server routes
│   ├── seedCategories.ts       # Default task/finance category seeds
│   └── utils.ts                # cn(), useDebouncedValue(), date helpers, formatters
├── pages/
│   ├── Index.tsx               # Main layout, view registry, global overlays
│   └── NotFound.tsx
├── App.tsx                     # Providers + Router setup
└── main.tsx                    # Entry point

src-tauri/
├── src/
│   ├── main.rs                 # Entry point; single-instance enforcement
│   ├── lib.rs                  # App setup: plugins, tray, hotkeys, command registration
│   ├── window.rs               # Show/hide-to-tray close behaviour
│   ├── tray.rs                 # System tray menu + Pomodoro status updates
│   ├── hotkey.rs               # RegisterHotKey bindings (Alt+Space, Alt+Shift+Space)
│   ├── autostart.rs            # Launch-at-login (--hidden) registration
│   ├── settings.rs             # settings.json read/write (hotkeys, vaultPath, launchAtLogin, installerSourceDir)
│   ├── vault.rs                # Native vault I/O: list/read/write/status/watch
│   ├── terminal.rs             # ConPTY PowerShell shells (up to 5)
│   ├── portal.rs               # Portal child webviews: show/hide/fade, snapshots, per-app data, sign-out, background memory
│   ├── portal/webview2.rs      # WebView2 page capture, tab-shortcut forwarding, memory level for Portal apps
│   └── installer.rs            # GitHub releases, installer download, build:desktop from a checkout
├── capabilities/
│   └── default.json            # App command allowlist by name
└── tauri.conf.json             # Window, tray, bundle config
```

---

## 📖 The Archive (Obsidian integration)

Crystal OS reads your vault directly off disk, through one of two backends behind the same hooks (`src/hooks/useVault.ts`):

- **Web** — a Vite middleware plugin. `fast-glob` and `gray-matter` are Node-only and the vault is a local directory, so that work happens server-side and the browser bundle only ever sees JSON. The vault is set with `OBSIDIAN_VAULT_PATH`.
- **Desktop** — Rust commands in `src-tauri/src/vault.rs`, on a folder picked in the app. See [Desktop App → Vault](#-desktop-app-tauri).

Parsing, search ranking, tag handling, and quick-add formatting live in `src/lib/vaultCore.ts` and are shared by both, so the two behave the same.

### Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/obsidian/notes` | List notes (`?q=` search, `?tag=` filter, `?limit=`) |
| `GET` | `/api/obsidian/notes?path=<rel>` | Read one note, including its body |
| `POST` | `/api/obsidian/quick-add` | Append `{ text, notePath?, tags? }` to a note |

The middleware is mounted on both the dev server and `vite preview`. It is **not** part of a static production build — a bare `dist/` deployment has no vault access.

### Behaviour

- **Search ranking** — title (exact > prefix > substring) beats tags beats path beats body; body hits return a snippet so the UI can show *why* a note matched.
- **Frontmatter** — `title`, `tags`, `date`, and `status` are modelled explicitly; every other key is surfaced as-is in the reader.
- **Wikilinks** — `[[Note]]` and `[[Note|alias]]` resolve to in-app navigation; unresolved links stay plain text rather than becoming dead anchors.
- **Quick Add** — appends a `- **HH:MM** text` bullet under a `## YYYY-MM-DD` heading, creating the note (and any parent directories) when missing. Supplied tags are merged into the note's frontmatter; the existing YAML list style (inline or block) is preserved and no other key is reformatted.
- **Caching** — parsed notes are cached per path and invalidated on `mtime` change.

### Layout

The browser rail is a fixed-height column split into two halves that scroll independently: the tag cloud on top, the filtered note list below, with the note count between them as a divider and the search field pinned above both. Each half is `flex-1 basis-0 min-h-0`, so a vault with many tags cannot crowd the list out of view, and a vault with few tags leaves the extra space to the list.

### Theme

The Archive has its own dark amethyst look. The panels, tags, note list, buttons, and sidebar turn violet, and `ObsidianBackdrop` (`src/components/layout/ObsidianBackdrop.tsx`) draws the scene behind them with CSS, SVG, and DOM only (no canvas, WebGL, or 3D library):

- **Crystals.** 32 glass crystals grow in from the four corners and edges, in five faceted shapes, at resting opacities between 0.3 and 0.9. Each one is tilted to point into the screen and pushed out along its own axis until its flat base sits past the edge, so no root is ever on screen. The layout is seeded, so it is the same on every visit (`src/lib/obsidianScene.ts`).
- **Sparkles.** Four-point stars twinkle at random across the background, and one sits near the tip of each crystal, on top of the glass.
- **Cursor light.** A soft violet aura follows the pointer and breathes between 0.5 and 0.8 opacity. It fades out when the pointer leaves the window.
- **Reflections.** A crystal near the pointer lights up: a brighter rim, a halo, and a second glass layer with a stronger `backdrop-filter` (brightness, saturation, contrast) that carries a glint positioned where the pointer is. The light is worked out in the crystal's own rotated frame, so tilted crystals light along their length.

The pointer never touches React state. One `pointermove` listener schedules at most one animation frame. That frame reads every crystal's position first, then writes `--obsidian-mx`/`--obsidian-my` on the backdrop and `--lit`/`--lx`/`--ly` on each crystal it lights, skipping crystals that stay dark. The CSS turns those properties into `transform` and `opacity`, which the compositor handles. The floating, twinkling, growing, and breathing animations use only transforms and opacity. The stronger reflection layer is `visibility: hidden` while its crystal is dark, so its filter only runs near the pointer. With reduced motion on, the animations stop and the cursor light still works.

### Safety

On the web, every filesystem access goes through `resolveVaultPath`, which rejects absolute paths, drive letters, and any traversal escaping the vault root. On desktop, `vault.rs` does the same and also refuses `..`, NTFS stream names, and symlinks or junctions that lead out of the vault. Request bodies are capped at 64 KB, capture text at 10,000 characters, and tags at 12 per request / 60 characters each, validated against the Obsidian tag charset.

---

## 📅 The Horizon (Google Calendar integration)

The calendar tab reads and writes your real Google Calendar. The client secret and refresh token must never reach the browser, so every Google call happens in a Vite middleware plugin and the bundle only ever sees JSON — the same shape as the Obsidian tier above.

### Setup

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. On the OAuth consent screen, choose **External**, add your own account under **Test users**, and add the scopes `.../auth/calendar.events` and `.../auth/calendar.readonly`.
3. Create an OAuth client of type **Web application** with the authorized redirect URI `http://localhost:8080/api/calendar/auth/callback` — it must match `GOOGLE_REDIRECT_URI` exactly.
4. Put the client id and secret in `.env.local`, restart the dev server, open **The Horizon**, and click **Connect Google Calendar**.

### Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/calendar/status` | `{ configured, connected, account? }` — drives the connect UI |
| `GET` | `/api/calendar/auth/start` | Redirect to Google's consent screen |
| `GET` | `/api/calendar/auth/callback` | Exchange the code and store the refresh token |
| `POST` | `/api/calendar/auth/disconnect` | Revoke the grant and forget the token |
| `GET` | `/api/calendar/calendars` | List the calendars you can pick between |
| `GET` | `/api/calendar/events` | List events (`?calendarId=&timeMin=&timeMax=`) |
| `POST` | `/api/calendar/events` | Create an event |
| `PATCH` | `/api/calendar/events/:id` | Update an event (`?scope=single\|all`) |
| `DELETE` | `/api/calendar/events/:id` | Delete an event (`?scope=single\|all`) |

As with the vault, the middleware is mounted on the dev server and `vite preview` only — a bare `dist/` deployment has no calendar access.

### Behaviour

- **Tokens** — only the refresh token is persisted, mirrored into `.env.local` on a single line without disturbing anything else in the file. The access token lives in process memory and is refreshed automatically. Neither is ever sent to the browser.
- **Dates** — Google's `date`/`dateTime` union is flattened server-side into the `YYYY-MM-DD` + `HH:MM` strings the rest of the app uses, and an all-day event's exclusive end date is shifted back so it reads inclusively. Wall-clock parts are read off Google's own strings, so an event shows the time its calendar says it is, not the server's.
- **Recurrence** — the form writes a single `RRULE` (daily/weekly/monthly/yearly, with an optional end date). Listing expands a series into instances, so editing or deleting one asks whether you mean *this event* or *all events*; leaving the repeat field alone never rewrites the series.
- **Deleting** — the only destructive action in the app behind a confirmation dialog. Nothing is removed until you confirm.

### Safety

The consent flow carries a random `state` nonce that is verified on callback and expires after 10 minutes. Request bodies are capped at 64 KB. `google-auth-library` is Node-only and is never imported from `src/` — the client re-declares the event types it needs. The server calls the Calendar REST endpoints directly through `OAuth2Client.request` rather than the full `googleapis` client, which kept the desktop sidecar bundle at 13.5 MB (now about 650 KB).

---

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
category leaves its tasks intact and uncategorised rather than deleting them.

Apply [`supabase/migrations/0001_auth_and_rls.sql`](supabase/migrations/0001_auth_and_rls.sql)
in the Supabase Dashboard → SQL Editor, then run `npm run verify:rls` to confirm the
anon role can read and write nothing.

---

## 🎯 Key Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run preview      # Preview production build (vault + calendar APIs included)
npm run lint         # ESLint check
npm run test         # Run tests (Vitest) — covers src/ and server/
npm run test:watch   # Watch mode

npm run dev:desktop   # Native window on the Vite dev server (needs Rust)
npm run build:sidecar # Bundle server/ into src-tauri/binaries/crystal-api-<triple>.exe
npm run build:desktop # Sidecar + web build + Windows installer
```

---

## 🖥️ Desktop App (Tauri)

The same app runs as a native window. The web commands above are unchanged, and none of them need Rust. See [ADR 0001](docs/adr/0001-desktop-shell.md) for the reasoning.

### Prerequisites
- [Rust](https://rustup.rs) (`winget install Rustlang.Rustup`, then `rustup default stable-msvc`)
- Visual Studio 2022 Build Tools with the **Desktop development with C++** workload
- WebView2 (preinstalled on Windows 11)

### Development

```bash
npm run dev:desktop
```

This starts Vite on port 8080 and opens a native window on it. HMR works, and the vault and calendar APIs come from the Vite middleware, the same as in the browser. It reads the repo's `.env.local`.

### Packaged build

```bash
npm run build:desktop
```

This produces an installer in `src-tauri/target/release/bundle/`. The packaged app has no Vite server. Instead, Tauri launches `crystal-api`, a Node sidecar that serves the same `/api/obsidian` and `/api/calendar` routes on `127.0.0.1:8787` and exits with the app.

`VITE_SUPABASE_*` are baked in at build time. The sidecar reads its server-side settings from the app config directory:

1. Copy `.env.local` to `%APPDATA%\com.crystalos.desktop\.env.local`. It needs the `VITE_SUPABASE_*` keys too, for token checks.
2. Add `http://127.0.0.1:8787/api/calendar/auth/callback` as a second authorized redirect URI on your Google OAuth client, and set `GOOGLE_REDIRECT_URI` to it in that copy.
3. Launch Crystal OS. **Connect** in The Horizon opens Google in your default browser. Once it reports success, switch back to the app.

**Settings.** The gear at the bottom of the sidebar opens **Settings**, which holds every desktop preference: both global hotkeys, **Launch at login**, the vault folder, The Portal's theme, and **Install & update**. The palette's **Open Settings** row goes there too. Click the Crystal OS mark at the top of the sidebar to return to **The Pulse** (home) from any page.

**Install & update.** The last panel in Settings keeps Crystal OS current without leaving the app.

- **Download an installer.** The panel lists every published release of `joezhuo2/crystal-os` and pre-selects the newest stable one that has a Windows installer attached. **Download** saves it to your Downloads folder with a progress bar, then offers **Show in folder**. Run the installer yourself when you are ready; Crystal OS never installs over itself.
- **Choose a different version.** The dropdown holds every release, each labelled where it matters — `installed`, `newer`, `pre-release`, or `no installer`. Pick an older version to roll back, or a pre-release to try one early. A release with no Windows asset can be selected but not downloaded; build it from source instead.
- **Build the latest from source.** Runs `npm run build:desktop` in a Crystal OS checkout and streams the build log into the panel, with **Stop** to end the whole process tree. It needs Node.js and the Rust toolchain, and takes several minutes. The packaged app ships no source, so **Choose folder** points it at a checkout; the path is saved as `installerSourceDir` in `settings.json` and is rejected if the folder has no `build:desktop` script. Under `dev:desktop` the checkout the binary was compiled in is used automatically.
- **Why it runs in Rust.** `api.github.com` is deliberately absent from the webview's `connect-src`, the webview cannot write to Downloads, and a build has to spawn a process. `installer_reveal` only opens files under the Downloads folder or the checkout's `target` directory, so it cannot be used to browse the disk.

**Terminal.** The terminal icon above Settings opens a PowerShell terminal (PowerShell 7 if installed, otherwise Windows PowerShell) running on a real pseudoconsole, so colours, tab completion, and interactive prompts work. Shells keep running while you switch tabs and are killed when Crystal OS quits.

- **Up to 5 terminals at once.** The strip above the frame has one tab per shell, **+** to open another (disabled at the limit, shown as `n/5`), and **×** to close one. Middle-click also closes a tab. The last terminal cannot be closed. Every shell keeps running in the background; switching tabs never interrupts a command. Coming back to the Terminal page reopens the tab you last used.
- Shortcuts while a terminal has focus: **Ctrl+Shift+T** new tab, **Ctrl+Shift+W** close tab, **Ctrl+Tab** / **Ctrl+Shift+Tab** next / previous tab.
- **Refresh** restarts the selected shell with PATH and the other environment variables read again from the registry. Use it after installing something (`winget`, `npm -g`, an installer) that the terminal does not find yet: a running app keeps the environment it started with, so a plain restart of the shell would not see the change.
- Ctrl+C copies when text is selected and interrupts otherwise; Ctrl+V pastes.
- The shells run in Rust (`src-tauri/src/terminal.rs`) and the view talks to them through `terminal_list`, `terminal_open`, `terminal_attach`, `terminal_restart`, `terminal_close`, `terminal_write`, and `terminal_resize` (`src/lib/terminalNative.ts`). Every command after `terminal_open` takes the shell's `id`; the Rust side enforces the limit of 5.
- **Cascadia Mono is bundled with the app** (`@fontsource/cascadia-mono`), not read from the machine, so the terminal looks the same whether or not Windows Terminal is installed. Only the subsets a shell draws ship: latin, latin-ext, and the box-drawing block TUIs use for borders, in regular and bold. The view waits for the face to load before opening xterm, because xterm measures the character cell once and keeps those metrics for the life of the terminal.
- While the tab is open the window switches to a black, glitching monochrome look, and the search bar is hidden.

**The Portal.** The orbit icon above Terminal opens **The Portal**, where web apps such as Discord and Instagram run as real pages that you sign in to once. See [ADR 0002](docs/adr/0002-portal-child-webviews.md) for how it works.

- **Connect an app** with **+** in the Portal's navbar: pick a preset (Discord, Instagram, LinkedIn, Spotify, X, Reddit, Gmail, Outlook) or add any `https://` site by name and address. Two presets carry WebView2 limits: Google blocks sign-in from embedded webviews, so Gmail may send you to a real browser for the password step, and Spotify's web player needs Widevine DRM that WebView2 does not ship, so it browses but does not play.
- **Use it like a browser tab.** Click a pill to switch apps (the pages cross-fade). **Back**, **Forward**, **Reload**, and **Open in browser** act on the app on screen. Links to other sites open in your default browser.
- **Organise.** Drag pills to reorder them. Right-click a pill to reload it, return to its home page, open it in the browser, toggle **Keep live in background**, **Sign out…**, or **Remove…**.
- **Sessions.** Each app keeps its cookies and storage in its own folder, `%APPDATA%\com.crystalos.desktop\portal\<app id>\`, so you stay signed in across restarts and apps never share a login. **Sign out** clears that app's cookies and storage; **Remove** deletes its folder too.
- **Loading.** While an app's page loads (first open, **Reload**, **Back to home page**, **Sign out**), the frame shows a skeleton of a web app in the theme's colours with "Loading <app>…". The page appears, fading in, once it has finished loading, or after 20 seconds if it never reports that.
- **Always on.** Apps load the first time you open The Portal after launching Crystal OS, then keep running while you use other tabs. Unread counts from their page titles show on each pill and on the sidebar's Portal icon.
- **Background cost.** An app you are not looking at is throttled — its timers and animations are slowed, but it is not suspended, so its connection stays open and messages still arrive. After 30 seconds off screen it also drops its render caches, and picks them back up when you return to it. Hiding Crystal OS to the tray does both at once, for every app and for Crystal OS's own interface. If an app needs full speed while hidden, for a voice call or a live notification stream, right-click its pill and turn on **Keep live in background**; that costs CPU for as long as it is on, so it is off by default. Toggling it rebuilds that app's page, which does not sign you out.
- **Themes.** Choose **Void swirl** (default), **Event horizon**, or **Stargate blue** under **Settings → The Portal**. The theme styles the backdrop, sidebar, navbar, and the animated ring around the app.
- **Keyboard shortcuts (desktop).** While a Portal app is on screen: **Ctrl+Tab** cycles to the next app, **Ctrl+Shift+Tab** cycles to the previous one, **Ctrl+W** opens the Remove confirmation, and **Ctrl+R** reloads the active app. They also work while you are typing inside an app page (Windows): the app's webview catches them before the page does. In Crystal OS's own UI they are disabled while a dialog is open or the focus is inside a text field. `Ctrl+R` prevents Tauri's default full-page reload, which would otherwise drop you to the Home tab.
- **Web build.** Browsers refuse to embed these sites in another page, so there the Portal keeps your app list and opens each app in a new tab.
- The app pages draw above Crystal OS's own UI, so the search bar is hidden on this tab and menus and dialogs (such as the pill right-click menu or tray **Quick Add**) hide the app while they are open. A still picture of the page stays in its place behind them. The pages get no access to Crystal OS commands. The view talks to Rust through the `portal_*` commands in `src/lib/portalNative.ts`.

**Global hotkeys.** Two combos work from any app:

- `Alt+Space` shows Crystal OS; press it again while the app is in front to hide it, including while you are typing in a Portal app. It does not touch the search bar. Saved as `globalShortcut`.
- `Alt+Shift+Space` shows Crystal OS and focuses the search bar. Saved as `paletteShortcut`.

Change either with **Change** in Settings. Both are saved in `%APPDATA%\com.crystalos.desktop\settings.json`, and the two cannot share a combo. If another app already owns one, Crystal OS still starts and shows a toast.

**Always ready.** The hotkeys only work while Crystal OS is running, so the app stays running in the tray:

- **Launch at login** is on by default. The first time you open the packaged app it registers itself to start at sign-in with `--hidden`, which keeps the window in the tray until you press a hotkey. Turn it off in Settings; the choice is saved as `launchAtLogin` in `settings.json`. Debug builds (`npm run dev:desktop`) never register.
- **Closing the window hides it to the tray.** Use **Quit Crystal OS** in the tray to exit.
- **One instance.** Opening Crystal OS while it is already running shows the existing window.

**Tray.** Crystal OS adds a gem icon to the system tray (a monochrome template icon in the macOS menu bar). Left-click it on Windows to show or hide the window; right-click for the menu:

- **Show / Hide Crystal OS**
- **Pomodoro** — a live status row (`Focus 24:12`), **Start**/**Pause**, and **Reset**. The tray tooltip shows the same countdown.
- **Quick Add…** — shows the window and opens the Quick Add dialog.
- **Quit Crystal OS**

The Pomodoro timer lives in `src/lib/pomodoro.ts`, so it keeps running when you leave the Tasks page and the tray and the on-page timer always agree. Tray clicks reach it as Tauri events (`tray://pomodoro`, `tray://quick-add`) handled in `src/lib/tray.ts`, which reports every visible change back to Rust (`update_tray_pomodoro` in `src-tauri/src/tray.rs`).

**Vault.** The desktop app reads your Obsidian vault natively; it does not use `OBSIDIAN_VAULT_PATH` or the sidecar's `/api/obsidian` routes. On first launch, The Archive shows **Choose vault folder**, which opens the system folder picker. The choice is saved as `vaultPath` in `settings.json`; change it later with **Change folder** in Settings.

- **Live updates.** A file watcher (`notify`, debounced 250 ms) emits `vault://changed` whenever a note is added, edited, renamed, or deleted, and every vault view refetches. Edits made in Obsidian show up without a refresh. Only changed notes are re-read.
- **Scoped access.** The webview has no fs, shell, or dialog plugin permissions (the Terminal tab runs its shell through its own commands, not the shell plugin). It reaches the vault only through six commands (`get_vault_status`, `pick_vault`, `list_vault`, `read_vault_file`, `write_vault_file`, `watch_vault`), and `src-tauri/capabilities/default.json` allowlists every app command by name. Each path must be a `.md` file inside the picked folder, outside `.obsidian`, `.trash`, `.git`, and `node_modules`.
- **Safe writes.** Quick Add writes to a temp file and swaps it in. It sends the `mtime` it read, so if Obsidian saves the note in between, the append is redone on top of that edit instead of overwriting it.
- **When things go wrong.** A saved folder that is gone at startup (renamed, or on an unplugged drive) or unreadable shows a card with **Choose vault folder** and **Retry**; the watcher restarts once the folder is back. A note deleted while open shows **This note is gone** with **Close note**.

Code that behaves differently on desktop goes through `src/lib/platform.ts` (`isDesktop()`, `apiUrl()`, `openExternal()`), so the web bundle never imports Tauri.

---

## 🌌 The Nebula (coding agent)

The Nebula is a coding agent tab in the desktop app. It works inside project folders you choose, keeps a history of chats for each project, and runs on three model tiers. The design, and what the spike established about each engine, are in [ADR 0003](docs/adr/0003-nebula-deepseek-harness.md).

### Setup

1. Install **Node.js 22 or newer**. For the High tier, also install **Claude Code** and sign in: run `claude`, then `/login`.
2. Open **The Nebula** and click **Install DeepSeek Harness**. This installs the pinned `@deepseek-ai/dsh` into `%APPDATA%\com.crystalos.desktop\dsh` once.
3. In **Settings → The Nebula**, paste your **NVIDIA NIM** API key (used by Medium). For Low, make sure OmniRoute is running on `localhost:20128`, and add an **OmniRoute** key only if your OmniRoute needs one.
4. Click **New project**, open or create a folder, and start chatting.

### Tiers

| Tier | Engine | Models |
|------|--------|--------|
| Low | DeepSeek Harness | OmniRoute `auto/coding` |
| Medium | DeepSeek Harness | First available of NIM Kimi K3 → DeepSeek V4 Flash → Nemotron 3 Ultra → OmniRoute `auto/coding` |
| High | Claude Code | The model set in Settings (default `opus`), always on your Anthropic account |

Model ids and endpoints can be edited in Settings. Effort (low to max) and mode (**Auto**, **Manual**, **Plan**) are set per chat in the toolbar. Tier and effort cannot be changed while the agent is working.

The toolbar's **Context** chip shows how full the current model's context window is after its latest step (amber from 70%, red from 90%); hover it for the exact count. Claude Code reports the window size; for DeepSeek Harness models that do not, it shows the token count alone.

### How it works

- **Low and Medium** talk to one `dsh --profile acp` process per project folder over the Agent Client Protocol (`src/lib/harness/acpClient.ts`). Model and effort are set on every turn, and if a model fails before answering, the turn moves on to the next one.
- **High** drives `claude -p` in stream-json mode (`src/lib/harness/claudeStream.ts`). In Manual mode, approval requests arrive as `can_use_tool` control requests and appear as Allow / Deny cards.
- **Skills and MCP servers** are read from `~/.claude/skills`, enabled Claude Code plugins, Claude Desktop, and `~/.claude.json` (`src-tauri/src/harness/discovery.rs`). You can turn individual servers off in Settings.
- **Storage.** Everything is under the app config folder:
  - `harness/state.json`: projects, the chat index, and all-time token totals.
  - `harness/chats/<id>.json`: one transcript per chat, with its token counts and last context reading.
  - `harness/logs/`: engine stderr.

### Safety

- API keys and MCP server environment values never reach the webview. Keys are write-only in Settings.
- Claude Code is launched:
  - without any `ANTHROPIC_*` or `CLAUDE*` variables inherited from Crystal OS;
  - with an override that points it back at api.anthropic.com;
  - with arguments built only from validated enums, ids, and paths.

  `bypassPermissions` is never used.
- Every agent process joins a kill-on-close Windows Job Object. Closing Crystal OS or reloading the page ends the agents and everything they started.
- In Auto mode the agent runs tools inside the project folder without asking. Use Manual to approve each action, or Plan to explore without making changes.

---

## ⌨️ Command Palette

`Cmd/Ctrl + K` focuses the palette while Crystal OS is focused; on desktop, `Alt+Shift+Space` does the same from any app. It filters tasks and transactions locally and searches vault notes server-side (2+ characters, debounced 250 ms), and understands two natural-language prefixes:

| Input | Result |
|-------|--------|
| `add Buy milk` | Creates a task |
| `log 25 for Lunch` | Records an expense |
| *"Add a new event"* | Opens The Horizon's create-event form for today |
| *anything else* | Filters tasks, transactions, and vault notes; **Quick Add** is always offered as the first row |

Selecting a note result opens it in The Archive.

### Closing overlays

`Escape` closes whichever overlay is on top — the palette, event form, day panel, task form, transaction drawer, or category manager. Stacked overlays close one per press, and an open select or date popup inside a form closes before the form does. The event form ignores `Escape` while a save is in flight.

---

## 🎨 Customization

### Theming
Edit `tailwind.config.ts` and `src/index.css` for:
- Color palette (CSS variables in `:root` and `.dark`)
- Glassmorphism intensity (`backdrop-blur`, opacity)
- Animation durations (including the `shimmer` keyframe behind `.skeleton-shimmer`)

Native `<select>`, date, and time inputs are replaced app-wide by `src/components/ui/field-controls.tsx`, because the browser's own popups render as OS chrome — a white sheet on Windows/Chrome — through the dark glass theme. Their popups are portalled, so a dialog's overflow or stacking context cannot clip them, and they flip above the trigger when the viewport has no room below. `:root` also sets `color-scheme: dark` so any remaining native chrome (number spinners, scrollbars) stays dark.

### Adding New Views
1. Create the component in `src/components/views/`
2. Add its id to `TabId` and the `tabs` array in `src/components/layout/Navigation.tsx`
3. Register it in the `views` record in `src/pages/Index.tsx`

Write Tailwind-scanned class names out in full. A class built at runtime, such as `` `portal-theme-${theme}` ``, is purged from the CSS; map values to literal class strings instead (see `PORTAL_THEME_CLASS` in `src/lib/portalStore.ts`).

---

## 📦 Deployment

The vault API needs a Node process. A static host serves the dashboard fine, but The Archive will report the vault as unavailable.

### Vercel (Recommended)
```bash
npm i -g vercel
vercel --prod
```
Set environment variables in the Vercel Dashboard.

### Netlify
```bash
npm run build
# Deploy dist/ folder
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 4173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
```
Mount your vault into the container and set `OBSIDIAN_VAULT_PATH` to the mount point to keep The Archive working under `preview`.

---

## 📄 License

MIT
