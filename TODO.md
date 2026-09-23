# Planned Features
- [v0.8.0] banking update - use plaid to connect to banks (store api keys and tokens in secure env variables)

## Bugs

- [ ] **A task's repeat cannot be turned off.** Setting "Repeat every" back to 0 on an existing task sends `repeatDays: undefined` (`TasksPage.tsx:145`), and `updateTask` skips undefined fields (`AppContext.tsx`), so `repeat_days` is never cleared in Supabase. The UI shows it cleared until the next reload, then the repeat comes back. Fix: send `null` when the field is 0 and write `repeat_days = null` for it.
- [ ] **Negative repeat intervals are accepted.** `min={0}` only limits the spinner; typing `-3` stores `-3`. `occursOn` then treats the task as non-repeating, but `isOverdue` (`HomePage.tsx:359`) treats `-3` as repeating, so the task is never shown as overdue. Fix: clamp to `Math.max(0, …)` on input.
- [ ] **Daily Focus is dead state.** v0.6.8 removed the Daily Focus card from Home, but `AppContext.tsx` still loads and saves `dailyFocus` (and `setDailyFocus` still ignores the upsert's `error`). Either remove the state and its Supabase read/write, or give it a new home.

## Potential Issues (To Test)

- [ ] v0.6.8 Home grid. At desktop width the grid is 3×3: clock, weather, Vault / Engine, Horizon, Archive / Nebula, Portal, Terminal. Every card opens its page; clicking a note, a tag chip, quick add, add task, or complete task does only its own action.

- [ ] Portal unload end to end. Turn off **Keep loaded** for Discord, set the delay to 5 s, and switch to another app. In Task Manager, Discord's `msedgewebview2` process tree should exit after about 5 s. Reopen Discord: it reloads, still signed in.
- [ ] Race check. With the delay at 1 s, switch away from an app and straight back, repeatedly. The app must never end up blank.
- [ ] Tray hide. Hide to the tray while the Nebula tab is open; CPU for the Crystal OS main webview should drop to about 0%. Show the window again: the animation resumes.
- [ ] some tooltip boxes have a corner drawn under widgets in the home screen (right corner of add task hover text is covered by today on the horizon box)
- [ ] entering the vault section only creates a loading animation for the spending breakdown, and then the other 2 graphs just load in instantly
- [ ] upcoming tasks are sorted alphabetically? when they should be sorted in priority (highest first) and then date (earliest upcoming first)
- [ ] the archive should have a themed home box widget
- [ ] theme the atmosphere + its home screen widget