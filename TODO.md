# Planned Features
- [v0.8.0] banking update - use plaid to connect to banks (store api keys and tokens in secure env variables)

- [ ] archive crystals still do not have visible sparkles, and are also quite performance heavy

## Bugs

- [ ] **A task's repeat cannot be turned off.** Setting "Repeat every" back to 0 on an existing task sends `repeatDays: undefined` (`TasksPage.tsx:145`), and `updateTask` skips undefined fields (`AppContext.tsx`), so `repeat_days` is never cleared in Supabase. The UI shows it cleared until the next reload, then the repeat comes back. Fix: send `null` when the field is 0 and write `repeat_days = null` for it.
- [ ] **Negative repeat intervals are accepted.** `min={0}` only limits the spinner; typing `-3` stores `-3`. `occursOn` then treats the task as non-repeating, but `isOverdue` (`HomePage.tsx:351`) treats `-3` as repeating, so the task is never shown as overdue. Fix: clamp to `Math.max(0, …)` on input.
- [ ] **Daily Focus is dead state.** v0.6.8 removed the Daily Focus card from Home, but `AppContext.tsx` still loads and saves `dailyFocus` (and `setDailyFocus` still ignores the upsert's `error`). Either remove the state and its Supabase read/write, or give it a new home.

## To Test

- [ ] v0.7.0 Weather effects. On a rainy, snowy or stormy day the right effect shows (rain streaks, drifting snow, lightning flashes that also light the aurora). Turning **Weather effects** off in Settings removes clouds and precipitation at once, on the page and the Home box.
- [ ] Portal unload end to end. Turn off **Keep loaded** for Discord, set the delay to 5 s, and switch to another app. In Task Manager, Discord's `msedgewebview2` process tree should exit after about 5 s. Reopen Discord: it reloads, still signed in.
- [ ] Race check. With the delay at 1 s, switch away from an app and straight back, repeatedly. The app must never end up blank.