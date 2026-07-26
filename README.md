# Crystal OS

> A beautiful, personal productivity dashboard built with React, TypeScript, and Supabase. Manage tasks, track finances, view calendar, check weather, and stay focused with a built-in Pomodoro timer — all in one elegant interface.

![Crystal OS Preview](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-2.97-3ECF8E?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📋 Tasks** | Full CRUD task management with categories, due dates, priorities, and completion tracking |
| **📅 Calendar** | Monthly view with task integration, event creation, and date navigation |
| **💰 Financials** | Transaction tracking (income/expenses), categories, monthly summaries, and balance overview |
| **🌤️ Weather** | Current conditions + 7-day forecast for saved locations (Open-Meteo API) |
| **⏱️ Pomodoro** | Customizable focus/break intervals, session tracking, and audio notifications |
| **⌨️ Command Palette** | `Cmd/Ctrl + K` global search and quick navigation |
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
| **Forms** | React Hook Form + Zod validation |
| **Animation** | Framer Motion |
| **Date/Time** | date-fns |
| **Testing** | Vitest + React Testing Library |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- Supabase account (free tier works)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/joezhuo2/crystal-os.git
cd crystal-os

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Run database migrations (in Supabase SQL Editor)
# Copy contents of supabase/migrations/*.sql

# 5. Start development server
npm run dev
```

### Environment Variables

```env
# .env.local
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 📁 Project Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Navigation.tsx      # Sidebar + BottomNav
│   │   └── ...
│   ├── ui/                     # shadcn/ui components (40+)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   └── ...
│   └── views/                  # Page-level components
│       ├── HomePage.tsx        # Dashboard with clock, weather, quick stats
│       ├── TasksPage.tsx       # Task list, form, filtering
│       ├── CalendarPage.tsx    # Monthly calendar with events
│       ├── FinancialsPage.tsx  # Transactions, summaries, charts
│       ├── WeatherPage.tsx     # Detailed weather view
│       ├── PomodoroTimer.tsx   # Focus timer component
│       └── CategoryManager.tsx # Category CRUD for tasks/finances
├── contexts/
│   └── AppContext.tsx          # Global state (tasks, transactions, categories, UI)
├── hooks/
│   ├── useWeather.ts           # Open-Meteo API integration
│   ├── use-toast.ts            # Toast notifications (Sonner)
│   └── use-mobile.tsx          # Responsive breakpoint hook
├── lib/
│   ├── supabase.ts             # Supabase client + helpers
│   └── utils.ts                # cn(), date helpers, formatters
├── pages/
│   ├── Index.tsx               # Main layout with routing
│   └── NotFound.tsx
├── App.tsx                     # Providers + Router setup
└── main.tsx                    # Entry point
```

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

Run migrations in Supabase Dashboard → SQL Editor.

---

## 🎯 Key Commands

```bash
# Development
npm run dev          # Start dev server (port 5173)
npm run build        # Production build
npm run build:dev    # Development build
npm run preview      # Preview production build

# Code Quality
npm run lint         # ESLint check
npm run test         # Run tests (Vitest)
npm run test:watch   # Watch mode

# Database (via Supabase CLI)
supabase db push     # Push migrations
supabase db reset    # Reset local DB
supabase gen types   # Generate TypeScript types
```

---

## 🎨 Customization

### Theming
Edit `tailwind.config.ts` and `src/index.css` for:
- Color palette (CSS variables in `:root` and `.dark`)
- Glassmorphism intensity (`backdrop-blur`, opacity)
- Animation durations

### Adding New Views
1. Create component in `src/components/views/`
2. Add to `views` record in `src/pages/Index.tsx`
3. Add navigation item in `src/components/layout/Navigation.tsx`
4. Add route if needed in `src/App.tsx`

---

## 📦 Deployment

### Vercel (Recommended)
```bash
npm i -g vercel
vercel --prod
```
Set environment variables in Vercel Dashboard.

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

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run test`
5. Lint: `npm run lint`
6. Commit: `git commit -m 'Add amazing feature'`
7. Push: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Code Style
- Follow existing patterns in the codebase
- Use TypeScript strict mode
- Prefer functional components + hooks
- Write tests for new utilities/hooks

---

## 📄 License

MIT License © 2024 [Joe Zhuo](https://github.com/joezhuo2)

See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) — Beautiful, accessible component library
- [Radix UI](https://www.radix-ui.com/) — Unstyled, accessible primitives
- [Supabase](https://supabase.com/) — Open-source Firebase alternative
- [Lucide](https://lucide.dev/) — Clean, consistent icon set
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first styling
- [Framer Motion](https://www.framer.com/motion/) — Production-ready animations
- [Open-Meteo](https://open-meteo.com/) — Free weather API

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/joezhuo2">Joe Zhuo</a></sub>
  <br>
  <sub>⭐ Star this repo if you find it useful!</sub>
</div>
