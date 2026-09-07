# Crystal OS

> A personal productivity dashboard built with React, TypeScript, Supabase, your Google Calendar, and your Obsidian vault. Tasks, calendar, finances, weather, a Pomodoro timer, and a searchable read/write view of your notes — all behind one glassmorphic interface and one command palette.

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2.97-3ECF8E?logo=supabase&logoColor=white)
![Tests](https://img.shields.io/badge/tests-76%20passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.2.5-6366F1)
![License](https://img.shields.io/badge/License-MIT-green)

Current release: **v0.2.5** — see [CHANGELOG.md](CHANGELOG.md) for release history.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📋 Tasks** | Full CRUD task management with categories, due dates, priorities, and completion tracking |
| **📅 The Horizon** | Google Calendar, live: month and agenda views, create/edit/delete events (delete confirmed), all-day and recurring events, multi-calendar picker |
| **🏠 The Pulse** | Clock, weather, AI smart summary, daily focus, today's calendar events, and a vault widget — each with its own shimmer skeleton while loading |
| **💰 Financials** | Transaction tracking (income/expenses), categories, monthly summaries, and balance overview |
| **🌤️ Weather** | Current conditions + 7-day forecast for saved Ontario locations |
| **📖 The Archive** | Browse, search, and read your Obsidian vault in-app — frontmatter, tags, wikilinks, GFM markdown |
| **📝 Quick Add** | Append a timestamped, tagged capture to any vault note without leaving the dashboard |
| **⏱️ Pomodoro** | Customizable focus/break intervals, session tracking, and audio notifications (Tasks view) |
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
| **Calendar** | Vite middleware plugin + `googleapis` OAuth2 (Node-only, server side) |
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
│   ├── vault.ts                # Vault reads, search, frontmatter tag upsert, quick add
│   └── vault.test.ts           # 42 unit tests over vault.ts
└── calendar/
    ├── plugin.ts               # Vite middleware: /api/calendar/* routes
    ├── oauth.ts                # OAuth2 client, refresh-token store, consent + revoke
    ├── events.ts               # Google Calendar calls + event shape mapping
    ├── envFile.ts              # Read/upsert a single key in .env.local
    ├── errors.ts               # CalendarError (message + HTTP status)
    ├── envFile.test.ts         # 12 unit tests over envFile.ts
    └── events.test.ts          # 21 unit tests over the event mappers

src/
├── components/
│   ├── layout/
│   │   └── Navigation.tsx      # Sidebar + BottomNav
│   ├── ui/                     # shadcn/ui components (40+)
│   │   ├── field-controls.tsx  # ThemedSelect, DateField, TimeField (portalled popups)
│   │   └── dashboard-skeletons.tsx # Per-widget loading skeletons for The Pulse
│   ├── views/                  # Page-level components
│   │   ├── HomePage.tsx        # Clock, weather, smart summary, daily focus, today's events, vault widget
│   │   ├── TasksPage.tsx       # Task list, form, filtering, Pomodoro
│   │   ├── CalendarPage.tsx    # Google Calendar: month + agenda, event CRUD
│   │   ├── FinancialsPage.tsx  # Transactions, summaries, charts
│   │   ├── WeatherPage.tsx     # Detailed weather view
│   │   ├── ArchivePage.tsx     # Vault browser: search, tags, markdown reader
│   │   ├── PomodoroTimer.tsx   # Focus timer component
│   │   └── CategoryManager.tsx # Category CRUD for tasks/finances
│   ├── CommandPalette.tsx      # Search, NL commands, vault note results
│   ├── QuickAddDialog.tsx      # Append a capture to a vault note
│   └── NavLink.tsx
├── contexts/
│   └── AppContext.tsx          # Global state (tasks, transactions, categories, vault + event-form UI)
├── hooks/
│   ├── useVault.ts             # React Query bindings for /api/obsidian/*
│   ├── useGoogleCalendar.ts    # React Query bindings for /api/calendar/*
│   ├── useWeather.ts           # Weather API integration
│   ├── use-toast.ts            # Toast notifications (Sonner)
│   └── use-mobile.tsx          # Responsive breakpoint hook
├── lib/
│   ├── supabase.ts             # Supabase client + helpers
│   └── utils.ts                # cn(), useDebouncedValue(), date helpers, formatters
├── pages/
│   ├── Index.tsx               # Main layout, view registry, global overlays
│   └── NotFound.tsx
├── App.tsx                     # Providers + Router setup
└── main.tsx                    # Entry point
```

---

## 📖 The Archive (Obsidian integration)

Crystal OS reads your vault directly off disk. `fast-glob` and `gray-matter` are Node-only and the vault is a local directory, so all of that work happens in a Vite middleware plugin — the browser bundle only ever sees JSON.

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

### Safety

Every filesystem access goes through `resolveVaultPath`, which rejects absolute paths, drive letters, and any traversal escaping the vault root. Request bodies are capped at 64 KB, capture text at 10,000 characters, and tags at 12 per request / 60 characters each, validated against the Obsidian tag charset.

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

The consent flow carries a random `state` nonce that is verified on callback and expires after 10 minutes. Request bodies are capped at 64 KB. `googleapis` is Node-only and is never imported from `src/` — the client re-declares the event types it needs.

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
```

---

## ⌨️ Command Palette

`Cmd/Ctrl + K` focuses the palette. It filters tasks and transactions locally and searches vault notes server-side (2+ characters, debounced 250 ms), and understands two natural-language prefixes:

| Input | Result |
|-------|--------|
| `add Buy milk` | Creates a task |
| `log 25 for Lunch` | Records an expense |
| *"Add a new event"* | Opens The Horizon's create-event form for today |
| *anything else* | Filters tasks, transactions, and vault notes; **Quick Add** is always offered as the first row |

Selecting a note result opens it in The Archive.

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
