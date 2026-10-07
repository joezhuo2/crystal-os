# Crystal OS

> A personal productivity dashboard built with React, TypeScript, Supabase, your Google Calendar, and your Obsidian vault. Tasks, calendar, finances, weather, a Pomodoro timer, and a searchable read/write view of your notes — all behind one glassmorphic interface and one command palette.

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2.97-3ECF8E?logo=supabase&logoColor=white)
![Tests](https://img.shields.io/badge/tests-762%20passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.9.5-6366F1)
![License](https://img.shields.io/badge/License-MIT-green)

Current release: **v0.9.5** — see [CHANGELOG.md](CHANGELOG.md) for release history.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🪐 The Orbit** | Weekly and monthly reviews, between Home and the Engine. A Weekly/Monthly switch shows the latest finished period (ready Sunday at 6 PM, or 6 PM on the month's last day) with arrows to browse back: tasks completed and added (counts and names, the first five then **+N more**), Pomodoro focus total and per-day (and per-week) averages with a bar per day and a donut of focus by task (a slice per linked task, the rest as **Other**, unlinked time as **No task**; hover for time, share and sessions), income and spending against the last period, the next period's calendar events and tasks as a mini agenda (by day, or by week for a month), new vault notes, and a trend list against the last period and the 4-week or 3-month average. **Habits**: the Today card has a chip per habit to tick off today, a streak on hover, and a grid of this week (or this month, with the Monthly switch) lit by how many were done each day; the gear opens a manager to add, rename, recolour, reorder and remove them. Each review gets a Habits card (days done, rate, longest streak and streak at the end per habit, plus an optional note) and a habit completion trend. Pick an optional reflection prompt, add a note, and **Export to vault** writes `Reviews/Weekly/2026-W40.md` or `Reviews/Monthly/2026-10.md`, asking before overwriting. A dot on the nav icon and a chip on Home mark a review you have not opened yet; **Settings → The Orbit → Auto-export reviews** writes each one when it is ready. Its own pale black hole backdrop and ice-and-lavender liquid glass, also on the Home greeting card, which opens it |
| **📋 Tasks** | Full CRUD task management with categories, due dates, priorities, and completion tracking. Repeats every N days, weekly on chosen weekdays, monthly on the start date's day, or N days after you complete it (for chores that slide). Overdue tasks get their own group at the top of the list with a one-click **Today** reschedule. Each task can carry a time estimate (15m, 30m, 1h, 2h, 4h or any number of minutes), shown on its card, and a **Fits today?** bar at the top of the page weighs today's open estimates against the free time left in your work day, minus timed events in your Horizon calendar. See [Time estimates and capacity](#-time-estimates-and-capacity). Tasks also carry notes and subtasks: a checklist on the task, and other tasks nested under it, with a **+N subtasks** count on the card. See [Notes and subtasks](#-notes-and-subtasks). Any open task can be snoozed until a later date or to Someday, and stays out of the way until it wakes. See [Snoozing tasks](#-snoozing-tasks). The Engine page has its own red black hole backdrop and ember palette, matching the Horizon's look. Switching between List and Board fades one view out and the other in (instantly in performance mode) |
| **📅 The Horizon** | Google Calendar, live: month, week, day and agenda views (week and day are hour grids: overlapping events sit side by side, a line marks now, and clicking an empty slot creates an event at that half hour), create/edit/delete events (delete confirmed), all-day and recurring events, multi-calendar picker, up to 15 event dots per day in the month grid. The dots cascade in when the page opens, and paging months fades and slides the whole grid, with the neighbouring months prefetched so their dots come along. The page has its own black hole backdrop and blue palette (see [The Horizon](#-the-horizon-google-calendar-integration)) |
| **🏠 Home widgets** | A 3×3 grid: the greeting and clock (on The Orbit's black hole, with this week's tasks done and focus time; opens The Orbit), weather (with a one-line nudge such as "Rain from 4 PM, take an umbrella"), and a Vault card (this month's net, in/out, top spend); the Engine (top 3 open tasks with quick-complete and add, a free-time bar with today's planned work and a nudge toward the next task ("Want to start Write report?"), or once today is clear the next 14 days' tasks, highest priority first, with a nudge to get a head start on one), today's calendar events, and the Archive; then Nebula, Portal and Terminal boxes. The weather, Engine, Horizon, Archive, Nebula, Portal and Terminal boxes are each themed like their page (a small Living Sky with your Atmosphere settings, the Engine's red black hole, the Horizon's black hole, the Archive's amethyst cave, your Nebula palette, your Portal theme). Every card opens its page; each loading widget has its own shimmer skeleton. Drag a widget by its box to move it; **Edit layout** resizes (1–3 columns), hides, shows and resets them, saved per device |
| **💰 Financials** | Transaction tracking (income/expenses), categories, monthly summaries, and balance overview |
| **📶 Offline saves** | Task and transaction changes made while Supabase is unreachable are kept on the device and replayed in order once it answers again (on reconnect, every 30 s, and at the next start), instead of failing the save. See [Offline queue](#-offline-queue) |
| **🌤️ Weather** | Current conditions + 7-day forecast for any of ~840 Canadian locations (searchable city picker, or **Use my location** for the nearest one), the Air Quality Health Index from the nearest station with its 24 h peak, the UV index with advice, and how much daylight is left, over a Living Sky backdrop that follows the time of day and the weather (see [The Atmosphere](#-the-atmosphere-living-sky)) |
| **📖 The Archive** | Browse, search, read and edit your Obsidian vault in-app — frontmatter, tags, wikilinks, GFM markdown, and a CodeMirror markdown editor that refuses to overwrite a note changed on disk since you opened it. The browser rail splits into an independently scrolling tag cloud and note list. It sits at the top of the sidebar's bottom group and has its own vault search. Its own amethyst theme: glass crystals lining the screen edges, glowing sparkles, and a cursor light the crystals reflect |
| **🌌 The Nebula** | A coding agent for your project folders (desktop). Three model tiers: Low (OmniRoute), Medium (NVIDIA NIM Kimi K3 → DeepSeek V4 Flash → Nemotron 3 → OmniRoute), and High (Claude Code). Also: Claude-style effort levels and Auto/Manual/Plan modes, your Claude skills and MCP servers, chat history per project, a context-window meter, per-model token counts, and a swirling three-colour nebula |
| **🌀 The Portal** | Discord, Instagram, and any other https web app as signed-in pages inside Crystal OS: its own app navbar, per-app sessions, unread badges (hidden while a Pomodoro focus phase is running), and three themes (desktop; the web build opens apps in new tabs) |
| **📝 Quick Add** | Append a timestamped, tagged capture to any vault note without leaving the dashboard |
| **⏱️ Pomodoro** | Customizable focus/break intervals, session tracking, audio notifications, and tray controls (Tasks view). A **Focusing on** picker under Start/Reset links the timer to an open task, by search or by dragging a card from The Engine onto it, and focus time is logged to that task. Focus mode also mutes The Portal while a focus phase runs. See [Pomodoro and tasks](#-pomodoro-and-tasks) |
| **🔔 Notifications** | Desktop toasts when a task reaches its end time, before each timed calendar event (30 minutes by default, set in Settings), when a Pomodoro focus or break runs out, and when a Portal app's unread count goes up while Crystal OS is not focused (per app, from its right-click menu). A switch per kind and a Do Not Disturb switch in **Settings → Notifications**. See [Notifications](#-notifications) |
| **🖥️ Desktop shell** | Native Tauri window with PowerShell terminal, tray (Pomodoro + Quick Add), always-on global hotkeys, and launch-at-login — the web build is unaffected |
| **⚙️ Settings** | Dedicated sidebar page for every preference: hotkeys, launch at login, notifications, vault folder, Nebula keys, models and look, Portal theme, and downloading or building an installer. A search box (Ctrl+F) hides sections that don't match and unfolds the ones that do. Click a section's header to fold it away (remembered on this device); switches and sliders glide instead of snapping. **Diagnostics** copies recent errors (unhandled rejections, uncaught errors, failed Supabase saves) with the app version for a bug report; on desktop they are also logged to `diagnostics.log` |
| **⌨️ Command Palette** | Global search over tasks, transactions, and vault note bodies, plus natural-language `add` / `log` commands and quick actions for a new capture or a new calendar event |
| **🎨 Theming** | Glassmorphism UI with light/dark mode, smooth Framer Motion animations, and themed select/date/time controls in place of native OS chrome |
| **📱 Responsive** | Mobile-first design with bottom navigation and collapsible sidebar |

---

## 🏗️ Tech Stack

| Category | Technologies |
|----------|--------------|
| **Frontend** | React 18, TypeScript, Vite |
| **UI** | shadcn/ui (Radix UI), Tailwind CSS, Lucide Icons |
| **State** | TanStack Query (React Query v5) cache for app data, `useSyncExternalStore` stores for UI and settings |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime) |
| **Vault** | Vite middleware plugin + `fast-glob` + `gray-matter` (Node-only, server side) |
| **Calendar** | Vite middleware plugin + `google-auth-library` OAuth2 and the Calendar v3 REST API (Node-only, server side) |
| **Desktop** | Tauri 2 (Rust): global hotkeys, autostart, tray, native vault fs — plus a Node sidecar for the web APIs |
| **Terminal** | xterm.js + ConPTY in Rust (PowerShell, desktop only) |
| **The Portal** | Tauri child webviews (WebView2), one data directory per app, throttled and cache-trimmed while off screen (desktop only) |
| **Markdown** | react-markdown + remark-gfm + `@tailwindcss/typography` |
| **Animation** | Framer Motion (slim `m` components; features loaded after first render through `LazyMotion`) |
| **Date/Time** | date-fns |
| **Testing** | Vitest + React Testing Library |

---

## 💾 Install (Windows)

For using Crystal OS rather than working on it. To build from source, skip to [Quick Start](#-quick-start).

### Download

1. Open the [latest release](https://github.com/joezhuo2/crystal-os/releases/latest) and download `Crystal.OS_<version>_x64-setup.exe`.
2. Run it. The installer is not code-signed yet, so Windows SmartScreen may say "Windows protected your PC": click **More info**, then **Run anyway**.
3. Crystal OS installs for your user only (no admin prompt), opens, and adds a gem icon to the tray. It needs WebView2, which Windows 11 already has.

From then on, **Settings → Install & update → Check for updates** installs new versions in place.

### First-run setup

You need a [Supabase](https://supabase.com) project of your own (the free tier works); Crystal OS keeps your tasks and transactions there.

1. In the Supabase SQL Editor, run the files in [`supabase/migrations/`](supabase/migrations) in order. See [Database Schema](#-database-schema-supabase).
2. Under **Authentication → Users**, create your account, then turn off new signups under **Authentication → Providers**.
3. Create `%APPDATA%\com.crystalos.desktop\.env.local` from [`.env.example`](.env.example) with at least `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. For Google Calendar, add the `GOOGLE_*` keys with `GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/api/calendar/auth/callback` (see [The Horizon](#-the-horizon-google-calendar-integration)).
4. Restart Crystal OS (tray → **Quit Crystal OS**, then open it again) and sign in.
5. Optional: in **The Archive**, **Choose vault folder** to pick your Obsidian vault; in **Settings → The Nebula**, add a NIM key.

### Where things live

| What | Where |
|------|-------|
| Program | `%LOCALAPPDATA%\Crystal OS\` |
| Settings (`settings.json`), `.env.local`, Portal sessions, Nebula chats | `%APPDATA%\com.crystalos.desktop\` |
| Logs (`diagnostics.log`) | `%LOCALAPPDATA%\com.crystalos.desktop\logs\` |
| Tasks, transactions, categories, review history | Your Supabase project |

Uninstall from **Settings → Apps → Installed apps**. Your settings and logs stay unless you tick the option to delete app data. See [docs/PRIVACY.md](docs/PRIVACY.md) for everything Crystal OS stores and what it sends where.

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

# Optional: a dedicated test user for the E2E smoke test (npm run test:e2e).
E2E_EMAIL=
E2E_PASSWORD=
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
├── assets/
│   ├── atmosphere-backdrop.webp # The Atmosphere's default background (a misty forest lake)
│   ├── engine-backdrop.webp    # The Engine's red black hole background
│   ├── horizon-backdrop.webp   # The Horizon's black hole background
│   └── orbit-backdrop.webp     # The Orbit's pale black hole background
├── components/
│   ├── layout/
│   │   ├── AppSplash.tsx       # "Crystal OS / Loading…" splash while the session restores
│   │   ├── Navigation.tsx      # Sidebar + BottomNav (Terminal/Portal/Nebula/Atmosphere/Archive/Horizon/Engine restyle the sidebar); the sidebar expands over the page
│   │   ├── BackdropSlot.tsx    # Keeps a left tab's backdrop mounted, hidden and paused, so switching back is instant
│   │   ├── TerminalStatic.tsx  # Static-noise backdrop for the Terminal tab
│   │   ├── PortalBackdrop.tsx  # Themed backdrop for The Portal
│   │   ├── AtmosphereBackdrop.tsx # Living Sky for The Atmosphere: sky, sun/moon, aurora, clouds, rain/snow/lightning
│   │   ├── ImageBackdrop.tsx   # Blurred black hole behind The Horizon, The Engine or The Orbit
│   │   ├── StarCanvas.tsx      # Twinkling star canvas (Portal Stargate theme, Atmosphere night sky)
│   │   └── ObsidianBackdrop.tsx # Crystal backdrop and cursor light for The Archive
│   ├── portal/
│   │   ├── PortalNavbar.tsx    # App pills (drag, right-click menu), browser controls
│   │   ├── PortalSkeleton.tsx  # Themed placeholder shown while an app's page loads
│   │   └── AddPortalAppDialog.tsx # Presets + custom https app
│   ├── ui/                     # shadcn/ui components in use, plus app controls (25 files)
│   │   ├── field-controls.tsx  # ThemedSelect, ThemedCombobox, DateField, TimeField (portalled popups)
│   │   ├── glass-tooltip.tsx   # GlassTip: gradient-bordered tooltip used in place of `title`, drawn above the page
│   │   └── dashboard-skeletons.tsx # Per-widget loading skeletons for the home page
│   ├── views/                  # Page-level components
│   │   ├── HomePage.tsx        # Clock, weather, Vault, Engine, today's events, themed weather, Horizon and Archive widgets (the Engine box themed too)
│   │   ├── HomeGrid.tsx        # Home's rearrangeable grid: drag to move, edit mode to resize, hide and reset
│   │   ├── OrbitPage.tsx       # The Orbit: weekly/monthly review cards, reflection and vault export
│   │   ├── orbit/OrbitCharts.tsx # The Orbit's SVG focus bars, money bars and task rings
│   │   ├── orbit/FocusPie.tsx  # The Orbit's focus-by-task donut chart and legend
│   │   ├── orbit/OrbitAutoExport.tsx # Writes each ready review to the vault when auto-export is on
│   │   ├── orbit/HabitsToday.tsx # The Today card's habit chips and week/month grid
│   │   ├── orbit/HabitManager.tsx # Add, rename, recolour, reorder and remove habits
│   │   ├── HomeSpaces.tsx      # Home's themed Nebula, Portal and Terminal boxes
│   │   ├── TasksPage.tsx       # Task list, form (with estimates), filtering, Pomodoro
│   │   ├── CapacityBar.tsx     # Fits today? card for The Engine and the slim strip on Home's Engine card
│   │   ├── CalendarPage.tsx    # Google Calendar: month, week, day + agenda, event CRUD
│   │   ├── TimeGrid.tsx        # Hour-by-hour columns for the week and day views
│   │   ├── FinancialsPage.tsx  # Transactions, summaries, charts
│   │   ├── financials/FinanceCharts.tsx # Cash flow, spending donut and savings trend as plain SVG
│   │   ├── WeatherPage.tsx     # Detailed weather view
│   │   ├── weather/AirSunCards.tsx # Atmosphere cards: air quality (AQHI), UV index, daylight bar
│   │   ├── ArchivePage.tsx     # Vault browser: search, tags, markdown reader, virtualised note list
│   │   ├── NoteEditor.tsx      # CodeMirror note editor with mtime-checked saves (lazy-loaded)
│   │   ├── TerminalPage.tsx    # Up to 5 PowerShell terminals in tabs, up to 4 split on screen (xterm.js, desktop only)
│   │   ├── PortalPage.tsx      # The Portal: places the active app's webview over its frame
│   │   ├── SettingsPage.tsx    # Hotkeys, launch at login, notifications, vault folder, Portal theme, Atmosphere effects and image, Install & update
│   │   ├── InstallerSection.tsx # Check for updates, release picker, installer download, build-from-source log
│   │   ├── PomodoroTimer.tsx   # Focus timer component
│   │   ├── PomodoroTask.tsx    # "Focusing on" task picker and drop target under Start/Reset
│   │   └── CategoryManager.tsx # Category CRUD for tasks/finances
│   ├── CommandPalette.tsx      # Search, NL commands, vault note results
│   ├── NotificationScheduler.tsx # Checks task due times and calendar reminders every 30 s while signed in
│   ├── QuickAddDialog.tsx      # Append a capture to a vault note
│   └── NavLink.tsx
├── contexts/
│   └── AppContext.tsx          # Tasks, transactions, categories: loaded into the React Query cache, read with useTasks/useTransactions(select), written via useAppActions
├── hooks/
│   ├── useVault.ts             # React Query bindings: /api/obsidian/* on web, Rust on desktop
│   ├── useGoogleCalendar.ts    # React Query bindings for /api/calendar/*
│   ├── useGlobalHotkey.ts      # useGlobalHotkeys (settings) + usePaletteHotkey (search) + useHomeHotkey (Home)
│   ├── usePomodoro.ts          # Pomodoro store bindings (page + tray share src/lib/pomodoro.ts)
│   ├── usePortal.ts            # Portal store bindings, overlay occlusion, session start
│   ├── useTrayQuickAdd.ts      # Tray Quick Add events
│   ├── useEscapeKey.ts         # Stacked Escape-to-close for overlays (topmost closes first)
│   ├── useWeather.ts           # Weather API integration + searchable city list
│   ├── useAirQuality.ts        # AQHI at the station nearest the city, with its 24 h forecast
│   ├── useTodayCapacity.ts     # Today's estimates against the work window and calendar, on a minute clock
│   ├── useSkyScene.ts          # Living Sky state: phase of day, weather look, moon, for the chosen city
│   ├── use-toast.ts            # Toast notifications (Sonner)
│   └── use-mobile.tsx          # Responsive breakpoint hook
├── lib/
│   ├── supabase.ts             # Supabase client + helpers
│   ├── offlineQueue.ts         # Task/transaction writes kept in localStorage while Supabase is unreachable, replayed in order
│   ├── weatherNudge.ts         # One-line weather nudge for the Home weather box, from the hourly forecast
│   ├── airQuality.ts           # AQHI and UV risk bands and advice, nearest AQHI station, forecast peak, UV outlook
│   ├── daylight.ts             # Daylight left / time to sunrise, and day length change (sunrise equation)
│   ├── notifications.ts        # Desktop toasts: what to say and when (tasks, events, Pomodoro, Portal), delivery, Do Not Disturb
│   ├── notifySettings.ts       # Notification switches and the event reminder lead time (localStorage)
│   ├── appUi.ts                # Transient UI store: open forms, Quick Add draft, selected note (useAppUi(selector))
│   ├── vaultCore.ts            # Shared vault logic: parsing, search index, tags, quick-add formatting
│   ├── wikilinks.ts            # Archive reader: wikilink targets mapped once per listing
│   ├── vaultNative.ts          # Desktop vault client for src-tauri/src/vault.rs
│   ├── obsidianScene.ts        # Archive backdrop: crystal shapes, edge layout, cursor light maths
│   ├── terminalNative.ts       # Desktop terminal bridge (terminal_* commands, event routing per shell)
│   ├── portalApps.ts           # Portal presets, URL/id validation, badge parsing
│   ├── portalStore.ts          # Module-level Portal store: apps, active app, badges, theme
│   ├── portalNative.ts         # Desktop Portal bridge (portal_* commands)
│   ├── installerNative.ts      # Desktop installer bridge (installer_* and update_* commands, version helpers)
│   ├── homeTasks.ts            # Home Engine ordering: priority ranks, upcoming tasks
│   ├── capacity.ts             # Task estimates, busy intervals from events, today's planned vs free time
│   ├── capacitySettings.ts     # The Engine's work window (localStorage)
│   ├── homeLayout.ts           # Home grid order, hidden widgets and sizes, saved in localStorage
│   ├── timeGrid.ts             # Week/day view dates and overlapping-event layout
│   ├── atmosphereScene.ts      # Living Sky maths: sky phase, weather codes → effects, aurora/star strength, moon, pine ridge
│   ├── atmosphereStore.ts      # Atmosphere settings: city, weather effects, aurora, background image and its blur
│   ├── atmosphereImage.ts      # Background image: checks, scaling, baked blur, IndexedDB storage
│   ├── orbitReview.ts          # Review periods (Mon–Sun, months, ready at 6 PM), stats, trends, agenda, markdown export
│   ├── habits.ts               # Habit active days, streaks, the Today grid and per-period summaries
│   ├── orbitStore.ts           # The Orbit's per-device state: auto-export, seen reviews, Weekly/Monthly choice
│   ├── imageBackdrop.ts        # Horizon, Engine and Orbit backgrounds: bakes and decodes the page (15%) and Home box (25%) blurs once per session
│   ├── backdropSlot.ts         # Whether the surrounding backdrop is on screen; useBackdropStill pauses its loops when not
│   ├── frameLoop.ts            # fps-capped draw loop for backdrop canvases; sleeps on a timer between frames
│   ├── pomodoro.ts             # Module-level Pomodoro store (page + tray agree), linked task and run splitting
│   ├── focusTask.ts            # Keeps the Pomodoro's linked task in step with the task list; the picker's options
│   ├── tray.ts                 # Tauri tray events → app, app state → tray menu
│   ├── hotkey.ts               # Hotkey parsing + combo validation
│   ├── platform.ts             # isDesktop(), apiUrl(), usesSidecar(), openExternal()
│   ├── apiRequest.ts           # Authenticated fetch wrapper for server routes; starts the desktop sidecar on first use
│   ├── sidecarNative.ts        # ensureSidecar(): asks src-tauri/src/sidecar.rs to start crystal-api
│   ├── viewLoader.ts           # Every view as a lazy chunk; preloads the most visited after startup
│   ├── chartGeometry.ts        # Ticks, scales, monotone curves and donut arcs for the SVG charts
│   ├── motionFeatures.ts       # framer-motion's domMax features, loaded by App's LazyMotion
│   ├── seedCategories.ts       # Default task/finance category seeds, only after a successful empty fetch
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
│   ├── hotkey.rs               # RegisterHotKey bindings (Alt+Space, Alt+Shift+Space, Alt+Shift+H)
│   ├── autostart.rs            # Launch-at-login (--hidden) registration
│   ├── settings.rs             # settings.json read/write (hotkeys, vaultPath, launchAtLogin, installerSourceDir)
│   ├── vault.rs                # Native vault I/O: list/read/write/status/watch
│   ├── terminal.rs             # ConPTY PowerShell shells (up to 5)
│   ├── portal.rs               # Portal child webviews: show/hide/fade, snapshots, per-app data, sign-out, background memory
│   ├── portal/webview2.rs      # WebView2 page capture, tab-shortcut forwarding, memory level for Portal apps
│   ├── installer.rs            # GitHub releases, installer download, build:desktop from a checkout
│   ├── updater.rs              # Check for updates and install in place (tauri-plugin-updater)
│   └── sidecar.rs              # Starts crystal-api on the first /api/* request, kills it on exit
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
| `GET` | `/api/obsidian/raw?path=<rel>` | A note's whole file, frontmatter included, with its `mtime` (for the editor) |
| `PUT` | `/api/obsidian/note` | Replace a note with `{ path, content, expectedMtime }`; `409` if it changed on disk since `expectedMtime` (2 MB cap) |

The middleware is mounted on both the dev server and `vite preview`. It is **not** part of a static production build — a bare `dist/` deployment has no vault access.

### Behaviour

- **Search ranking** — title (exact > prefix > substring) beats tags beats path beats body; body hits return a snippet so the UI can show *why* a note matched.
- **Frontmatter** — `title`, `tags`, `date`, and `status` are modelled explicitly; every other key is surfaced as-is in the reader.
- **Wikilinks** — `[[Note]]` and `[[Note|alias]]` resolve to in-app navigation; unresolved links stay plain text rather than becoming dead anchors.
- **Quick Add** — appends a `- **HH:MM** text` bullet under a `## YYYY-MM-DD` heading, creating the note (and any parent directories) when missing. Supplied tags are merged into the note's frontmatter; the existing YAML list style (inline or block) is preserved and no other key is reformatted.
- **Editing** — **Edit** in the reader opens the whole file, frontmatter included, in CodeMirror (`src/components/views/NoteEditor.tsx`, loaded only when first used). **Save** or Ctrl+S writes it back with the `mtime` it was opened at; if Obsidian saved the note in between, the save is refused and you choose **Discard mine, load theirs** or **Overwrite with mine**. Unsaved edits survive switching notes or tabs as a draft until the window closes.
- **Caching** — parsed notes are cached per path and invalidated on `mtime` change.

### Layout

The global search bar lives on Home only, so the rail runs down to the bottom of the window. It is a fixed-height column split into two halves that scroll independently: the tag cloud on top, the filtered note list below, with the note count between them as a divider and the search field pinned above both. Each half is `flex-1 basis-0 min-h-0`, so a vault with many tags cannot crowd the list out of view, and a vault with few tags leaves the extra space to the list. Past 80 notes the list is virtualised (`@tanstack/react-virtual`): only the rows in view are mounted, so large vaults scroll smoothly; smaller lists keep their staggered entrance.

### Theme

The Archive has its own dark amethyst look. The panels, tags, note list, buttons, and sidebar turn violet, and `ObsidianBackdrop` (`src/components/layout/ObsidianBackdrop.tsx`) draws the scene behind them with CSS, SVG, and DOM only (no canvas, WebGL, or 3D library):

- **Crystals.** 53 glass crystals grow in from the four corners and edges, in five faceted shapes. Clusters sit every 12–16% along each edge, so the border reads as one continuous band of crystal, at resting opacities between 0.3 and 0.9. Each one is tilted to point into the screen and pushed out along its own axis until its flat base sits past the edge, so no root is ever on screen. The layout is seeded, so it is the same on every visit (`src/lib/obsidianScene.ts`). The resting glass is painted with gradients only, with no `backdrop-filter`, and every third crystal holds still while the rest float.
- **Sparkles.** 80 four-point stars (10–22 px; 60, 44 and 32 on 1.25×, 1.75× and 2.5× displays, which paint each one at several times the pixels) twinkle at random across the background, and one (24–40 px) sits near the tip of each crystal, on top of the glass. Each star is a bright white core with two thin rays drawn as gradients (so they stay crisp at any size), and a soft violet glow that twinkles with it. In performance mode and with reduced motion the stars hold still at 80% instead of twinkling.
- **Still while scrolling.** While anything on the page scrolls, the floating crystals, twinkles, haze and aura pause where they are and pick up again 180 ms after the scroll stops, so the scroll gets the frames.
- **Cursor light.** A soft violet aura follows the pointer and breathes between 0.5 and 0.8 opacity. It fades out when the pointer leaves the window.
- **Reflections.** A crystal near the pointer lights up: a brighter rim, a halo, and a second glass layer with a stronger `backdrop-filter` (brightness, saturation, contrast) that carries a glint positioned where the pointer is. The light is worked out in the crystal's own rotated frame, so tilted crystals light along their length.

The pointer never touches React state. One `pointermove` listener schedules at most one animation frame. That frame reads every crystal's position first, then writes `--obsidian-mx`/`--obsidian-my` on the backdrop and `--lit`/`--lx`/`--ly` on each crystal it lights, skipping crystals that stay dark. The CSS turns those properties into `transform` and `opacity`, which the compositor handles. The floating, twinkling, growing, and breathing animations use only transforms and opacity. Only a lit crystal has a live blur: its reflection layer, halo and bright rim are `visibility: hidden` while it is dark, so those filters only run near the pointer. A blur on every crystal would be recomputed every frame, because the drifting haze and floating crystals behind it never stop moving. With reduced motion on, the animations stop and the cursor light still works.

### Safety

On the web, every filesystem access goes through `resolveVaultPath`, which rejects absolute paths, drive letters, and any traversal escaping the vault root. On desktop, `vault.rs` does the same and also refuses `..`, NTFS stream names, and symlinks or junctions that lead out of the vault. Request bodies are capped at 64 KB, capture text at 10,000 characters, and tags at 12 per request / 60 characters each, validated against the Obsidian tag charset.

---

## 🌌 The Atmosphere (Living Sky)

The weather tab draws a Living Sky behind its panels (`src/components/layout/AtmosphereBackdrop.tsx`), and the weather box on Home wears a small CSS-only version of it. The panels and sidebar switch to deep night glass so text stays readable over a bright sky.

- **The sky, always on.** The gradient follows the time of day for the chosen city: dawn and dusk run 45 minutes either side of that day's sunrise and sunset, with day between them and night outside. Phases cross-fade over four seconds. The sun glows high by day and low on the horizon at dawn and dusk; the moon is drawn in its current phase and illumination; stars twinkle at night and faintly at twilight. Without usable sunrise and sunset times, 6:30 and 19:30 are used.
- **Weather effects** (Settings → The Atmosphere, on by default). The current Environment Canada icon code sets cloud cover, rain, snow, sleet, fog and lightning (`skyWeather` in `src/lib/atmosphereScene.ts`). Two tiled cloud bands drift across the sky, an overcast layer darkens it, and one canvas draws rain, snow and lightning at 30 fps. A strike flashes the sky, draws a bolt, and briefly lights up the clouds and the aurora.
- **Aurora** (on by default). Three ribbons of northern lights sway on their own and bend toward the cursor over a pine treeline. They sit behind the clouds and rain, at full strength at night and faint by day. As with the Archive light, the cursor never touches React state: one frame per move writes `--bend-x` on the field and CSS does the rest.
- **Background image.** By default a misty forest lake (`src/assets/atmosphere-backdrop.webp`), loaded once there is no image of your own, so a saved image never flashes the default first. Choose a PNG or JPEG (up to 25 MB) in Settings to replace it, or remove yours to go back to the default. Your image is checked, scaled down to 2560 px on its longest side, and stored in IndexedDB on this device (`src/lib/atmosphereImage.ts`). The image is shown under frosted glass behind the page and the Home box; the sky becomes a light tint of the current phase over it, and the sun, moon, stars, aurora and weather draw on top.
- **Image blur** (0–100%, default 50%). How much the glass frosts the image, up to a 40 px blur. The store bakes a blurred 1600 px copy on a canvas whenever the image or the setting changes (the slider commits on release), and the page shows that copy as a plain image. There is no live CSS blur and no blend mode on the aurora: together with the aurora's large moving layers, they could make the desktop WebView drop the photo on high-DPI screens.

Both switches work together or apart; with both off you get the background image under the sky's tint for the time of day (the plain sky only if the image cannot load). The city picked on the page is shared with the Home box and the backdrop (`src/lib/atmosphereStore.ts`, same `crystal-os-weather-city` key as before). The picker searches every Environment Canada city page location by name or forecast region, and suggests the nine GTA-area cities before you type. **Use my location**, at the top of the picker, asks the system for a rough position (Windows Location on desktop, so location services must be on) and picks the nearest location within 100 km (`nearestCity` in `src/hooks/useWeather.ts`); the position is used once and never stored or sent. If access is off, the request times out, or you are outside Canada, the row says so and the city is left as it was. Every canvas pauses while the window is hidden, and performance mode or reduced motion shows a still frame with no lightning.

**Air, UV and daylight.** Under the hourly and 7-day forecasts, The Atmosphere has four cards: Air Quality, UV Index, Sun & Moon and Wind Details.

- **Air Quality** shows the Air Quality Health Index from the Environment Canada AQHI station nearest the city (`useAirQuality` in `src/hooks/useAirQuality.ts`): the latest hourly reading as a whole number (10+ above 10), its risk band in colour (1–3 low, 4–6 moderate, 7–10 high, above 10 very high) with the advice for the general public, a ten-step scale, the highest hour of the station's newest forecast in the next 24 hours, and which station it is, how far away and when it was measured. Stations are looked up in a box around the city's point with `latest=true`, and only one within 75 km counts, so a small or northern location says there is no station nearby rather than borrowing a far city's air. It refreshes every 20 minutes; the forecast is optional, so a station without one still shows its reading.
- **UV Index** shows the UV index from the forecast for the next daytime period (today, or tomorrow after dark, since night periods have none) with its band (0–2 low, 3–5 moderate, 6–7 high, 8–10 very high, 11+ extreme) and advice, the current hour's value when the hourly forecast has one, and the hour it peaks (`uvOutlook` in `src/lib/airQuality.ts`).
- **Sun & Moon** gains a daylight bar under sunrise, sunset, day length and the moon: by day how much daylight is left and how far through the day it is, by night the time to sunrise and how far through the night (`daylightState` in `src/lib/daylight.ts`), and how much longer or shorter today is than yesterday, worked out from the city's point with the sunrise equation (`dayLengthChangeSeconds`). Times on these cards use the device clock and update every minute.

**Weather nudges on Home.** Under the condition and city, the Home weather box adds one line when the hourly forecast calls for it (`weatherNudge` in `src/lib/weatherNudge.ts`): rain, snow, freezing rain or thunderstorms starting in the next 12 hours ("Rain from 4 PM, take an umbrella", "Snow from 1 AM tomorrow, wear boots") or, when it is already falling, when it stops ("Rain until 6 PM"); a windchill (or temperature) of −20 °C or below in the next 24 hours ("−23 °C windchill tomorrow morning"); or 30 °C or above ("Up to 33 °C this afternoon, drink water"). A "Chance of …" hour counts only at 40% or more. Freezing rain and thunderstorms come first, then cold, then rain or snow, then heat; with nothing to say the line is left out. Times use the device clock and are worked out again whenever the box renders, so a start time turns into an end time once it begins.

---

## 📅 The Horizon (Google Calendar integration)

The calendar tab reads and writes your real Google Calendar. The client secret and refresh token must never reach the browser, so every Google call happens in a Vite middleware plugin and the bundle only ever sees JSON — the same shape as the Obsidian tier above.

**Look.** A black hole with a blue accretion disk sits behind the page (`src/components/layout/ImageBackdrop.tsx`), and the "Today on the Horizon" box on Home wears it too. The image ships in `src/assets/horizon-backdrop.webp` and is blurred with the Atmosphere's baked blur (`blurImage`), at 15% for the page and 25% for the Home box, once per session (`src/lib/imageBackdrop.ts`), so neither runs a live CSS blur. The page's palette is electric blue over deep navy: logo, buttons, sidebar, event dots, dark blue glass panels, and the dropdowns and date pickers, which render into `<body>` and so read the palette from a `horizon-theme` class set there while the tab is open. The Engine gets the same treatment with a red black hole (`src/assets/engine-backdrop.webp`) and an ember palette (orange buttons and rings, dark ember glass, `engine-theme` on `<body>`), with the same blur and glass opacity.

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

## 📶 Offline queue

Every task, transaction and completion write goes through `saveWrite` in `src/contexts/AppContext.tsx`. When the browser is offline, or a request gets no answer (or a 401, 408, 429, 502, 503 or 504), the write is not reported as failed: it is added to a queue in `localStorage` (`crystal-os-offline-queue:<user id>`), the list updates as if it had saved, and a "Saved on this device" notice appears. The queue (`src/lib/offlineQueue.ts`) is replayed in order on the browser's `online` event, every 30 s while it is not empty, and before the data loads at sign-in or app start. A write the server rejects during replay is reported and dropped; anything after it still goes through.

- **Ids come from the device.** Inserts send a `crypto.randomUUID()` id, so a task added offline can be edited, completed or deleted before it is sent. Edits to a queued row fold into its queued insert; deleting a queued row drops it from the queue. A replayed insert that had already landed (duplicate key) counts as sent.
- **Order is kept.** While anything is queued, new writes queue behind it rather than going straight out, and a replay stops at the first write that still can't get through.
- **Reloads keep queued changes.** A load overlays queued edits and deletes on the rows it fetches and adds queued inserts, so nothing waiting disappears from the lists.
- **Per account.** Each user's queue is separate; one left when signing out is sent at that user's next sign-in.

Categories, habits, focus sessions and settings are not queued and still report a failed save.

## 🔔 Notifications

Crystal OS shows native toasts (Windows notifications on desktop through `tauri-plugin-notification`, the browser's Notification API on the web). The first one asks for permission. **Settings → Notifications** has a switch for each kind, the reminder lead time, a **Do Not Disturb** switch that silences them all without touching the others, and **Send test**.

- **Task due times.** When an open task reaches its end time ("Due now: File taxes", with the priority if it is high or urgent), including each occurrence of a repeating task. A due time is still announced up to 10 minutes late, so a sleeping timer or opening the app just after it does not lose it.
- **Calendar reminders.** Before each timed event in the Google calendar picked in The Horizon: 30 minutes by default, 0 (as it starts) to 1440. Opening the app inside that window still reminds, with the time actually left ("In 8 min, at 3:00 PM · Main St"). All-day events get none. The next 50 hours of events are fetched every 10 minutes, also while the window is hidden in the tray; on desktop nothing is fetched until the calendar has been connected once, so the sidecar is not started for nothing.
- **Pomodoro.** When a focus session or a break runs out, from the Tasks page or the tray. Pausing and resetting stay quiet.
- **Portal messages.** When a Portal app's unread count goes up while Crystal OS is not focused (and not while a Pomodoro focus phase is running: see [Pomodoro and tasks](#-pomodoro-and-tasks)) ("Discord: 2 new · 5 unread", or "New activity" for a site that only shows a dot). The count an app opens with is not announced. Only loaded apps report, so an app with **Keep loaded in background** off stays quiet once it closes. Turn it off for one app with **Notify on new messages** in its right-click menu.

What to say and when lives in `src/lib/notifications.ts` (pure, tested); `src/components/NotificationScheduler.tsx` checks tasks and events every 30 s while signed in, and the Pomodoro and Portal stores are watched from `main.tsx`. Each task and event reminder is shown once: its key is kept in `localStorage` (`crystal-os-notified`, two days), so a restart does not repeat it. Settings are saved in `crystal-os-notifications`.

## ⏱️ Time estimates and capacity

**Estimates.** The task form has an **Estimate** row: chips for 15m, 30m, 1h, 2h and 4h (tap the lit one again to clear it) and a minutes box for anything else, up to 1440. It is effort, not scheduling: start and end still say when a task is due. Estimates are stored in `tasks.estimate_minutes` ([migration 0005](supabase/migrations/0005_task_estimates.sql)).

**Fits today?** A card at the top of The Engine, and a slim bar on Home's Engine card, compare two numbers (`todayCapacity` in `src/lib/capacity.ts`):

- **Planned:** the estimates of today's open tasks, repeats included. Overdue tasks are left out. Tasks without an estimate add nothing and are counted instead ("2 tasks without an estimate").
- **Free:** the work window (**Settings → The Engine**, 9 AM to 5 PM by default, per device) from now until it ends, minus timed events in the Google calendar picked in The Horizon. Overlapping events count once, events that cross midnight are clipped to today, and all-day events are ignored. Without a connected calendar, free time is the window alone and the card says so.

Home's Engine card shows the same numbers as a free-time bar (the rest of the work day, its free part, and the planned work over it) with a one-line nudge toward the next task that fits, in one of six wordings that change hourly (`suggestNextTask`). Once today's tasks are all done, the nudge offers an upcoming task instead, highest priority first, then earliest date (`suggestUpcomingTask`).

The bar is green while the work fits, amber past 85% of free time, and red with the part that does not fit striped once it is over ("Over by 45m"). It updates every minute on the device clock and reuses the Home Horizon card's cached events, so it makes no extra calendar request.

## 📝 Notes and subtasks

**Notes.** The task form has a **Notes** box for free text (up to 10,000 characters). A task with notes shows a note icon on its card.

**Subtasks.** A task has two kinds of subtask, counted together:

- **Checklist items**, light rows that live on the task. Add, tick, rename (click the text), drag to reorder and delete them in the task form or straight on the card.
- **Child tasks**, full tasks nested under another task, each with its own dates, priority and estimate. Nesting is one level deep: a child cannot have children, and a task with children cannot be nested.

Each card shows **+3 subtasks** while any are open, then **All 4 done** in green. The parent does not complete itself; you tick it. Click a card (or its chevron) to expand it: its notes, its checklist, and its child tasks, each with a tick, an edit button and a **move to top level** button.

**Nesting.** Three ways to make a task a subtask: the **Subtask of** picker in the task form, dragging its card onto another card (in List or Board; a card that would take it lights up), or searching for it in the command bar and choosing **Make "…" a subtask of…**. To take it back out: **Subtask of → None**, the move-to-top-level button, dragging it out of its parent onto the list or a Board column, or **Move "…" to top level** in the command bar.

**Rules.**

- Child tasks show only inside their parent, in The Engine's List and Board and on Home's Engine card. The **Fits today?** bar still counts their estimates on their own dates; a parent's estimate is its own work, never a sum.
- Completing a parent ticks its checklist and completes its open child tasks. Unticking it leaves them as they are.
- A repeat that moves on when done ("N days after done") starts its checklist over, unticked, for the next date.
- Deleting a parent keeps its child tasks and moves them back to the top level; its checklist goes with it.

Stored in `tasks.notes`, `tasks.checklist` (JSON) and `tasks.parent_id` ([migration 0006](supabase/migrations/0006_task_notes_subtasks.sql)). The rules live in `src/lib/subtasks.ts` (unit-tested).

## 💤 Snoozing tasks

**Snooze.** Each open, top-level task in The Engine has an alarm clock button, right of the chevron and left of edit and delete. It opens a popover with **Tomorrow**, **This weekend** (the coming Saturday, or next week's when today is a Saturday or Sunday), **Next week** (the coming Monday), **Next month** (the same day, clamped to the end of a shorter month), **Pick a date…** (a calendar from tomorrow onward) and **Someday** (no date). Each preset shows its date.

**What it does.** A snoozed task keeps its own start and end dates. It is hidden until the start of the snooze day on the device clock, or indefinitely for Someday, and is left out of:

- The Engine's List and Board.
- Home's Engine card and its nudges.
- The **Fits today?** bar.
- Due-time notifications.

A snoozed task is never overdue. When it wakes it returns as normal, overdue if its due date has passed. Today's date updates at local midnight and when the window regains focus, so tasks wake without a reload.

**The Snoozed section.** A collapsed "Snoozed (n)" section at the bottom of both List and Board (opening and closing on the same 200 ms ease as card expansion) lists them: dated snoozes soonest first, then a **Someday** group. A snoozed card shows an "Until Mon, Oct 12" or "Someday" chip (click it to change the snooze) and an **Unsnooze** button in place of the snooze button.

**Command bar.** Search for a task and choose **Snooze "…"…**, then a preset or Someday (no date picker there), or **Unsnooze "…"** when it is snoozed.

**Rules.**

- Child tasks follow their parent and cannot be snoozed on their own.
- Completed tasks cannot be snoozed. Completing a snoozed task clears its snooze, and so does an "N days after done" repeat moving to its next date.

Stored in `tasks.snoozed_until` and `tasks.someday` ([migration 0007](supabase/migrations/0007_task_snooze.sql)). The rules live in `src/lib/snooze.ts` (unit-tested).

## 🍅 Pomodoro and tasks

**Focusing on.** Under Start and Reset, a themed, searchable **Focusing on** picker links the timer to a task. It lists open, non-snoozed tasks (overdue and today first, then by date, priority and name), each with an Overdue, Today or date hint, plus **No task**. It is also a drop target: drag a task card from The Engine's List or Board onto it and it lights with a primary ring ("Drop to focus on this task"). It follows the page theme (the Engine's palette).

**One link, across phases.** The linked task stays through focus and break phases. Changing it mid-focus splits the run: the time so far is logged to the old task (when it is at least a minute, the same rule as Reset) and the clock keeps running for the new one.

**It follows the task list.** Completing the linked task (including a repeating task moving to its next date) or deleting it logs its share and unlinks it, and the timer keeps running. Renaming it updates the name shown and logged, whether the change came from the Engine, the tray or another device. Signing out clears the link.

**Focus mode mutes The Portal.** While a focus phase is running (not paused, not on a break), Portal unread badges are hidden in the sidebar and the Portal navbar, and Portal desktop notifications are not shown. Badges keep updating underneath and come back on pause, Reset or a break.

**The Orbit.** The Focus card gets a donut of focus by task under the daily bars: a slice per task, largest first, with the rest after seven tasks folded into **Other** (an eighth task alone is shown on its own), and unlinked focus as a muted **No task** slice. Hover a slice or its legend row to lift it and see its time, share of focus and session count (for Other, the tasks it holds). Tasks are grouped by id, or by the saved title once the task is deleted. The markdown export gains a **### By task** list ("- Write report: 30 min (75%)").

Runs are saved in `focus_sessions` with `task_id` and `task_title` ([migration 0008](supabase/migrations/0008_focus_task_title.sql)). Before it is applied, the insert retries without `task_title` and The Orbit's history falls back to the old columns. The rules live in `src/lib/pomodoro.ts` and `src/lib/focusTask.ts` (unit-tested).

## 🗄️ Database Schema (Supabase)

```sql
tasks                (id, user_id, name, start_date, start_time, end_date,
                      end_time, priority, category_id, completed, repeat_days,
                      repeat_kind, repeat_weekdays, estimate_minutes,
                      notes, checklist, parent_id)
transactions         (id, user_id, name, amount, type, category_id, date)
task_categories      (id, user_id, name, color)
financial_categories (id, user_id, name, color)
settings             (user_id, key, value)   -- primary key (user_id, key)
task_completions     (id, user_id, task_id, title, category_id, completed_at)
focus_sessions       (id, user_id, started_at, ended_at, seconds, task_id, task_title)
habits               (id, user_id, name, color, position, created_at, archived_at)
habit_checks         (id, user_id, habit_id, day)   -- unique (habit_id, day)
```

Row Level Security is enabled on every table, with select/insert/update/delete
policies scoped to `auth.uid() = user_id`. `user_id` defaults to `auth.uid()`, so the
client never sends it. Category foreign keys are `on delete set null`, so deleting a
category leaves its tasks intact and uncategorised rather than deleting them.

Apply [`supabase/migrations/0001_auth_and_rls.sql`](supabase/migrations/0001_auth_and_rls.sql)
in the Supabase Dashboard → SQL Editor, then run `npm run verify:rls` to confirm the
anon role can read and write nothing. Then apply
[`supabase/migrations/0002_task_repeat_kinds.sql`](supabase/migrations/0002_task_repeat_kinds.sql)
(v0.7.5), which adds the repeat kind (`days`, `weekly`, `monthly`, `after`) and weekdays.
Task saves fail until it is applied. Older rows with only `repeat_days` keep repeating every N days.
Then apply [`supabase/migrations/0003_orbit_review.sql`](supabase/migrations/0003_orbit_review.sql)
(v0.8.0), which adds `task_completions` (a row per tick, kept when the task is renamed or deleted)
and `focus_sessions` (a row per Pomodoro focus run) for The Orbit. It is safe to run twice. Until it is
applied The Orbit shows a banner and counts no completions or focus time; everything else works.
Then apply [`supabase/migrations/0004_habits.sql`](supabase/migrations/0004_habits.sql)
(v0.8.10), which adds `habits` and `habit_checks` (a row per habit per local day done) for the
habit tracker. It is safe to run twice. Until it is applied the Today card says so and the reviews
leave habits out.
Then apply [`supabase/migrations/0005_task_estimates.sql`](supabase/migrations/0005_task_estimates.sql)
(v0.9.1), which adds `tasks.estimate_minutes` (1 to 1440, null for no estimate). It is safe to run twice.
Until it is applied, saving a task with an estimate fails; tasks without one save as before.
Then apply [`supabase/migrations/0006_task_notes_subtasks.sql`](supabase/migrations/0006_task_notes_subtasks.sql)
(v0.9.3), which adds `tasks.notes`, `tasks.checklist` (a JSON array of `{id, text, done}`) and
`tasks.parent_id` (`on delete set null`, so deleting a parent keeps its child tasks). It is safe to
run twice. Until it is applied, saving a task with notes, a checklist or a parent fails; other tasks
save as before.
Then apply [`supabase/migrations/0007_task_snooze.sql`](supabase/migrations/0007_task_snooze.sql)
(v0.9.4), which adds `tasks.snoozed_until` (a date) and `tasks.someday` (boolean, default false). It is
safe to run twice. Until it is applied, snoozing a task fails; tasks that were never snoozed save as
before.
Then apply [`supabase/migrations/0008_focus_task_title.sql`](supabase/migrations/0008_focus_task_title.sql)
(v0.9.5), which adds `focus_sessions.task_title` (text) and an index on `focus_sessions(task_id)`. It is
safe to run twice. Until it is applied, a focus run linked to a task is saved with its task id only (no
name copied), and The Orbit names such a task from the task list while it exists.

---

## 🎯 Key Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run preview      # Preview production build (vault + calendar APIs included)
npm run lint         # ESLint check
npm run typecheck    # tsc over src/ and vite.config.ts
npm run test         # Run tests (Vitest) — covers src/ and server/
npm run test:watch   # Watch mode
npm run test:e2e     # Playwright smoke test in Edge (needs E2E_EMAIL / E2E_PASSWORD)
npm run badges       # Refresh the README version and tests badges

npm run dev:desktop   # Native window on the Vite dev server (needs Rust)
npm run build:sidecar # Bundle server/ into src-tauri/binaries/crystal-api-<triple>.exe
npm run build:desktop # Sidecar + web build + Windows installer
npm run build:release # Same, plus the updater signature and latest.json for a GitHub release
```

**CI.** `.github/workflows/ci.yml` runs on every pull request and push to `main`, on Windows: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then `cargo check --locked` in `src-tauri`. Pushing a `v*` tag runs `release.yml` (see [Publishing a release](#packaged-build)).

**Before a release**, run `npm run badges` and `npm run test:e2e`. The smoke test signs in, adds and deletes a task, logs and deletes a transaction, and opens every page, failing on any uncaught error or a page that renders nothing. It starts its own Vite server on port 8090 (`E2E_PORT` to change) and uses the Edge that ships with Windows (`E2E_CHANNEL=chrome` or an empty value for Playwright's Chromium). Point it at a test user created in the Supabase dashboard, not your own account; Row Level Security keeps its rows apart from yours.

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

This produces an NSIS installer (`Crystal OS_<version>_x64-setup.exe`) in `src-tauri/target/release/bundle/nsis/`. NSIS is the only bundle target; MSI is no longer built. The packaged app has no Vite server. Instead, Tauri runs `crystal-api`, a Node sidecar that serves the same `/api/obsidian` and `/api/calendar` routes on `127.0.0.1:8787` and exits with the app. It is not started at launch: the first `/api/*` request asks Rust to start it (`sidecar_ensure` in `src-tauri/src/sidecar.rs`) and waits until it listens, and a request that cannot connect makes the next one start it again. The vault is read natively on desktop, so only the calendar needs it; the Home calendar card asks for the calendar's status only once the calendar has been connected, so a session that never uses the calendar never starts the sidecar.

**Code signing.** Every binary Tauri bundles (the app, the sidecar and the installer) goes through `scripts/sign-windows.mjs` (`bundle.windows.signCommand` in `src-tauri/tauri.bundle.conf.json`). With no certificate configured it leaves them unsigned and the build still succeeds; Windows SmartScreen then shows "unknown publisher". To sign, set `CRYSTAL_SIGN_THUMBPRINT` to the SHA-1 thumbprint of a code-signing certificate in the Windows certificate store, or `CRYSTAL_SIGN_PFX` and `CRYSTAL_SIGN_PFX_PASSWORD` for a `.pfx` file. `signtool.exe` comes from the Windows SDK (or `SIGNTOOL`), timestamps from DigiCert (or `CRYSTAL_SIGN_TIMESTAMP_URL`). `CRYSTAL_SIGN_REQUIRED=1` makes an unconfigured build fail instead.

**Publishing a release.** The in-app updater reads `latest.json` from the newest GitHub release and installs only an installer signed with the updater key, whose public half is `plugins.updater.pubkey` in `tauri.conf.json`. The private key is not in the repo.

1. Set `TAURI_SIGNING_PRIVATE_KEY` to the private key file's path or contents (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has one).
2. Run `npm run build:release`. Next to the installer it writes `<installer>.sig` and `latest.json`, with the notes taken from this version's `CHANGELOG.md` section.
3. Create a GitHub release tagged `v<version>` (not a pre-release, so `releases/latest` points at it) and attach the installer and `latest.json`.

Or let CI do steps 1 to 3: bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, add its CHANGELOG section, and push a `v<version>` tag. `.github/workflows/release.yml` checks the tag matches `package.json`, runs the tests, builds with `npm run build:release`, and creates a **draft** release with the installer and `latest.json` attached. Review it and click **Publish**; the updater ignores drafts. It needs the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the values from your `.env.local`; Vite inlines them into the bundle, and without them the installed app never gets past the splash screen, so the workflow stops if either is missing), `TAURI_SIGNING_PRIVATE_KEY` (the key file's contents) and, if the key has one, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. For a signed installer also add `CRYSTAL_SIGN_PFX_BASE64` (the `.pfx`, base64-encoded) and `CRYSTAL_SIGN_PFX_PASSWORD`; with those set, an unsigned build fails.

**Back up the updater key.** It is `%USERPROFILE%\.tauri\crystal-os.key` (plus its password, if any). Keep a copy somewhere other than this machine, such as a password manager. Losing it means installed copies can no longer update in place; they would need a manual install of a build signed with a new key.

`VITE_SUPABASE_*` are baked in at build time. The sidecar reads its server-side settings from the app config directory:

1. Copy `.env.local` to `%APPDATA%\com.crystalos.desktop\.env.local`. It needs the `VITE_SUPABASE_*` keys too, for token checks.
2. Add `http://127.0.0.1:8787/api/calendar/auth/callback` as a second authorized redirect URI on your Google OAuth client, and set `GOOGLE_REDIRECT_URI` to it in that copy.
3. Launch Crystal OS. **Connect** in The Horizon opens Google in your default browser. Once it reports success, switch back to the app.

**Settings.** The gear at the bottom of the sidebar opens **Settings**, which holds every desktop preference: all three global hotkeys, **Launch at login**, the vault folder, The Portal's theme, and **Install & update**. Each section's header folds it open and closed with a short height animation; which sections are folded is saved in `localStorage` (`crystal-os-settings-collapsed`). Switches, sliders and the fold animation are marked `data-smooth` and keep their short transitions in performance mode, which otherwise makes transitions instant. The palette's **Open Settings** row goes there too. Click the Crystal OS mark at the top of the sidebar to return to **The Pulse** (home) from any page.

**Install & update.** The last panel in Settings keeps Crystal OS current without leaving the app.

- **Check for updates.** Asks the newest GitHub release for its `latest.json`. When it is newer than the running build, **Update to vX** downloads the installer, checks its signature against the updater public key, closes Crystal OS (stopping the sidecar, shells and agents first) and runs the installer in passive mode, which opens the app again when it finishes. An installer that fails the signature check is never run. Pre-releases are not offered here; download one below instead.

- **Download an installer.** The panel lists every published release of `joezhuo2/crystal-os` and pre-selects the newest stable one that has a Windows installer attached. **Download** saves it to your Downloads folder with a progress bar, then offers **Show in folder**. Run the installer yourself when you are ready; Crystal OS never installs over itself.
- **Choose a different version.** The dropdown holds every release, each labelled where it matters — `installed`, `newer`, `pre-release`, or `no installer`. Pick an older version to roll back, or a pre-release to try one early. A release with no Windows asset can be selected but not downloaded; build it from source instead.
- **Build the latest from source.** Runs `npm run build:desktop` in a Crystal OS checkout and streams the build log into the panel, with **Stop** to end the whole process tree. It needs Node.js and the Rust toolchain, and takes several minutes. The packaged app ships no source, so **Choose folder** points it at a checkout; the path is saved as `installerSourceDir` in `settings.json` and is rejected if the folder has no `build:desktop` script. Under `dev:desktop` the checkout the binary was compiled in is used automatically.
- **Why it runs in Rust.** `api.github.com` is deliberately absent from the webview's `connect-src`, the webview cannot write to Downloads, and a build has to spawn a process. `installer_reveal` only opens files under the Downloads folder or the checkout's `target` directory, so it cannot be used to browse the disk.

**Terminal.** The terminal icon above Settings opens a PowerShell terminal (PowerShell 7 if installed, otherwise Windows PowerShell) running on a real pseudoconsole, so colours, tab completion, and interactive prompts work. Shells keep running while you switch tabs and are killed when Crystal OS quits.

- **Up to 5 terminals at once.** The strip above the frame has one tab per shell, **+** to open another (disabled at the limit, shown as `n/5`), and **×** to close one. Middle-click also closes a tab. The last terminal cannot be closed. Every shell keeps running in the background; switching tabs never interrupts a command. Coming back to the Terminal page reopens the tab you last used.
- **Split view, up to 4 shells on screen.** Drag a tab over the terminal: the pane under the pointer shows an outline of where it would land. Near an edge it splits that pane in half (left, right, top or bottom); in the middle it takes that pane's place, or swaps with it if the dragged shell is already on screen. Once 4 panes are showing, a fifth tab can only replace one. Each pane has a title bar you can drag to rearrange, and a button that takes it off screen without closing the shell. Drag a divider to resize (double-click resets it to half). Clicking a pane focuses it (Refresh and the header follow the focused pane); clicking a tab that is not on screen puts it in the focused pane. The split comes back when you return to the Terminal page. Layout logic lives in `src/lib/terminalLayout.ts`.
- Shortcuts while a terminal has focus: **Ctrl+Shift+T** new tab, **Ctrl+Shift+W** close tab, **Ctrl+Tab** / **Ctrl+Shift+Tab** next / previous tab.
- **Refresh** restarts the selected shell with PATH and the other environment variables read again from the registry. Use it after installing something (`winget`, `npm -g`, an installer) that the terminal does not find yet: a running app keeps the environment it started with, so a plain restart of the shell would not see the change.
- Ctrl+C copies when text is selected and interrupts otherwise; Ctrl+V pastes.
- The shells run in Rust (`src-tauri/src/terminal.rs`) and the view talks to them through `terminal_list`, `terminal_open`, `terminal_attach`, `terminal_restart`, `terminal_close`, `terminal_write`, and `terminal_resize` (`src/lib/terminalNative.ts`). Every command after `terminal_open` takes the shell's `id`; the Rust side enforces the limit of 5.
- **Cascadia Mono is bundled with the app** (`@fontsource/cascadia-mono`), not read from the machine, so the terminal looks the same whether or not Windows Terminal is installed. Only the subsets a shell draws ship: latin, latin-ext, and the box-drawing block TUIs use for borders, in regular and bold. The view waits for the face to load before opening xterm, because xterm measures the character cell once and keeps those metrics for the life of the terminal.
- While the tab is open the window switches to a black, glitching monochrome look. The page title and the sidebar's Crystal OS mark glitch with white and grey ghost copies that are clipped away at rest, so the title stays white when animations are stopped (performance mode, reduced motion, hidden window).

**The Portal.** The orbit icon above Terminal opens **The Portal**, where web apps such as Discord and Instagram run as real pages that you sign in to once. See [ADR 0002](docs/adr/0002-portal-child-webviews.md) for how it works.

- **Connect an app** with **+** in the Portal's navbar: pick a preset (Discord, Instagram, LinkedIn, Spotify, X, Reddit, Gmail, Outlook) or add any `https://` site by name and address. Two presets carry WebView2 limits: Google blocks sign-in from embedded webviews, so Gmail may send you to a real browser for the password step, and Spotify's web player needs Widevine DRM that WebView2 does not ship, so it browses but does not play.
- **Use it like a browser tab.** Click a pill to switch apps (the pages cross-fade). **Back**, **Forward**, **Reload**, and **Open in browser** act on the app on screen. Links to other sites open in your default browser.
- **Organise.** Drag pills to reorder them. Right-click a pill to reload it, return to its home page, open it in the browser, toggle **Keep loaded in background**, **Keep live in background** or **Notify on new messages**, **Sign out…**, or **Remove…**.
- **Sessions.** Each app keeps its cookies and storage in its own folder, `%APPDATA%\com.crystalos.desktop\portal\<app id>\`, so you stay signed in across restarts and apps never share a login. **Sign out** clears that app's cookies and storage; **Remove** deletes its folder too.
- **Loading.** While an app's page loads (first open, **Reload**, **Back to home page**, **Sign out**), the frame shows a skeleton of a web app in the theme's colours with "Loading <app>…". The page appears, fading in, once it has finished loading, or after 20 seconds if it never reports that.
- **Always on.** Apps load the first time you open The Portal after launching Crystal OS, then keep running while you use other tabs. Unread counts from their page titles show on each pill and on the sidebar's Portal icon.
- **Background cost.** An app you are not looking at is throttled — its timers and animations are slowed, but it is not suspended, so its connection stays open and messages still arrive. After 30 seconds off screen it also drops its render caches, and picks them back up when you return to it. Hiding Crystal OS to the tray does both at once, for every app and for Crystal OS's own interface. If an app needs full speed while hidden, for a voice call or a live notification stream, right-click its pill and turn on **Keep live in background**; that costs CPU for as long as it is on, so it is off by default. Toggling it rebuilds that app's page, which does not sign you out.
- **Keep loaded in background** (on by default). Turn it off for an app you only check now and then, and its page is closed once it has been off screen for the **Portal unload delay** (**Settings → Performance**, 60 seconds by default, 0 closes it as soon as you switch away). That frees the app's whole WebView2 process. Reopening it loads it again, still signed in, but anything that lived only in the page is gone: unsent drafts, scroll position, open threads. Its unread badge disappears while it is closed, because a closed page reports no title. Menus and dialogs opened over the Portal never start the countdown, and turning the setting off for an app that is already in the background starts it at once. **Keep live** is greyed out while **Keep loaded** is off.
- **Themes.** Choose **Void swirl** (default), **Event horizon**, or **Stargate blue** under **Settings → The Portal**. The theme styles the backdrop, sidebar, navbar, and the animated ring around the app.
- **Keyboard shortcuts (desktop).** While a Portal app is on screen: **Ctrl+Tab** cycles to the next app, **Ctrl+Shift+Tab** cycles to the previous one, **Ctrl+W** opens the Remove confirmation, and **Ctrl+R** reloads the active app. They also work while you are typing inside an app page (Windows): the app's webview catches them before the page does. In Crystal OS's own UI they are disabled while a dialog is open or the focus is inside a text field. `Ctrl+R` prevents Tauri's default full-page reload, which would otherwise drop you to the Home tab.
- **Web build.** Browsers refuse to embed these sites in another page, so there the Portal keeps your app list and opens each app in a new tab.
- The app pages draw above Crystal OS's own UI, so menus and dialogs (such as the pill right-click menu or tray **Quick Add**) hide the app while they are open. A still picture of the page stays in its place behind them. The pages get no access to Crystal OS commands. The view talks to Rust through the `portal_*` commands in `src/lib/portalNative.ts`.

**Performance.** **Settings → Performance** has two controls.

- **Performance mode** (off by default, applies at once). No view is fetched ahead: each loads the first time you open it. Without it, the three views you open most (counted in `localStorage`, `crystal-os:tab-visits`; Engine and Horizon on a fresh install) are fetched one at a time at the first idle moment after Home has settled. Data those views fetched is dropped after one minute unused instead of five; each query keeps its own `staleTime`, so a view reopened within the minute shows its data without refetching. Page transitions, CSS animations and the canvas backdrops are turned off (loading spinners keep turning). The Nebula, Terminal and Portal pages are lazy chunks like the rest; the work they keep running in the background lives in their stores and in Rust, which load with the app.
- **Portal unload delay** (desktop), in seconds: see **Keep loaded in background** above.

Whether or not performance mode is on, hiding the window to the tray or minimising it now stops the backdrop animation loops, freezes CSS animations, and pauses polling (weather refresh, calendar and vault refetches); stale data refetches when the window comes back. Closing the window with its **×** now goes through the same path as the tray and hotkey, so it also trims memory.

**Global hotkeys.** Three combos work from any app:

- `Alt+Space` shows Crystal OS; press it again while the app is in front to hide it, including while you are typing in a Portal app. It does not touch the search bar. Saved as `globalShortcut`.
- `Alt+Shift+Space` shows Crystal OS, switches to Home and focuses the search bar. Saved as `paletteShortcut`.
- `Alt+Shift+H` shows Crystal OS if it is hidden and opens the Home page; if the window is already open it just switches to Home, from any tab. Saved as `homeShortcut`.

Change any of them with **Change** in Settings. All are saved in `%APPDATA%\com.crystalos.desktop\settings.json`, and no two can share a combo. If another app already owns one, Crystal OS still starts and shows a toast.

**Always ready.** The hotkeys only work while Crystal OS is running, so the app stays running in the tray:

- **Launch at login** is on by default. The first time you open the packaged app it registers itself to start at sign-in with `--hidden`, which keeps the window in the tray until you press a hotkey. Turn it off in Settings; the choice is saved as `launchAtLogin` in `settings.json`. Debug builds (`npm run dev:desktop`) never register.
- **Closing the window hides it to the tray.** Use **Quit Crystal OS** in the tray to exit.
- **One instance.** Opening Crystal OS while it is already running shows the existing window.

**Tray.** Crystal OS adds a gem icon to the system tray (a monochrome template icon in the macOS menu bar). Left-click it on Windows to show or hide the window; right-click for the menu:

- **Show / Hide Crystal OS**
- **Pomodoro** — a live status row (`Focus 24:12`), **Start**/**Pause**, and **Reset**. The tray tooltip shows the same countdown.
- **Quick Add…** — shows the window and opens the Quick Add dialog.
- **Quit Crystal OS**

The Pomodoro timer lives in `src/lib/pomodoro.ts`, so it keeps running when you leave the Tasks page and the tray and the on-page timer always agree. It counts down from a wall-clock deadline and wakes once a second, timed for the moment the shown second changes. Tray clicks reach it as Tauri events (`tray://pomodoro`, `tray://quick-add`) handled in `src/lib/tray.ts`, which reports every visible change back to Rust (`update_tray_pomodoro` in `src-tauri/src/tray.rs`).

**Vault.** The desktop app reads your Obsidian vault natively; it does not use `OBSIDIAN_VAULT_PATH` or the sidecar's `/api/obsidian` routes. On first launch, The Archive shows **Choose vault folder**, which opens the system folder picker. The choice is saved as `vaultPath` in `settings.json`; change it later with **Change folder** in Settings.

- **Live updates.** A file watcher (`notify`, debounced 250 ms) emits `vault://changed` whenever a note is added, edited, renamed, or deleted. The one vault listing refetches, plus the open note if it was among the changed files. Edits made in Obsidian show up without a refresh. Only changed notes are re-read.
- **One listing, searched in memory.** Every vault view (The Archive, Home, the command palette, Quick Add, The Orbit) reads the same cached listing. Search and tag filters run over an index built once per listing (plain-text bodies, lowercased fields, counted tags), so typing never walks the vault.
- **Scoped access.** The webview has no fs, shell, or dialog plugin permissions (the Terminal tab runs its shell through its own commands, not the shell plugin). It reaches the vault only through six commands (`get_vault_status`, `pick_vault`, `list_vault`, `read_vault_file`, `write_vault_file`, `watch_vault`), and `src-tauri/capabilities/default.json` allowlists every app command by name. Each path must be a `.md` file inside the picked folder, outside `.obsidian`, `.trash`, `.git`, and `node_modules`.
- **Safe writes.** Quick Add and the note editor write to a temp file and swap it in. Both send the `mtime` they read: if Obsidian saves the note in between, Quick Add redoes the append on top of that edit, and the editor asks whether to keep your version or theirs, instead of overwriting it.
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

The palette sits at the top of Home only. `Cmd/Ctrl + K` switches to Home and focuses it from any tab while Crystal OS is focused (not while typing in the Terminal); on desktop, `Alt+Shift+Space` does the same from any app. It filters tasks and transactions locally and searches vault notes server-side (2+ characters, debounced 250 ms), and understands two natural-language prefixes:

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

Native `<select>`, date, and time inputs are replaced app-wide by `src/components/ui/field-controls.tsx`, because the browser's own popups render as OS chrome — a white sheet on Windows/Chrome — through the dark glass theme. Their popups are portalled, so a dialog's overflow or stacking context cannot clip them, and they flip above the trigger when the viewport has no room below. Hovering a row highlights it without scrolling the list; only the keyboard scrolls the highlighted row into view. `overscroll-behavior: none` in `src/index.css` is limited to real scrollers, because a row's truncated label (`overflow: hidden`) is a scroll container too and would otherwise swallow the wheel, so the list scrolls wherever the cursor rests. `ThemedCombobox` adds a search box for long lists such as the city picker. `:root` also sets `color-scheme: dark` so any remaining native chrome (number spinners, scrollbars) stays dark.

### Adding New Views
1. Create the component in `src/components/views/`
2. Add its id to `TabId` and the `tabs` array in `src/components/layout/Navigation.tsx`
3. Add a loader for it to `loaders` in `src/lib/viewLoader.ts`. Every view is a lazy chunk; work that must keep running while the view is closed belongs in a module-level store that `src/pages/Index.tsx` imports, not in the page

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
