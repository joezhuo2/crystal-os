# Planned Features
- [v0.9.0] vault/banking overhaul - use plaid to connect to banks (store api keys and tokens in secure env variables), themed glassmorphism UI 

- performance on the archive page is still heavy
- expanding/minimizing the side navbar/switching between sections is very performance heavy on non-performance mode

- redo portal ui (change to glassmorphism with some background)
- glassmorphism ui to all home page widget cards (except terminal)

## To Test

- [ ] v0.8.4 Sidebar. Hover the sidebar on and off, on a few pages including the Terminal: the icons stay put while the header changes.
- [ ] v0.8.4 Categories dialog. Open and close **Categories** on the Engine and on Financials: the card fades in and out blurred, with no flash.
- [ ] v0.8.4 Hover cards. Hover chart bars, deltas, agenda rows and paths in The Orbit; events in the Horizon's week and day views; the toolbar, sidebar, token table and Stop button in The Nebula. Each shows the page's glass card, never the plain browser box.

- [ ] v0.7.5 After-completion repeat. Make a task "2 days after done", tick it off on Home: it moves to two days from today with a "Next due" toast instead of disappearing.
- [ ] v0.7.2 Categories. Sign in with the network off (or let the session expire), then reconnect and reload: the Engine's categories stay one of each.
- [ ] v0.7.1 Repeat off. Edit a repeating task, set **Repeat every** to 0, save, and reload the app: the task no longer repeats.
- [ ] Portal unload end to end. Turn off **Keep loaded** for Discord, set the delay to 5 s, and switch to another app. In Task Manager, Discord's `msedgewebview2` process tree should exit after about 5 s. Reopen Discord: it reloads, still signed in.
- [ ] Race check. With the delay at 1 s, switch away from an app and straight back, repeatedly. The app must never end up blank.

## Ideas

### New features
- [ ] **Task notes and subtasks.** A `notes` text field and a checklist of subtasks on each task. Optionally link a task to a vault note so the details live in Obsidian.
- [ ] **Time-blocking.** Drag a task from the Engine or Tasks page onto a day in The Horizon to create a calendar event for it, with the task linked so completing one updates the other.
- [ ] **Native notifications.** Desktop toasts for task due times, calendar events (10 min before), Pomodoro phase changes and budget alerts. Tauri has `tauri-plugin-notification`; respect a Do Not Disturb toggle in Settings.
- [ ] **Habit tracker.** Daily check-offs with streaks, shown as a small contribution-style grid. Store in Supabase next to tasks.
- [ ] **Data export / backup.** One button in Settings that exports tasks, transactions, categories and settings to JSON/CSV, and an import to restore them. Useful before schema changes like Plaid.
- [ ] **Offline queue.** Queue task and transaction writes while Supabase is unreachable and replay them on reconnect, instead of failing the save.

### Improvements to existing sections
- [ ] **Archive: backlinks and graph.** Show "Linked from" under each note (wikilinks are already parsed) and, later, a small local link graph.
- [ ] **Archive: recent and pinned notes.** A short "recently opened" list and pinned notes at the top of the rail.
- [ ] **Atmosphere: hourly forecast and alerts.** A 24-hour strip (temperature, precipitation chance) and Environment Canada weather warnings shown as a banner, also on the Home weather box.
- [ ] **Atmosphere: use my location.** add a "use my location" option to weather city selection.
- [ ] **Portal: notification passthrough.** Turn unread badge increases into native notifications (per-app toggle).
- [ ] **Portal: per-app zoom and mute.** Remember a zoom level per app and a mute toggle for apps that play sounds.
- [ ] **Nebula: cost and usage view.** Token totals are stored in `harness/state.json`; show them per project and per day, with an estimated cost per tier.
- [ ] **Onboarding checklist.** First-run card listing what is not set up yet (vault folder, Google Calendar, NIM key, launch at login) with a button for each.

## Before first release (v1.0.0)

### Blockers
- [ ] **First-run setup without hand-editing files.** The packaged app reads Supabase, vault and Google credentials from `%APPDATA%\com.crystalos.desktop\.env.local`. A fresh install needs a setup screen (or the onboarding checklist idea above) that writes these, plus a clear error when they are missing.
- [ ] **Publish a GitHub release.** The repo has no tags or releases yet, so Settings → Installer has nothing to download or update to. Build with `npm run build:release`, tag `v1.0.0`, attach the installer and `latest.json`, and check the Installer section picks it up as the default.

### Packaging and distribution
- [ ] **Code-signing certificate.** Get an OV certificate (or Azure Trusted Signing), then set `CRYSTAL_SIGN_THUMBPRINT` locally, or the `CRYSTAL_SIGN_PFX_BASE64`/`CRYSTAL_SIGN_PFX_PASSWORD` secrets for the release workflow.
- [ ] **Breaking dependency upgrades** left by the v0.8.3 audit: `react-router-dom` 7, `vite` 8, `vitest` 5, `tailwindcss` 4.
- [ ] **Clean-machine install test.** Install on a Windows machine (or VM) with no dev tools: WebView2 present, the `crystal-api` sidecar starts, tray, hotkeys and launch-at-login work, and uninstall leaves nothing behind except user data.

### Integrations
- [ ] **Google OAuth app out of testing mode.** In testing mode refresh tokens expire after 7 days, so The Horizon disconnects weekly. Publish the OAuth consent screen (or document the limit).
- [ ] **Review the CSP.** `connect-src` lists the sidecar, Supabase and weather.gc.ca; confirm Nebula (NIM, OmniRoute) and Portal traffic still works in the packaged build with it.

### Docs
- [ ] **CHANGELOG 1.0.0 entry** summarising what ships.
