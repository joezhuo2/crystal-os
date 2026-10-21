# Planned Features
- [v0.12.0] vault/banking overhaul
    - [ ]  use plaid to connect to banks (store api keys and tokens in secure .env variables)
    - [ ] themed glassmorphism UI 
    - [ ] **Data export / backup.** One button in Settings that exports tasks, transactions, categories and settings to JSON/CSV, and an import to restore them. Useful before schema changes like Plaid.
    - [ ] **Vault: budgets.** Monthly budget per category with progress bars and a warning at 80%. Send the 80% warning as a native notification too (src/lib/notifications.ts), with its own switch in Settings → Notifications.
    - [ ] **Vault: subscriptions and bills.** Recurring charges with their next dates, shown in the Horizon and the Engine.
    - [ ] **Vault: CSV import.** Import bank CSV exports as a fallback if Plaid doesn't cover the bank.
    - [ ] **Vault: savings goals.** Goals with a target, deadline and progress.
    - [ ] **Vault: net worth.** Net worth over time.

### Docs

## Planned List

- [ ] **[Med] Morning plan and evening shutdown.** On the first open of the day, one card with weather, today's events, overdue tasks and habits, where you pick the day's top 3 tasks. In the evening, a shutdown step rolls unfinished tasks to tomorrow and writes a summary to the daily note.
- [ ] **[Med] Orbit: correlations.** Mood against habits done or focus time.
- [ ] **[Med] Horizon: meeting note from an event.** A button on an event that creates a vault note from a template, linked to the event.
- [ ] **[Med] The Comet (inbox).** A hotkey captures anything instantly; triage it later into a task, event, note or transaction.
- [ ] **[Med] The Constellation (people).** Birthdays, last contacted and gift ideas, with reminders in the Horizon.
- [ ] **[Med] Nebula: saved prompts.** A per-project library of reusable prompts, available from the composer and the command palette.

- [ ] [Low-Med] Optionally link a task to a vault note so the details live in Obsidian. (v2)
- [ ] **[Low] The Biosphere (health).** Sleep, workouts, weight and water, entered by hand at first, feeding Orbit trends.
- [ ] **[Low] The Gallery.** place to dump any images/photos/notes/etc.
- [ ] **[Low] The Satellite.** Books, shows and games backlog with ratings.
- [ ] **[Low] Engine: time blocking.** Drag a task from the Engine onto the Horizon week or day grid to create a calendar block sized from its time estimate, linked back to the task.
- [ ] **[Low] Atmosphere: what to wear.** A clothing suggestion from the forecast.
- [ ] [Low] Implement the entire obsidian graph feature directly into the vault (v2)
- [ ] **[Low] Nebula: cost and usage view.** Token totals are stored in `harness/state.json`; show them per project and per day, with an estimated cost per tier.
- [ ] **[Very-Low] Engine: task dependencies.** "Blocked by" another task; blocked tasks are dimmed, skipped by the Home nudge and the Fits today? bar until the blocker is done.
