# Planned Features
- [v0.8.0] banking update - use plaid to connect to banks (store api keys and tokens in secure env variables)

- [ ] performance on the archive page is still quite heavy

## Bugs

- [ ] **Daily Focus is dead state.** v0.6.8 removed the Daily Focus card from Home, but `AppContext.tsx` still loads and saves `dailyFocus` (and `setDailyFocus` still ignores the upsert's `error`). Either remove the state and its Supabase read/write, or give it a new home.

## To Test

- [ ] v0.7.1 Repeat off. Edit a repeating task, set **Repeat every** to 0, save, and reload the app: the task no longer repeats.
- [ ] v0.7.0 Weather effects. On a rainy, snowy or stormy day the right effect shows (rain streaks, drifting snow, lightning flashes that also light the aurora). Turning **Weather effects** off in Settings removes clouds and precipitation at once, on the page and the Home box.
- [ ] Portal unload end to end. Turn off **Keep loaded** for Discord, set the delay to 5 s, and switch to another app. In Task Manager, Discord's `msedgewebview2` process tree should exit after about 5 s. Reopen Discord: it reloads, still signed in.
- [ ] Race check. With the delay at 1 s, switch away from an app and straight back, repeatedly. The app must never end up blank.