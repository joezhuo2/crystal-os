# Crystal OS

> A personal productivity dashboard built with React, TypeScript, Supabase, and your Obsidian vault. Tasks, calendar, finances, weather, a Pomodoro timer, and a searchable read/write view of your notes — all behind one glassmorphic interface and one command palette.

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2.97-3ECF8E?logo=supabase&logoColor=white)
![Tests](https://img.shields.io/badge/tests-43%20passing-brightgreen)
![License](https://img.shields.io/badge/License-MIT-green)

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📋 Tasks** | Full CRUD task management with categories, due dates, priorities, and completion tracking |
| **📅 Calendar** | Monthly view with task integration, event creation, and date navigation |
| **💰 Financials** | Transaction tracking (income/expenses), categories, monthly summaries, and balance overview |
| **🌤️ Weather** | Current conditions + 7-day forecast for saved Ontario locations |
| **📖 The Archive** | Browse, search, and read your Obsidian vault in-app — frontmatter, tags, wikilinks, GFM markdown |
| **📝 Quick Add** | Append a timestamped, tagged capture to any vault note without leaving the dashboard |
| **⏱️ Pomodoro** | Customizable focus/break intervals, session tracking, and audio notifications (Tasks view) |
| **⌨️ Command Palette** | Global search over tasks, transactions, and vault note bodies, plus natural-language `add` / `log` commands |
| **🎨 Theming** | Glassmorphism UI with light/dark mode, smooth Framer Motion animations |
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
```

Changing `OBSIDIAN_VAULT_PATH` requires a dev-server restart — Vite reads it once at config time.

> **Note:** the Supabase URL and anon key currently live in `src/lib/supabase.ts` rather than in env vars. Point them at your own project before deploying.

---

## 📁 Project Structure

```
server/
└── obsidian/
    ├── plugin.ts               # Vite middleware: /api/obsidian/* routes
    ├── vault.ts                # Vault reads, search, frontmatter tag upsert, quick add
    └── vault.test.ts           # 42 unit tests over vault.ts

src/
├── components/
│   ├── layout/
│   │   └── Navigation.tsx      # Sidebar + BottomNav
│   ├── ui/                     # shadcn/ui components (40+)
│   ├── views/                  # Page-level components
│   │   ├── HomePage.tsx        # Clock, weather, smart summary, daily focus, vault widget
│   │   ├── TasksPage.tsx       # Task list, form, filtering, Pomodoro
│   │   ├── CalendarPage.tsx    # Monthly calendar with events
│   │   ├── FinancialsPage.tsx  # Transactions, summaries, charts
│   │   ├── WeatherPage.tsx     # Detailed weather view
│   │   ├── ArchivePage.tsx     # Vault browser: search, tags, markdown reader
│   │   ├── PomodoroTimer.tsx   # Focus timer component
│   │   └── CategoryManager.tsx # Category CRUD for tasks/finances
│   ├── CommandPalette.tsx      # Search, NL commands, vault note results
│   ├── QuickAddDialog.tsx      # Append a capture to a vault note
│   └── NavLink.tsx
├── contexts/
│   └── AppContext.tsx          # Global state (tasks, transactions, categories, vault UI)
├── hooks/
│   ├── useVault.ts             # React Query bindings for /api/obsidian/*
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

## 🗄️ Database Schema (Supabase)

```sql
-- Core tables
profiles (id, user_id, display_name, avatar_url, created_at)
categories (id, user_id, name, color, icon, type, created_at)
tasks (id, user_id, category_id, title, description, due_date, priority, completed, created_at)
transactions (id, user_id, category_id, amount, type, description, date, created_at)

-- Row Level Security enabled on all tables
-- Policies: users can only access their own data
```

Create these in the Supabase Dashboard → SQL Editor. Migrations are not yet checked into this repo.

---

## 🎯 Key Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run preview      # Preview production build (vault API included)
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
| *anything else* | Filters tasks, transactions, and vault notes; **Quick Add** is always offered as the first row |

Selecting a note result opens it in The Archive.

---

## 🎨 Customization

### Theming
Edit `tailwind.config.ts` and `src/index.css` for:
- Color palette (CSS variables in `:root` and `.dark`)
- Glassmorphism intensity (`backdrop-blur`, opacity)
- Animation durations

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
