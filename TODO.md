# Planned Features
- [v0.10.0] - engine options update
- [ ] [v0.9.6] **task list** (the engine sort/filter button) (new themed button directly right of categories, with sort options (date, priority, estimated time, etc.), (ascending/descending), and filter by (category, priority, estimated time (<=,>=,==), name, etc.), with open/close smooth animations)
- [v0.9.7] show a configurable amount of completed tasks (others are hidden until expanded. (eg. "show xx more" button), and a "show xx snoozed" button under this one)
- [v0.9.8] when changing start time to (eg. 9:00AM), end time should also be adjusted to 1h after (eg. 10:00AM for the earlier example)
- [v0.9.9] animations when completing/uncompleting a task
- [v0.9.10] the engine board view: drag tasks between categories on task view to change their categories, show all categories (including empty ones, overdue category, and done category), pomodoro should always show on the right, categories should be scrollable left/right
- [v0.9.11] glassmorphism ui loading/login screen with background image
- [v0.11.0] vault/banking overhaul
    - [ ]  use plaid to connect to banks (store api keys and tokens in secure .env variables)
    - [ ] themed glassmorphism UI 
    - [ ] **Data export / backup.** One button in Settings that exports tasks, transactions, categories and settings to JSON/CSV, and an import to restore them. Useful before schema changes like Plaid.
    - [ ] **Vault: budgets.** Monthly budget per category with progress bars and a warning at 80%. Send the 80% warning as a native notification too (src/lib/notifications.ts), with its own switch in Settings → Notifications.
    - [ ] **Vault: subscriptions and bills.** Recurring charges with their next dates, shown in the Horizon and the Engine.
    - [ ] **Vault: CSV import.** Import bank CSV exports as a fallback if Plaid doesn't cover the bank.
    - [ ] **Vault: savings goals.** Goals with a target, deadline and progress.
    - [ ] **Vault: net worth.** Net worth over time.

### Theme switching (left over from v0.8.5)
- [ ] **Changing the root theme class still restyles the page subtree.** v0.8.5 turned the per-theme `.x-root main .glass-card` rule sets into `--glass-card-*` values on each theme's `<main>`, but `rootClass` and the `body` `horizon-theme`/`engine-theme`/`orbit-theme` classes still change on every switch, and the `portal-theme-*`, `sidebar-*` and `*-title` rules are still per theme. Measure a switch in the Performance panel before going further; if recalc is still a large share, move the remaining palettes to custom properties set from JS on one element.

- redo portal/obsidian/nebula ui (change to glassmorphism with some background)
- glassmorphism ui to all home page widget cards (except terminal)
- global search bar should be an overlay on any screen, and fully themed to current page

## Before first release (v1.0.0)

### Blockers
- [ ] **Onboarding checklist.** First-run card listing what is not set up yet (vault folder, Google Calendar, NIM key, launch at login) with a button for each. The packaged app reads Supabase, vault and Google credentials from `%APPDATA%\com.crystalos.desktop\.env.local`. A fresh install needs a setup screen (or the onboarding checklist idea above) that writes these, plus a clear error when they are missing.

### Packaging and distribution
- [ ] **Code-signing certificate.** Get an OV certificate (or Azure Trusted Signing), then set `CRYSTAL_SIGN_THUMBPRINT` locally, or the `CRYSTAL_SIGN_PFX_BASE64`/`CRYSTAL_SIGN_PFX_PASSWORD` secrets for the release workflow.
- [ ] **Breaking dependency upgrades** left by the v0.8.3 audit: `react-router-dom` 7, `vite` 8, `vitest` 5, `tailwindcss` 4.
- [ ] **Clean-machine install test.** Install on a Windows machine (or VM) with no dev tools: WebView2 present, the `crystal-api` sidecar starts, tray, hotkeys and launch-at-login work, and uninstall leaves nothing behind except user data.

### Integrations
- [ ] **Google OAuth app out of testing mode.** In testing mode refresh tokens expire after 7 days, so The Horizon disconnects weekly. Publish the OAuth consent screen (or document the limit).
- [ ] **Review the CSP.** `connect-src` lists the sidecar, Supabase and weather.gc.ca; confirm Nebula (NIM, OmniRoute) and Portal traffic still works in the packaged build with it.

### Docs
- [ ] **CHANGELOG 1.0.0 entry** summarising what ships.

## Planned List

- [ ] **[Low-Med] Customisable navbar.** Reorder and hide sidebar sections.
- [ ] **[Low-Med] Pulse: Now / Next strip.** Countdown to the next event and, when it has a location, a leave-by time. (calculate from current location)
- [ ] **[Low-Med] Orbit: year in review.**
- [ ] [Low-Med] Optionally link a task to a vault note so the details live in Obsidian. (v2)

- [ ] **[Low] Undo toast.** A 5 s "Undo" after deleting, completing or rescheduling a task, event or transaction.

## Will Consider List
### Cross-app features
- [ ] **[Med] Morning plan and evening shutdown.** On the first open of the day, one card with weather, today's events, overdue tasks and habits, where you pick the day's top 3 tasks. In the evening, a shutdown step rolls unfinished tasks to tomorrow and writes a summary to the daily note.

### Improvements to existing sections
- [ ] **[Med] Horizon: meeting note from an event.** A button on an event that creates a vault note from a template, linked to the event.
- [ ] **[Med] Horizon: free-slot finder.** "Next free 2 h block" search.
- [ ] **[Low] Atmosphere: what to wear.** A clothing suggestion from the forecast.
- [ ] **[Med] Orbit: habit targets and quantities.** "3× per week" goals and counted habits ("8 glasses of water") alongside daily yes/no.
- [ ] **[Med] Orbit: correlations.** Mood against habits done or focus time.
- [ ] **[Med] Archive: Connections and Graph** Show a list of connected notes that are clickable (click loads the note that was clicked) (v1). 
    - [ ] Implement the entire obsidian graph feature directly into the vault (v2)
- [ ] **[Low] Nebula: cost and usage view.** Token totals are stored in `harness/state.json`; show them per project and per day, with an estimated cost per tier.

### New navbar sections
- [ ] **[High] The Constellation (people).** Birthdays, last contacted and gift ideas, with reminders in the Horizon.
- [ ] **[Med] The Comet (inbox).** A hotkey captures anything instantly; triage it later into a task, event, note or transaction.
- [ ] **[Low] The Biosphere (health).** Sleep, workouts, weight and water, entered by hand at first, feeding Orbit trends.
- [ ] **[Low] The Gallery.** place to dump any images/photos/notes/etc.
- [ ] **[Low] The Satellite.** Books, shows and games backlog with ratings.
