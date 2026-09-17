# Planned Features
- [v0.7.0] banking update - use plaid to connect to banks (store api keys and t okens in secure env variables)

# Additions

## Portal Icon Hover / Right-Click Enhancements

### Hover Tooltip Info
- **Badge count** — surface the unread count (e.g. `3 unread`) directly in the tooltip, not just the pill badge
- **Connection status** — `Connected`, `Loading…`, `Error — click to retry` when webview fails
- **Session uptime** — how long since the app was first connected / last reloaded (e.g. `Connected 2h ago`)

### Right-Click Context Menu Items
- **Clear site data** — wipe cookies/storage for this app without full sign-out (keeps the app connected but logged out)

# QoL/Changes

- replace the default apps in the portal: 
    - whatsapp => linkedin
    - messenger => 
    - slack => 
    - telegram => 

- in the bottom of the settings menu, add a place to download the latest exe installer or build the latest one (for latest released version), and add option for user to choose which version they want to download

# Cleanup
- remove old project files created by `npm run build:desktop` or `npm run build`

# Performance

## CPU Usage

- [ ] **Split AppContext into data + UI-flag contexts** — single monolith context re-renders entire app shell (SidebarNav, BottomNav, CommandPalette, GlobalOverlays, active view) on every state change. Toggling Quick Add or opening a task form re-renders everything. Move volatile UI flags (`showTaskForm`, `showQuickAdd`, `quickAddDraft`, `showEventForm`, `editingTask`, `editingTransaction`, `selectedNotePath`) into a separate context or colocate in components. (`src/contexts/AppContext.tsx:386-404`, `src/pages/Index.tsx:93-117`)

- [ ] **Add React.lazy + Suspense to all tab views** — all 8 views are statically imported in `Index.tsx`, so every tab pays recharts + framer-motion + xterm cost at first paint. Lazy-load each view like `TerminalPage` already does with xterm. (`src/pages/Index.tsx:8-16,102-112`)

- [ ] **Memoize CalendarPage per-row components + precompute day counts** — `EventRow` is plain function, not memoized, rendered with inline closures `onEdit={() => onEdit(event)}`. `MonthGrid` re-filters entire events array for every day cell on every render (O(days × events)). Precompute per-day counts via `useMemo` keyed on `[events, year, month]`. (`src/components/views/CalendarPage.tsx:182-246,271-282,403-409`)
- [ ] **Memoize HomePage widgets** — `EngineWidget` derives `openTasks`/`topTasks` (filter + sort) on every render, not memoized. Same pattern in `SmartSummary` and `VaultWidget`. All six widgets re-render together on any AppContext change. Add `React.memo` + `useMemo` for derived lists. (`src/components/views/HomePage.tsx:322-410`)
- [ ] **Memoize TaskItem + KanbanBoard** — `TaskItem` is a `motion.div` with `layout` per task, not memoized; every row re-renders on any AppContext change. `layout` on many simultaneous motion items is expensive. `KanbanBoard` recomputes `categoryColumns`/`doneColumn`/`allColumns` every render. (`src/components/views/TasksPage.tsx:14-57,81-93`)
- [ ] **Memoize ArchivePage row components** — `NoteRow`/`TagChip` not memoized; inline closures `onSelect={() => …}` at `:446`. Full list re-renders on `selectedNotePath` and any AppContext change. (`src/components/views/ArchivePage.tsx:59-88,35-57`)

- [ ] **Gate CommandPalette heavy work on focus** — always mounted on non-terminal/portal tabs, consumes whole AppContext, re-runs `matchedTasks`/`matchedTransactions`/debounced vault filter on every app mutation even when closed. Memo derived matches; gate heavy work on `focused`. (`src/components/CommandPalette.tsx:121-151`)

- [ ] **Hoist constant arrays in FinancialsPage** — inline `options={[...]}` arrays recreated each keystroke in `TransactionDrawer`. (`src/components/views/FinancialsPage.tsx:162-231,213-221`)

- [ ] **Cap `listNotes` I/O concurrency in server vault** — `Promise.all(entries.map(loadNote))` opens every `.md` file simultaneously with no bound. `vaultNative` caps at `READ_CONCURRENCY = 16`; server version does not. Large vaults spike file-descriptors and memory per request. (`server/obsidian/vault.ts:127`)

## Memory Usage

- [ ] **Prune `noteCache` on delete in server vault** — `noteCache` Map grows unbounded; `listNotes` re-populates but never removes entries for deleted/renamed files. Desktop path (`src/lib/vaultNative.ts:140-147`) prunes correctly. Process-lifetime leak for long-running sessions. (`server/obsidian/vault.ts:80,110`)

- [ ] **Reduce toast retention time** — `TOAST_REMOVE_DELAY = 1000000` (~16 min) keeps dismissed toast Map entries alive. Under sustained toast spam the Map accumulates entries for that full window. Consider shorter delay or immediate cleanup on dismiss. (`src/hooks/use-toast.ts:53,66`)

- [ ] **Paginate initial data load** — single `Promise.all` fetches all tasks, all transactions, and categories with no limit. Memory/CPU grows with data size; dashboard holds entire dataset in state. Consider pagination or streaming for large datasets. (`src/contexts/AppContext.tsx:240-246`)

- [ ] **Shrink sidecar: replace `googleapis` with targeted REST** — `server-dist/crystal-api.cjs` is 13.5 MB, driven by full `googleapis` import. Only `calendar_v3` + `OAuth2` are used. Replace with `google-auth-library` + direct REST calls, or use esbuild `external` + lazy import. (`server/calendar/events.ts:1`, `server/calendar/oauth.ts:2`, `scripts/build-sidecar.mjs`)

## Other

- [ ] **Code-split renderer bundle with manualChunks** — `dist/assets/index-*.js` is 1.59 MB raw with no splitting. recharts, framer-motion, @supabase/supabase-js, lucide-react all inlined. Add `build.rollupOptions.output.manualChunks` in vite config. (`vite.config.ts`)

- [ ] **Add compression plugin** — no `vite-plugin-compression` / brotli / gzip in build config. 1.59 MB raw entry serves uncompressed; gzip would cut ~65-70%. (`vite.config.ts`, `package.json`)

- [ ] **Self-host Google Fonts offline** — render-blocking Google Fonts stylesheet fetch on every desktop app launch despite `display=swap`. Better: self-host the woff2 subset since this is a Tauri desktop app. (`index.html:9-11`)

- [ ] **Dedupe FinancialsPage index keys** — `data.map((entry, i) => <Cell key={i} .../>)` uses index keys on data-driven pie slices; reorder/re-fetch remounts rows. Use stable key. (`src/components/views/FinancialsPage.tsx:104`)

- [ ] **Terminal IPC: send scrollback delta instead of full buffer** — `terminal_attach` clones entire 256 KB `scrollback.text` on every tab switch. Send only the delta since `scrollbackEnd` instead. (`src-tauri/src/terminal.rs:443-450`)

- [ ] **Clean up terminal reader thread AppHandle retention** — old session reader/wait threads retain full `AppHandle` clone until ConPTY EOF after kill. Bounded by `MAX_SESSIONS = 5` but still churn. Consider explicit signal/cleanup on session replace. (`src-tauri/src/terminal.rs:351-386`)