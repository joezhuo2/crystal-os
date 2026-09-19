# Planned Features
- [v0.7.0] banking update - use plaid to connect to banks (store api keys and tokens in secure env variables)

## Bugs

- [ ] **A task's repeat cannot be turned off.** Setting "Repeat every" back to 0 on an existing task sends `repeatDays: undefined` (`TasksPage.tsx:145`), and `updateTask` skips undefined fields (`AppContext.tsx`), so `repeat_days` is never cleared in Supabase. The UI shows it cleared until the next reload, then the repeat comes back. Fix: send `null` when the field is 0 and write `repeat_days = null` for it.
- [ ] **Negative repeat intervals are accepted.** `min={0}` only limits the spinner; typing `-3` stores `-3`. `occursOn` then treats the task as non-repeating, but `isOverdue` (`HomePage.tsx:327`) treats `-3` as repeating, so the task is never shown as overdue. Fix: clamp to `Math.max(0, …)` on input.
- [ ] **Daily Focus fails silently.** `setDailyFocus` ignores the upsert's `error` (`AppContext.tsx`), unlike every other write, which goes through `reportError`. A rejected write shows the new focus until reload, then reverts.

## Potential Issues (To Test)

- [ ] Portal unload end to end. Turn off **Keep loaded** for Discord, set the delay to 5 s, and switch to another app. In Task Manager, Discord's `msedgewebview2` process tree should exit after about 5 s. Reopen Discord: it reloads, still signed in.
- [ ] Race check. With the delay at 1 s, switch away from an app and straight back, repeatedly. The app must never end up blank.
- [ ] Tray hide. Hide to the tray while the Nebula tab is open; CPU for the Crystal OS main webview should drop to about 0%. Show the window again: the animation resumes.
