# Planned Features
- [v0.11.0] QoL & Smaller Features
    - glassmorphism ui to all home page widget cards (vault, nebula)
- [v0.12.0] vault/banking overhaul
    - [ ]  use plaid to connect to banks (store api keys and tokens in secure .env variables)
    - [ ] themed glassmorphism UI 
    - [ ] **Data export / backup.** One button in Settings that exports tasks, transactions, categories and settings to JSON/CSV, and an import to restore them. Useful before schema changes like Plaid.
    - [ ] **Vault: budgets.** Monthly budget per category with progress bars and a warning at 80%. Send the 80% warning as a native notification too (src/lib/notifications.ts), with its own switch in Settings → Notifications.
    - [ ] **Vault: subscriptions and bills.** Recurring charges with their next dates, shown in the Horizon and the Engine.
    - [ ] **Vault: CSV import.** Import bank CSV exports as a fallback if Plaid doesn't cover the bank.
    - [ ] **Vault: savings goals.** Goals with a target, deadline and progress.
    - [ ] **Vault: net worth.** Net worth over time.
- [v1.0.0] first full release
    - [ ] **Onboarding checklist.** First-run card listing what is not set up yet (vault folder, Google Calendar, NIM key, launch at login) with a button for each. The packaged app reads Supabase, vault and Google credentials from `%APPDATA%\com.crystalos.desktop\.env.local`. A fresh install needs a setup screen (or the onboarding checklist idea above) that writes these, plus a clear error when they are missing.
    - [ ] **Google OAuth app out of testing mode.** In testing mode refresh tokens expire after 7 days, so The Horizon disconnects weekly. Publish the OAuth consent screen.
    - [ ] **CHANGELOG 1.0.0 entry** summarising what ships.

## Before first release (v1.0.0)

### Packaging and distribution
- [ ] **Code-signing certificate.** Get an OV certificate (or Azure Trusted Signing), then set `CRYSTAL_SIGN_THUMBPRINT` locally, or the `CRYSTAL_SIGN_PFX_BASE64`/`CRYSTAL_SIGN_PFX_PASSWORD` secrets for the release workflow.
- [ ] **Clean-machine install test.** Install on a Windows machine (or VM) with no dev tools: WebView2 present, the `crystal-api` sidecar starts, tray, hotkeys and launch-at-login work, and uninstall leaves nothing behind except user data.

### Integrations
- [ ] **Review the CSP.** `connect-src` lists the sidecar, Supabase and weather.gc.ca; confirm Nebula (NIM, OmniRoute) and Portal traffic still works in the packaged build with it.

### Docs

## Planned List

- [ ] [Med-High] Customisable navbar. Reorder and hide sidebar sections.
- [ ] [Mid-High] Horizon: free-slot finder. "Next free 2 h block" search.
- [ ] **[Med-High] Habits: reminders.** An optional time per habit that sends a native notification if it is not ticked yet, with its own switch in Settings → Notifications.

- [ ] **[Med] Morning plan and evening shutdown.** On the first open of the day, one card with weather, today's events, overdue tasks and habits, where you pick the day's top 3 tasks. In the evening, a shutdown step rolls unfinished tasks to tomorrow and writes a summary to the daily note.
- [ ] **[Med] Orbit: correlations.** Mood against habits done or focus time.
- [ ] **[Med] Horizon: meeting note from an event.** A button on an event that creates a vault note from a template, linked to the event.
- [ ] [Med] Pulse: Now / Next strip. Countdown to the next event and, when it has a location, a leave-by time. (calculate from current location)
- [ ] **[Med] The Comet (inbox).** A hotkey captures anything instantly; triage it later into a task, event, note or transaction.
- [ ] **[Med] The Constellation (people).** Birthdays, last contacted and gift ideas, with reminders in the Horizon.
- [ ] **[Med] Nebula: diff review and commit.** After a run, a pane with the changed files and their diffs, with Accept, Revert per file and a one-click commit with a generated message.
- [ ] **[Med] Nebula: saved prompts.** A per-project library of reusable prompts, available from the composer and the command palette.
- [ ] **[Med] Privacy mode.** A settings option that blurs money amounts, archive names/desc (until opened)

- [ ] [Low-Med] Optionally link a task to a vault note so the details live in Obsidian. (v2)
- [ ] **[Low] The Biosphere (health).** Sleep, workouts, weight and water, entered by hand at first, feeding Orbit trends.
- [ ] **[Low] The Gallery.** place to dump any images/photos/notes/etc.
- [ ] **[Low] The Satellite.** Books, shows and games backlog with ratings.
- [ ] **[Low] Orbit: estimate vs actual.** Compare each completed task's time estimate with the Pomodoro focus time logged to it, and show the average over/under-run per category in the reviews.
- [ ] **[Low] Engine: time blocking.** Drag a task from the Engine onto the Horizon week or day grid to create a calendar block sized from its time estimate, linked back to the task.
- [ ] **[Low] Atmosphere: what to wear.** A clothing suggestion from the forecast.
- [ ] [Low] Implement the entire obsidian graph feature directly into the vault (v2)
- [ ] **[Low] Nebula: cost and usage view.** Token totals are stored in `harness/state.json`; show them per project and per day, with an estimated cost per tier.
- [ ] **[Very-Low] Engine: task dependencies.** "Blocked by" another task; blocked tasks are dimmed, skipped by the Home nudge and the Fits today? bar until the blocker is done.
- [ ] **[Very-Low] Engine: keyboard navigation.** j/k to move through the list, x to complete, e to edit, s to snooze, matching the command palette's keyboard-first feel.
