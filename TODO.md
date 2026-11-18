# Planned Features
- [v0.13.0] vault/banking overhaul
    - [ ]  use plaid to connect to banks (store api keys and tokens in secure .env variables)
    - [ ] themed glassmorphism UI 
    - [ ] **Data export / backup.** One button in Settings that exports tasks, transactions, categories and settings to JSON/CSV, and an import to restore them. Useful before schema changes like Plaid.
    - [ ] **Vault: recurring items and bills in the Horizon and the Engine.** They are listed under Upcoming in The Vault since v0.19.0, but not yet on the calendar or as tasks.

### Docs

## Planned List

- [ ] **[Med] Morning plan and evening shutdown.** On the first open of the day, one card with weather, today's events, overdue tasks and habits, where you pick the day's top 3 tasks. In the evening, a shutdown step rolls unfinished tasks to tomorrow and writes a summary to the daily note.
- [x] **[Med] The Observatory (study).** Phases 1 to 5 are built (not yet checked in the app).
    - [x] Phase 2, study loop: question callouts, FSRS with ts-fsrs, queue, question types, priority map, streak, daily goal.
    - [x] Phase 3, resources: drop zone, sorters, manual popup, inbox, textbook, question sheet and slide deck extraction including 4-up handouts, local OCR with Unclear confidence badges, review pool, reader.
    - [x] Phase 4, integrations: Engine and Horizon links, exam urgency, create task from topic, focus timer auto start/stop, Home widget, command palette.
    - [x] Phase 5, AI features (provider None by default), Deep Sky and Orbit study stats.
- [ ] **[Med] The Comet (inbox).** A hotkey captures anything instantly; triage it later into a task, event, note or transaction.
- [ ] **[Med] The Constellation (people).** Birthdays, last contacted and gift ideas, with reminders in the Horizon.

- [ ] **[Low] The Biosphere (health).** Sleep, workouts, weight and water, entered by hand at first, feeding Orbit trends.
- [ ] **[Low] The Gallery.** place to dump any images/photos/notes/etc.
- [ ] **[Low] The Satellite.** Books, shows and games backlog with ratings.
- [ ] **[Low] Atmosphere: what to wear.** A clothing suggestion from the forecast.
- [ ] [Low] Implement the entire obsidian graph feature directly into the vault (v2)
- [ ] **[Very-Low] Engine: task dependencies.** "Blocked by" another task; blocked tasks are dimmed, skipped by the Home nudge and the Fits today? bar until the blocker is done.
