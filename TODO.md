# Planned Features
- [v0.8.0] banking update - use plaid to connect to banks (store api keys and tokens in secure env variables)

- performance on the archive page is still quite heavy
- selecting mississauga/waterloo displays waterloo after closing the dropdown but displays mississauga in the home screen (weather section)

## Bugs

- [ ] **Daily Focus is dead state.** v0.6.8 removed the Daily Focus card from Home, but `AppContext.tsx` still loads and saves `dailyFocus` (and `setDailyFocus` still ignores the upsert's `error`). Either remove the state and its Supabase read/write, or give it a new home.

## To Test

- [ ] v0.7.5 Migration. Apply `supabase/migrations/0002_task_repeat_kinds.sql`, then add a task with each repeat kind and reload: each keeps its kind, and an old every-N-days task still repeats.
- [ ] v0.7.5 After-completion repeat. Make a task "2 days after done", tick it off on Home: it moves to two days from today with a "Next due" toast instead of disappearing.

- [ ] v0.7.2 Categories. Sign in with the network off (or let the session expire), then reconnect and reload: the Engine's categories stay one of each.
- [ ] v0.7.1 Repeat off. Edit a repeating task, set **Repeat every** to 0, save, and reload the app: the task no longer repeats.
- [ ] v0.7.0 Weather effects. On a rainy, snowy or stormy day the right effect shows (rain streaks, drifting snow, lightning flashes that also light the aurora). Turning **Weather effects** off in Settings removes clouds and precipitation at once, on the page and the Home box.
- [ ] Portal unload end to end. Turn off **Keep loaded** for Discord, set the delay to 5 s, and switch to another app. In Task Manager, Discord's `msedgewebview2` process tree should exit after about 5 s. Reopen Discord: it reloads, still signed in.
- [ ] Race check. With the delay at 1 s, switch away from an app and straight back, repeatedly. The app must never end up blank.

## Ideas

### New features
- [ ] **Task notes and subtasks.** A `notes` text field and a checklist of subtasks on each task. Optionally link a task to a vault note so the details live in Obsidian.
- [ ] **Time-blocking.** Drag a task from the Engine or Tasks page onto a day in The Horizon to create a calendar event for it, with the task linked so completing one updates the other.
- [ ] **Native notifications.** Desktop toasts for task due times, calendar events (10 min before), Pomodoro phase changes and budget alerts. Tauri has `tauri-plugin-notification`; respect a Do Not Disturb toggle in Settings.
- [ ] **Daily note / journal.** Reuse the dead Daily Focus state: a "Today" card on Home that writes into the vault's daily note (`YYYY-MM-DD.md`) with a focus line, mood, and a one-line end-of-day reflection. Would close the Daily Focus bug above.
- [ ] **Weekly review page.** Every Sunday: tasks completed vs. added, Pomodoro focus minutes per day, spending vs. last week, next week's calendar load. Export it as a vault note.
- [ ] **Habit tracker.** Daily check-offs with streaks, shown as a small contribution-style grid. Store in Supabase next to tasks.
- [ ] **Focus stats.** Pomodoro sessions are tracked but not shown over time. Persist them and chart focus minutes per day/week, optionally tagged to the task being worked on.
- [ ] **Data export / backup.** One button in Settings that exports tasks, transactions, categories and settings to JSON/CSV, and an import to restore them. Useful before schema changes like Plaid.
- [ ] **Offline queue.** Queue task and transaction writes while Supabase is unreachable and replay them on reconnect, instead of failing the save.

### Improvements to existing sections
- [ ] **Archive: backlinks and graph.** Show "Linked from" under each note (wikilinks are already parsed) and, later, a small local link graph.
- [ ] **Archive: recent and pinned notes.** A short "recently opened" list and pinned notes at the top of the rail.
- [ ] **Atmosphere: hourly forecast and alerts.** A 24-hour strip (temperature, precipitation chance) and Environment Canada weather warnings shown as a banner, also on the Home weather box.
- [ ] **Atmosphere: cities outside Ontario.** Now that v0.7.4 has a searchable picker, consider all Environment Canada sites, and a "use my location" option.
- [ ] **Portal: notification passthrough.** Turn unread badge increases into native notifications (per-app toggle).
- [ ] **Portal: per-app zoom and mute.** Remember a zoom level per app and a mute toggle for apps that play sounds.
- [ ] **Nebula: cost and usage view.** Token totals are stored in `harness/state.json`; show them per project and per day, with an estimated cost per tier.
- [ ] **Onboarding checklist.** First-run card listing what is not set up yet (vault folder, Google Calendar, NIM key, launch at login) with a button for each.
