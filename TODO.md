# Planned Features
- [v0.10.0] banking update - use plaid to connect to banks (store api keys and tokens in secure env variables)

- performance on the archive page is still quite heavy

## Bugs

- [ ] **Daily Focus is dead state.** v0.6.8 removed the Daily Focus card from Home, but `AppContext.tsx` still loads and saves `dailyFocus` (and `setDailyFocus` still ignores the upsert's `error`). Either remove the state and its Supabase read/write, or give it a new home.

## To Test

- [ ] v0.8.0 Orbit migration. Run `supabase/migrations/0003_orbit_review.sql` in the SQL Editor, then `npm run verify:rls`: the two new tables must refuse the anon role. Before running it, The Orbit should show the setup banner and still render money, vault and agenda.
- [ ] v0.8.0 Orbit history. Tick a task, untick it, tick it again, and finish (or reset after a minute) a Pomodoro focus run: the Home card's teaser counts one completion and the focus minutes.
- [ ] v0.8.0 Orbit switch. Flip Weekly/Monthly and page back with the arrows, with performance mode off and on: cards fade out and in with no blank flash or flicker afterwards (off), or swap at once (on).
- [ ] v0.8.0 Orbit export. Export a review, then export it again: the second asks before overwriting. Turn on auto-export: the latest ready review is written once and never overwritten. Check both on the web (sidecar) and desktop (native vault).
- [ ] v0.8.0 Orbit ready badge. On a Sunday after 6 PM (or with the clock moved), the Orbit nav icon gets a dot and the Home card a "review ready" chip; opening that review clears them.
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
- [ ] **Daily note / journal.** Reuse the dead Daily Focus state: a "Today" card on Home that writes into the vault's daily note (`YYYY-MM-DD.md`, with the daily tag) with a focus line, mood, and a (optional) one-line end-of-day reflection. Would close the Daily Focus bug above.
- [ ] **Habit tracker.** Daily check-offs with streaks, shown as a small contribution-style grid. Store in Supabase next to tasks.
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

## Before first release (v1.0.0)

### Blockers
- [ ] **Fix the open bugs above.** Daily Focus dead state, the Mississauga/Waterloo weather mismatch, and the heavy Archive page.
- [ ] **Clear the To Test list.** Run every item above on a packaged build (`npm run build:desktop`), not just `npm run dev:desktop`.
- [ ] **Apply all Supabase migrations to the production project.** `0001_auth_and_rls.sql` and `0002_task_repeat_kinds.sql`, then run `npm run verify:rls` against it.
- [ ] **First-run setup without hand-editing files.** The packaged app reads Supabase, vault and Google credentials from `%APPDATA%\com.crystalos.desktop\.env.local`. A fresh install needs a setup screen (or the onboarding checklist idea above) that writes these, plus a clear error when they are missing.
- [ ] **Publish a GitHub release.** The repo has no tags or releases yet, so Settings → Installer has nothing to download. Tag `v1.0.0`, attach the installer, and check the Installer section picks it up as the default.

### Packaging and distribution
- [ ] **Rename the npm package.** `package.json` is still `vite_react_shadcn_ts`; make it `crystal-os`.
- [ ] **Code-sign the Windows installer.** Unsigned builds trigger SmartScreen "unknown publisher" warnings.
- [ ] **Auto-update.** Add `tauri-plugin-updater` (signing key, update endpoint pointing at GitHub releases) or decide the Installer section is the update path.
- [ ] **Bundle targets.** `targets: "all"` builds every format; pick the ones that ship (e.g. NSIS only) to cut build time and size.
- [ ] **Clean-machine install test.** Install on a Windows machine (or VM) with no dev tools: WebView2 present, the `crystal-api` sidecar starts, tray, hotkeys and launch-at-login work, and uninstall leaves nothing behind except user data.
- [ ] **App icons.** Confirm the icons in `src-tauri/icons` are final, not placeholders.

### Integrations
- [ ] **Google OAuth app out of testing mode.** In testing mode refresh tokens expire after 7 days, so The Horizon disconnects weekly. Publish the OAuth consent screen (or document the limit).
- [ ] **Review the CSP.** `connect-src` lists the sidecar, Supabase and weather.gc.ca; confirm Nebula (NIM, OmniRoute) and Portal traffic still works in the packaged build with it.

### Quality
- [ ] **CI.** There is no `.github/workflows`. Add one that runs `npm run lint`, `npm test`, `tsc`, and `cargo check` on every PR, and builds the installer on tags.
- [ ] **Run the E2E smoke test** (`npm run test:e2e`) against the release build with the dedicated test user.
- [ ] **Dependency audit.** `npm audit` and `cargo audit`; drop unused shadcn/Radix packages from the template.

### Docs
- [ ] **README install section** for end users (download, first-run setup, where settings and logs live), separate from the developer setup.
- [ ] **Refresh badges and version.** Run `npm run badges` (the tests badge says 479; the suite is now 482) and bump `package.json`, `Cargo.toml` and `tauri.conf.json` to 1.0.0 together.
- [ ] **CHANGELOG 1.0.0 entry** summarising what ships.
- [ ] **Privacy note.** What is stored where: Supabase (tasks, transactions), local disk (vault, `.env.local`, Portal sessions, `diagnostics.log`), and what Nebula sends to model providers.
