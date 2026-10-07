# Changelog

All notable changes to Crystal OS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.9.4] - 2026-10-07 - Snooze tasks, and a Someday bucket.

### Added

- **Snooze button on Engine cards.** An alarm clock icon on each open, top-level task, to the right of the expand/collapse chevron and left of edit and delete. It opens a themed popover with **Tomorrow**, **This weekend** (the coming Saturday, or next week's when today is a Saturday or Sunday), **Next week** (the coming Monday), **Next month** (the same day, clamped to the end of a shorter month), **Pick a date…** (a calendar from tomorrow onward) and **Someday** (no date). Each preset shows the date it picks.
- **Snoozed tasks are hidden, not rescheduled.** A snoozed task keeps its own start and end dates and stays out of sight until the start of the snooze day on the device clock, or indefinitely for Someday. While hidden it is left out of The Engine's List and Board, Home's Engine card and its nudges, the **Fits today?** bar, and due-time notifications. It has no overdue state while snoozed; when it wakes it returns as normal, overdue if its due date has already passed.
- **A collapsed Snoozed section** at the bottom of both List and Board, headed "Snoozed (n)". It opens and closes on the same 200 ms ease as card expansion. Dated snoozes come first, soonest first, followed by a **Someday** group. Snoozed cards show an "Until Mon, Oct 12" or "Someday" chip (click it to change the snooze) and an **Unsnooze** button where the snooze button was.
- **Tasks wake on their own.** Today's date updates at local midnight and when the window regains focus (`useToday` in `src/hooks/useToday.ts`), so a task that wakes overnight is back on the list without a reload.
- **Snooze from the command bar.** Searching for a task offers **Snooze "…"…**, then the presets and Someday (no date picker here), or **Unsnooze "…"** when it is already snoozed.
- `supabase/migrations/0007_task_snooze.sql`, `src/lib/snooze.ts` (unit-tested) and `src/components/views/TaskSnooze.tsx`.

### Changed

- **Child tasks follow their parent.** A child cannot be snoozed on its own; it is hidden and shown exactly when its parent is.
- **Completed tasks cannot be snoozed**, and completing a snoozed task clears its snooze. So does an "after completion" repeat moving on to its next date.
- **The command bar's task group is now "Task actions"**, renamed from "Subtasks" since it holds snoozing as well.
- **`Task` carries optional `snoozedUntil` and `someday`.** `updateTask` clears them when the keys are present and undefined, and, like `estimateMinutes`, only sends the columns for tasks that are or were snoozed, so a database without migration 0007 still saves everything else. `todaysOpenTasks` in `src/lib/capacity.ts` and `taskDueAlerts` in `src/lib/notifications.ts` skip snoozed tasks.
- **`Popup`, `usePopupPosition` and `useDismiss` are exported from `src/components/ui/field-controls.tsx`**, so the snooze popover shares the form pickers' look. `usePopupPosition` takes an optional `remeasureKey`.
- **`TODO.md`:** *Snooze / defer tasks* is done and removed.

### Notes

- **Apply `supabase/migrations/0007_task_snooze.sql`** in the Supabase SQL Editor. It adds `tasks.snoozed_until` (a date) and `tasks.someday` (boolean, not null, default false), and is safe to run twice. Until it is applied, snoozing a task fails; the app only sends these columns for tasks that are or were snoozed, so everything else saves as before.
- Tests: `src/lib/snooze.test.ts`, `src/components/views/TasksSnooze.test.tsx`, and snooze cases in `capacity.test.ts` and `notifications.test.ts`.

## [v0.9.3] - 2026-10-05 - Notes and subtasks on tasks.

### Added

- **Notes on tasks.** The task form has a **Notes** box for free text (up to 10,000 characters). Cards with notes show a note icon, and an expanded card shows the notes in full.
- **Checklists.** Each task can carry a checklist. In the task form and on an expanded card: type in **Add checklist item** and press Enter, tick an item, click its text to rename it, drag its grip to reorder, or delete it with the X. Stored on the task as JSON.
- **Child tasks.** Any task can be nested under another, one level deep (a child cannot have children, and a task with children cannot be nested). Three ways in: the **Subtask of** picker in the task form, dragging a card onto another card in List or Board (the card that would take it lights up), or searching for the task in the command bar and choosing **Make "…" a subtask of…**, then the parent. Three ways out: **Subtask of → None**, the move-to-top-level button on the child's row, or dragging it out of its parent onto the list or a Board column (also **Move "…" to top level** in the command bar).
- **Subtask count on cards.** "+3 subtasks" counts open checklist items and open child tasks together, and turns green as "All 4 done" once none are open. Shown in The Engine's List and Board and on Home's Engine card.
- **Expandable cards.** Click a task's name or its chevron in The Engine to show its notes, checklist and child tasks inline. Child tasks can be ticked, edited and moved to the top level from there. The details slide open and closed on a 200 ms ease with no spring, and the cards below glide along on the same ease (the card animates its position only, so its content never stretches).
- `supabase/migrations/0006_task_notes_subtasks.sql`, `src/lib/subtasks.ts` (unit-tested) and `src/components/views/TaskSubtasks.tsx`.

### Changed

- **Child tasks show inside their parent only.** The Engine's List and Board and Home's Engine card (today's tasks, upcoming tasks and the nudges) list top-level tasks; the **Fits today?** bar still counts every task's own estimate on its own date, children included, with no rollup.
- **Completing a parent completes its subtasks.** It ticks the checklist and completes each open child task (which records them in The Orbit). The parent never completes itself when its last subtask is done. A repeat that moves on when done starts its checklist over, unticked.
- **Deleting a parent keeps its children**, moved back to the top level (`on delete set null`).
- **`Task` carries optional `notes`, `checklist` and `parentId`.** `updateTask` clears each when its key is present and undefined, and, like `estimateMinutes`, never sends a column a task has never used, so a database without migration 0006 still saves everything else.
- **The task form scrolls** when it is taller than the window.
- **`TODO.md`:** *Task notes and subtasks* is done and removed.

## [v0.9.2] - 2026-10-05 - A next step once today is done.

### Added

- **Home's Engine card nudges toward upcoming tasks once today is clear.** When every task for today is done (or none was due), the card keeps its free-time bar and the line under it offers the first upcoming task that fits the free time, in the card's own upcoming order: highest priority first, then earliest date. Like the nudge for today's tasks, it takes the first task whose estimate fits, or else the first without an estimate, and shows nothing once the day's free time is gone. Four wordings, picked by the task, the day and the hour ("Today's clear. Get a head start on Taxes?", "All done for today. Taxes is up on Thu.", "3h free and nothing due. Start on Taxes early?", and for estimated tasks "Today's done. Taxes (1h) would fit now."). `suggestUpcomingTask` in `src/lib/capacity.ts`, unit-tested.

## [v0.9.1] - 2026-10-05 - Time estimates, and whether today's work fits the day.

### Added

- **Time estimates on tasks.** The task form has an **Estimate** row: chips for 15m, 30m, 1h, 2h and 4h (tap the lit one again to clear it) and a minutes box for anything else, from 1 to 1440. An estimate is effort, not scheduling: start and end still say when a task is due. Stored in the new `tasks.estimate_minutes` column.
- **Fits today? on The Engine.** A card at the top of the task list weighs today's planned work against today's free time (`todayCapacity` in `src/lib/capacity.ts`, fed by `useTodayCapacity`).
  - Planned: the estimates of today's open tasks, repeats included; overdue tasks are left out. Tasks without an estimate add nothing and are counted instead ("2 tasks without an estimate").
  - Free: the work window from now until it ends, minus the timed events in the Google calendar picked in The Horizon. Overlapping events count once, events crossing midnight are clipped to today, and all-day events are ignored. Without a connected calendar, free time is the window alone and the card says so.
  - The verdict reads "Fits · 1h 20m spare", "Just fits" or "Over by 45m". The bar is green while the work fits, amber past 85% of free time, and red once it is over, with the part that does not fit striped. It updates every minute on the device clock.
- **Estimates on task cards.** Each task in The Engine's list and board shows its estimate after the priority, repeat and category ("Med Learning 3h", with a clock icon). Tasks without one show nothing extra.
- **Free time on Home's Engine card**, under the open-task count while today has open tasks. The bar is what is left of the work day: the pale part is free time (events take the rest) and today's planned work sits over it in green, amber or red. Under it, "3h 50m free · 2h 30m planned · Fits · 1h 20m spare · 1 unestimated", then a nudge toward the next task: the most pressing open task whose estimate fits the free time, or else the first without an estimate. The nudge has six wordings ("Want to start Write report?", "3h 50m free. How about Write report?", "Next up: Write report. Ready when you are.", "Good moment to knock out Write report.", and for estimated tasks "Write report takes about 1h. It fits, want to start?" and "You have time for Write report (1h). Go?"), picked by the task, the day and the hour, so it holds for an hour and changes through the day. No nudge once the day's free time is gone (`suggestNextTask` in `src/lib/capacity.ts`).
- **Settings → The Engine.** **Work day starts** and **Work day ends** (9 AM and 5 PM by default, quarter-hour steps), saved per device in `localStorage` (`crystal-os-capacity`). A window that does not end after it starts is refused with a toast.
- `supabase/migrations/0005_task_estimates.sql`, `src/lib/capacity.ts` and `src/lib/capacitySettings.ts` (both unit-tested), `src/hooks/useTodayCapacity.ts` and `src/components/views/CapacityBar.tsx`.

### Changed

- **`Task` carries an optional `estimateMinutes`.** `updateTask` clears it when the key is present and undefined, as it does for `repeat`.
- **`TODO.md`:** *Engine: time estimates and capacity* is done and removed.

### Fixed

- **The Categories dialog flickered again on desktop** (The Engine and The Vault). The card scaled in on Motion's default spring, which overshoots, and when it settled Motion reset the transform, so WebView2 dropped the card's compositor layer and re-rasterised its blur in a visible flash. It now runs the same short 180 ms tween as the Horizon day panel and keeps its layer (`will-change`), in `CategoryManager.tsx`.

### Notes

- **Apply `supabase/migrations/0005_task_estimates.sql`** in the Supabase SQL Editor. It is safe to run twice. Until it is applied, saving a task with an estimate fails; the app only sends `estimate_minutes` for tasks that have one, so everything else saves as before.
- The capacity bar reuses the Home Horizon card's cached query for today's events, so it adds no calendar requests. On desktop it only asks for calendar status once the calendar has been connected, as the Horizon card does, so it never starts the sidecar on its own.

## [v0.9.0] - 2026-10-04 - Daily Rhythm (Release Summary)

*This release rounds out The Atmosphere: the Air Quality Health Index from the nearest Environment Canada station, the UV index with advice, and a daylight bar that says how much of the day is left and how fast the days are changing.*

It also caps the development arc from `v0.8.0` through `v0.8.14`. Over that period Crystal OS gained a place to look back (The Orbit's weekly and monthly reviews, a Today card and a habit tracker), ways to reach you outside the window (native notifications and weather nudges), saves that survive a lost connection, a release pipeline with in-place updates, and several passes that took work out of startup, re-renders and background loops.

### Highlights

- **The Orbit (`v0.8.0`, `v0.8.1`, `v0.8.10`)** — weekly and monthly reviews of tasks, focus, money, notes and trends with a vault export, a Today card that writes focus, mood and a reflection into the daily note, and habits with streaks, a day grid and their own review card
- **Reminders and nudges (`v0.8.13`, `v0.8.14`)** — desktop toasts for task due times, calendar events, Pomodoro phases and new Portal messages, with Settings → Notifications and Do Not Disturb; a one-line weather nudge on Home for rain, snow, ice, cold and heat
- **Weather that knows where you are (`v0.8.11`, `v0.9.0`)** — **Use my location** in the city picker, then air quality, UV and daylight on The Atmosphere
- **Offline queue (`v0.8.12`)** — task and transaction changes made without a connection are kept on the device and replayed in order, with ids made on the device so offline rows can be edited before they reach the server
- **Shipping it (`v0.8.2`, `v0.8.3`, `v0.8.5`)** — **Check for updates** in Settings with signed in-place installs, `npm run build:release`, CI and a tag-driven release workflow, `docs/PRIVACY.md`, and a cleared-down dependency tree
- **Performance (`v0.8.4`–`v0.8.9`)** — the sidebar expands over the page, backdrops stay mounted between tabs, capped animation loops sleep between frames, a faster Archive, UI state out of `AppContext`, a startup bundle down from 1,197 KB to 807 KB, plain-SVG Financials charts, and a sidecar that starts on first use
- **Air, UV and daylight (`v0.9.0`)** — detailed below

### Added

- **Air Quality card on The Atmosphere.** The Air Quality Health Index from the Environment Canada AQHI station nearest the chosen city (`useAirQuality` in `src/hooks/useAirQuality.ts`), refreshed every 20 minutes.
  - Reading: the latest hourly value as a whole number (10+ above 10), its risk band in colour (1–3 low, 4–6 moderate, 7–10 high, above 10 very high) and the advice for the general public, over a ten-step scale.
  - Forecast: the highest hour of the station's newest forecast run in the next 24 hours ("Next 24 h: up to 3 (low risk) around 10 PM"). Older runs are ignored, and a station with no forecast still shows its reading.
  - Source: the station's name, its distance and the time it was measured. Stations are found with one `aqhi-observations-realtime` request (`latest=true`, a box around the city's point); only one within 75 km counts, so small and northern locations say there is no station nearby instead of borrowing a far city's air.
- **UV Index card.** The forecast's UV index for the next daytime period ("Today's max", or tomorrow's after dark, since night periods have none) with its band (0–2 low, 3–5 moderate, 6–7 high, 8–10 very high, 11+ extreme) and advice, the current hour's value when the hourly forecast has one, and the hour it peaks (`uvOutlook` in `src/lib/airQuality.ts`).
- **Daylight bar in Sun & Moon.** By day, how much daylight is left and how far through the day it is; by night, the time to sunrise and how far through the night (`daylightState` in `src/lib/daylight.ts`). Beside it, how much longer or shorter today is than yesterday ("2m 59s shorter than yesterday"), from the city's point and the sunrise equation (`dayLengthChangeSeconds`), so it needs no extra request. It updates every minute on the device clock.
- `src/lib/airQuality.ts` (AQHI and UV bands, nearest station, forecast run and peak, UV outlook) and `src/lib/daylight.ts`, both unit-tested, and `src/components/views/weather/AirSunCards.tsx` for the three new pieces.

### Changed

- **The Atmosphere's detail cards are a 2 × 2 grid:** Air Quality, UV Index, Sun & Moon, Wind Details.
- **`WeatherData` carries the city's `lat` and `lon`** (null if the feed has no point), and each `ForecastPeriod` a numeric `uvIndex` beside the existing `uv` text. `parseWeatherData` is exported for tests.
- **Dependencies:** `tauri` 2.11.3 → 2.12.1, `@tauri-apps/api` 2.11.1 → 2.12.1, `tauri-build` 2.6.3 → 2.7.1, `tauri-plugin-notification` pinned to 2.5.1, and the WebView2 bindings `webview2-com` 0.38 → 0.39 and `windows` 0.61 → 0.62 to match wry.
- **`TODO.md`:** *Atmosphere: AQHI, UV, sunrise / sunset* is done and removed. v0.10.0 is now the Engine update (time estimates, notes and subtasks, snooze, Pomodoro per task), and the Vault and Plaid overhaul moves to v0.11.0.

### Notes

- The CSP needs no change: air quality comes from `api.weather.gc.ca`, which `connect-src` already allows. `docs/PRIVACY.md` lists what the AQHI requests send.
- Budget alerts, mentioned under v0.8.14 as coming in v0.9.0, now come with **Vault: budgets** in v0.11.0.

## [v0.8.14] - 2026-10-04

Reminders that reach you outside the window.

### Added

- **Native notifications.** Desktop toasts (through `tauri-plugin-notification`; the browser's Notification API on the web) when an open task reaches its end time, including each repeat; before each timed event in the Google calendar picked in The Horizon (30 minutes by default); when a Pomodoro focus session or break runs out; and when a Portal app's unread count goes up while Crystal OS is not focused. Task due times are still announced up to 10 minutes late, and an event reminder still shows if the app opens inside its window, with the time actually left. Each reminder is shown once, even across a restart. The planning lives in `src/lib/notifications.ts`; `NotificationScheduler` checks tasks and events every 30 seconds while signed in, and fetches the next 50 hours of events every 10 minutes, window hidden or not.
- **Settings → Notifications.** A switch for task due times, calendar reminders, Pomodoro and Portal messages, the minutes before an event to remind (0 to 1440), a **Do Not Disturb** switch that silences everything without changing the others, and **Send test**.
- **Portal: Notify on new messages.** A per-app switch in each pill's right-click menu, on by default. The unread count an app opens with sets its baseline and is not announced.

### Fixed

- **Hourly forecast boxes respond to the pointer.** Each hour on The Atmosphere now highlights on hover and keyboard focus, and shows a tooltip with the condition, temperature, feels-like, chance of precipitation, wind direction and speed, and UV when known.

### Notes

- Budget alerts are not included: there are no budgets yet. They will come with **Vault: budgets** in v0.9.0.

## [v0.8.13] - 2026-10-04

Weather that tells you what to do about it.

### Added

- **Weather nudges on The Pulse.** The Home weather box gains a third line, under the condition and city, when the hourly forecast is worth acting on: rain, snow, freezing rain or thunderstorms starting within 12 hours ("Rain from 4 PM, take an umbrella", "Freezing rain from 9 PM, roads may be icy"), or when rain already falling will stop ("Rain until 6 PM"); a windchill or temperature of −20 °C or below within 24 hours ("−23 °C windchill tomorrow morning"); or 30 °C or above ("Up to 33 °C this afternoon, drink water"). "Chance of …" hours count from 40%. Freezing rain and thunderstorms win over cold, cold over rain or snow, and those over heat; when nothing applies the line is not shown. The rules live in `src/lib/weatherNudge.ts`.

### Changed

- **Bigger weather icon on Home.** The condition icon in the Home weather box goes from 24 px to 32 px, and its loading skeleton grows to match.

## [v0.8.12] - 2026-10-04

Saves that wait out a lost connection.

### Added

- **Offline queue for tasks and transactions.** Adding, editing, completing or deleting a task or transaction while Supabase can't be reached no longer fails the save. The change shows up at once and is kept on this device (in `localStorage`, per account) with a "Saved on this device" notice, then replayed in order when the browser comes back online, every 30 s while anything is waiting, and on the next sign-in or app start. "Synced N offline changes" confirms the replay. A write the server rejects during replay is reported and dropped; the rest still go through. Ticking a task off offline also queues its Orbit history row, and unticking it before it is sent simply drops that row. A write is queued when there is no network, when the request gets no answer, or on a 401, 408, 429, 502, 503 or 504; other errors are reported as before.

### Changed

- **Task, transaction and completion ids are made on the device.** Inserts send a `crypto.randomUUID()` id (and tasks their `created_at`, completions their `completed_at`) instead of reading the row back, so a row added offline keeps the same id once it reaches the server and can be edited or deleted before then. Replaying an insert that had already landed (duplicate key) counts as sent. While anything is queued, new writes queue behind it, so an edit never reaches the server before the row it edits. Queued edits are laid over a fresh load, so they stay on screen until they are sent. The queue logic is in `src/lib/offlineQueue.ts`.

## [v0.8.11] - 2026-10-04

Pick the weather city from where you are.

### Added

- **Use my location in the city picker.** The weather city picker has a **Use my location** row above the list. It asks the system for a rough position (Windows Location on desktop, the browser's permission prompt on the web) and switches to the nearest Environment Canada city page location, which the Home box and the Living Sky follow as with any other pick. While it looks, the row says "Finding your location…". If location access is off, the request takes over 15 s, or no location is within 100 km (outside Canada, say), the row explains why and the city stays as it was. The position is used once and is never stored or sent; only the chosen location's id is saved, as before.

### Changed

- **The city list now carries each location's coordinates.** It is fetched with its points (about 150 KB instead of 118 KB, still once per session) so the nearest location can be found without another request. `ThemedCombobox` takes an optional `header` rendered between the search box and the list.

## [v0.8.10] - 2026-10-04

A habit tracker in The Orbit.

### Added

- **Habits in the Today card.** Below the focus, mood and reflection form, each habit is a chip with its colour; tapping it ticks it off for today (only today can be changed) and saves at once, putting the tick back if the save fails. Hovering a chip shows its streak. Streaks count consecutive days, and today stays open until it ends: an unticked today keeps yesterday's streak instead of dropping to 0.
- **A day grid that follows the Weekly/Monthly switch.** Weekly shows this week as seven cells, Monday first; Monthly shows this month as a calendar. Each day is lit in the Orbit's ice and mauve by the share of that day's habits done, with the count inside. Hovering a day shows the date, `done/total`, and the first three habits done with their colours, then **+N more**. Today is outlined and days still to come are dashed. A day's total only counts habits that existed then.
- **The habit manager.** The gear in the Habits header opens an Orbit-glass dialog to add a habit (up to 40 characters), rename one in place, change its colour (nine presets from the Orbit palette, or any hex), drag it by the grip to reorder (or use the arrow keys on the grip), and remove it. Removing archives the habit after a confirmation: it leaves the Today card, and its check-offs still count in reviews of the periods it was tracked in.
- **A Habits card in weekly and monthly reviews.** Each habit active in the period, in manager order: days done out of the days it was active (up to today for a period still running), the rate as a bar in its colour, the longest streak inside the period, and the streak on the period's last day (or today). The card shows the overall share of habit days done, and has an optional **Habit note** for finished periods. It is left out when no habit was active.
- **Habit completion in Trends**, against the last period and the 4-week or 3-month average, when there are habits.
- **Habits in the exported review.** A `habits_completion` frontmatter field and a `## Habits` section with a table per habit and the note under `### Note`. Auto-export writes the section without a note.

### Database

- **Run [`supabase/migrations/0004_habits.sql`](supabase/migrations/0004_habits.sql)** in the Supabase SQL Editor. It adds `habits` (name, colour, position, `archived_at`) and `habit_checks` (one row per habit per local day, unique on `habit_id, day`), with indexes and the usual own-rows RLS; a check can only point at one of your own habits. It is safe to run twice. Until it is applied the Today card says so and reviews leave habits out; everything else works.

## [v0.8.9] - 2026-10-04

A smaller startup bundle, less work at launch, and no sidecar until something needs it.

### Changed

- **The startup JavaScript is down from 1,197 KB to 807 KB (371 KB to 255 KB gzipped).** The Nebula, Portal and Terminal pages are lazy chunks like every other view (`src/lib/viewLoader.ts`), which takes `react-markdown`, `remark-gfm` and the chat UI out of the entry chunk. Their background work stays eager: the harness, Portal and terminal stores are still imported by `Index.tsx`, and the shells and agents run in Rust. React (with the router) and Supabase are split into `react` and `supabase` vendor chunks (`build.rollupOptions.output.manualChunks`), preloaded beside the entry chunk, so their file names only change when the dependency does.
- **framer-motion loads its animation code after the first render.** Components use the slim `m` component, and `App.tsx` wraps the app in `<LazyMotion>` with the `domMax` features in their own chunk (`src/lib/motionFeatures.ts`, about 82 KB). `domMax` rather than `domAnimation`, because the nav indicator, the transaction list and the Home grid use layout animations. framer-motion has no vendor chunk of its own: one would have pulled those features back into startup.
- **Only the views you use are fetched ahead.** `preloadViews()` fetched every view chunk about 2 s after start, Financials and its charts included. Each opened tab is now counted (`crystal-os:tab-visits` in `localStorage`), and after startup the three most visited views are fetched one at a time, at the first idle moment 1.5 s after Home has mounted. A fresh install fetches the Engine and the Horizon. Performance mode still fetches nothing ahead.
- **The Financials charts are plain SVG.** Recharts was 400 KB of the 419 KB Financials chunk, for three charts. The cash flow areas, spending donut and savings line are now drawn by `src/components/views/financials/FinanceCharts.tsx`, from scales, round axis ticks, monotone curves and donut arcs in `src/lib/chartGeometry.ts`; the chunk is 15 KB. They keep the same colours, hover tooltips and 900 ms entrance (a CSS wipe and sweep, skipped in performance mode and with reduced motion), and each chart now has a text alternative for screen readers. The donut starts at twelve o'clock and runs clockwise. `recharts` is removed from the dependencies.
- **The desktop sidecar starts on the first `/api/*` request instead of at launch.** The 93 MB `crystal-api` executable started with the app even though the desktop vault is read natively and only the calendar uses it. `apiRequest` now calls the new `sidecar_ensure` command (`src-tauri/src/sidecar.rs`) first, which starts the sidecar if it is not running and returns once its port accepts connections (or fails after 15 s with a 503 the view shows). A request that cannot connect makes the next one check again, so a sidecar that exited is restarted. The Home calendar card only asks for the calendar's status once the calendar has been connected (remembered as `crystal-os:calendar-connected`), so a session that never opens the Horizon never starts the sidecar. `dev:desktop` and the web app are unchanged.

## [v0.8.8] - 2026-10-04

Fewer re-renders from global state.

### Changed

- **`AppContext` no longer holds UI state.** Tasks, transactions, categories and the transient UI flags (`quickAddDraft`, `showQuickAdd`, `showTaskForm`, `selectedNotePath`, …) shared one context value, so typing in the palette or opening a form re-rendered all 20 `useApp()` consumers, including the whole current view. The UI flags now live in a `useSyncExternalStore` store (`src/lib/appUi.ts`, like `perfSettings`); components read one field with `useAppUi(selector)` and call the setters on `appUi` directly, so a change re-renders only the components reading that field. The task and transaction forms each subscribe to their own flags (`TaskFormOverlay` and `TransactionFormOverlay` in `Index.tsx`), and Quick Add reads the palette draft once when it opens instead of subscribing to it.
- **Tasks and transactions live in the React Query cache.** `AppProvider` still loads them in pages and writes every change, but into `["app", …]` keys with `setQueryData` instead of `useState`. Views read them through `useTasks(select)`, `useTransactions(select)`, `useTaskCategories()`, `useFinancialCategories()` and `useAppLoading()`; structural sharing keeps a selected slice's reference when an edit does not change it, so the component skips the render. The Home Engine card selects today's and upcoming tasks, the Vault sticker this month's totals, and the Financials charts their series, so renaming an old transaction or editing a task the card does not show re-renders none of them. The writes are on `useAppActions()`, whose value never changes after mount. `useApp()` is gone.
- **Task rows are memoised.** An edit replaces only that task's object, so the other `TaskItem`s in the list and Kanban skip the render.
- Signing out clears the `["app"]` keys and closes any open form, so the next session never starts with the last one's data or dialogs.

## [v0.8.7] - 2026-10-04

A faster Archive: searching, filtering and reading the vault.

### Changed

- **Search and tag filters no longer walk the vault.** On desktop, `useVaultNotes` keyed its query on the search text and tag, so each debounced keystroke and tag click ran `list_vault` (a directory walk plus a `stat` per file) before filtering. Every caller now shares one listing under `["vault", "notes"]` and filters it with `select` (`useVault.ts`). The web app still asks `/api/obsidian/notes` per query.
- **Search runs over a prepared index.** `buildVaultIndex` (`vaultCore.ts`) strips and lowercases each note's body, title, tags and path once per listing, and counts the tag list once, so a keystroke is a scan of plain strings instead of re-running the markdown-stripping regexes over every note. Entries are kept per note object, and the desktop listing reuses the object of every unchanged file, so a rebuild after one edit re-indexes only that note. `searchNotes` and `queryNotes` keep their signatures for the Node middleware.
- **The open note no longer re-parses while you type in the search box.** Wikilinks resolve through a map built once per listing (`src/lib/wikilinks.ts`) instead of a scan of every note per link, the resolved body is memoised on the note's content, and the markdown renders in a memoised component. Wikilinks now resolve against the whole vault, not only the notes the current search or tag shows.
- **Note rows and the tag cloud are memoised.** `NoteRow` takes the path handler directly instead of a new closure per render, and relative dates are computed once per list. The tag cloud is its own memoised component with a stable toggle.
- **Short lists stagger in only when the list first appears.** Rows that a search or tag filter brings in afterwards show at once instead of replaying the framer-motion entrance.
- **A vault file change refetches only what changed.** `useVaultLiveUpdates` invalidated every `["vault"]` query, so one Obsidian autosave refetched each cached search, every open note and the vault status. It now invalidates the listing and the changed notes' paths, and everything only when the vault folder disappears.

## [v0.8.6] - 2026-10-04

Fewer background wake-ups.

### Changed

- **Capped backdrop loops sleep between frames.** The Nebula (30 fps), its stars (30 fps), the Atmosphere's rain and snow (30 fps), the star specks (12 fps) and the Terminal static (20 fps) ran a `requestAnimationFrame` callback on every display refresh just to skip most of them, so a 30 fps loop woke 144 times a second on a 144 Hz monitor. They now share `startFrameLoop` (`src/lib/frameLoop.ts`), which waits on a timer until a frame is nearly due and only then asks for an animation frame. Drawing still lines up with the display; each drawn frame costs two or three wake-ups instead of five on a 144 Hz monitor, and the 12 fps stars drop from five to two at 60 Hz.
- **The Pomodoro timer wakes once a second instead of four times.** It polled every 250 ms while the window was visible so the display would not skip a second. Each wake-up is now timed for the moment the shown second changes (a whole number of seconds before the deadline), so it never lags and needs no faster polling, visible or not. A late timer realigns on the next one.

## [v0.8.5] - 2026-10-04

Performance outside performance mode: expanding the sidebar and switching between pages.

### Fixed

- **v0.8.4 installers never got past the splash screen.** The release workflow built without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`.env.local` is not in the repo), so the bundle threw on its first line. `release.yml` now passes both from repository secrets and stops before building if either is missing. Add them under **Settings → Secrets and variables → Actions** before tagging; the README's "Publishing a release" lists them.

### Changed

- **The sidebar expands over the page instead of pushing it.** A fixed 64 px slot holds its place in the row and the panel is positioned on top, so expanding no longer re-lays out `<main>` and the current view on every frame (or refits the Terminal). The width, labels and headers follow a `data-expanded` attribute in CSS (`.sidebar-shell` in `index.css`) instead of React state and Motion springs, so hovering re-renders nothing; `SidebarButton` is memoized with a stable handler. On The Portal the slot still widens with the panel, because the app's native webview would cover an overlay (`Navigation.tsx`).
- **Page backdrops stay mounted after you leave their tab.** The current backdrop and the last one are kept, the hidden one with `visibility: hidden` on it and everything inside it (so a crystal lit by the cursor cannot show through on another page), its CSS animations paused and its loops stopped (`BackdropSlot.tsx`, `useBackdropStill` in `src/lib/backdropSlot.ts`). Flipping between two themed tabs no longer rebuilds the Nebula's WebGL context, restarts the Atmosphere's canvas or re-decodes a black-hole image. The Nebula also keeps its WebGL context when it pauses, instead of building a new one.
- **Black-hole backdrops show at once on a later visit.** Baked images are decoded before first use and remembered, so a revisit (even after the backdrop was dropped) paints the image on the first frame without the fade-in (`imageBackdrop.ts`).
- **Switching pages is a short fade with no flicker.** The old view leaves at once (no more `AnimatePresence mode="wait"`, which held the next view back about 200 ms) and the new one fades in over 400 ms. The fade used to be opacity on the view's wrapper, which cuts off the blur of every glass card inside until it ends, so cards flashed see-through and then snapped back. Now each glass card, and the content beside them, fades on its own (`ViewEnter` in `Index.tsx`, `.view-enter` in `index.css`), and only for the first moments after a switch, so content that appears later does not fade.
- **Themed glass cards are one rule with per-theme values.** The Archive, Atmosphere, Horizon and Engine set `--glass-card-*` (and `--glass-hover-*`) on their `<main>` instead of each carrying a `.x-root main .glass-card` rule set. They look the same.
- **Softer blur over moving backdrops.** Glass cards on The Archive and The Atmosphere blur 6 px instead of 12 and 14 px outside performance mode, since every card re-blurs each frame the crystals or the sky move. The panels are tinted enough that the difference is small. In performance mode the backdrop is still and the full radius comes back.

## [v0.8.4] - 2026-10-04

### Fixed

- **Sidebar icons no longer shift when it expands.** The header swapped a one-line "C" for the two-line "Crystal OS / Productivity Ecosystem", so its height changed and every icon below moved a few pixels down and back. Both headers now stay mounted in one grid cell and cross-fade, keeping the taller height in both states (`Navigation.tsx`).
- **The Engine's Categories dialog no longer flickers when it opens or closes.** The overlay faded its own opacity with the glass card inside it, and opacity on an ancestor of a `backdrop-filter` drops the blur until the fade ends, so the card flashed see-through and then snapped back. The scrim and the card now fade side by side (`CategoryManager.tsx`). The Financials page uses the same dialog.
- **Themed hover cards in The Orbit.** The focus and money chart bars, the change badges, agenda rows, names lists and vault paths (review and Today card) show a `GlassTip` in the Orbit's ice and mauve instead of the browser's `title` box. The redundant `title` on **Latest** is gone.
- **Themed hover cards on Horizon events.** In the week and day views, timed and all-day events show a `GlassTip` in the Horizon's blues with the event's time range, instead of the browser's `title` box (`TimeGrid.tsx`, new `tipColors` prop).
- **Themed hover cards in The Nebula.** The project folder, model tier, auto-mode dot, context meter, token chip, sidebar project and **New chat** buttons, token table and **Stop** button use a new `NebulaTip`, a `GlassTip` in the user's Nebula palette. The colours are read from the theme because the card renders into `<body>`, outside the page root that holds the `--nebula-*` variables. The tier and context tooltips were the default shadcn popover before.

## [v0.8.3] - 2026-10-04

No app changes: this release is about building, checking and documenting it.

### Upgrade note

The updater signing key was replaced (new public key in `plugins.updater.pubkey`, key ID `2C3267CEA2CFF4A9`). A v0.8.2 install trusts only the old key, so install v0.8.3 by hand once; updates from v0.8.3 on install in place.

### Added

- **CI** (`.github/workflows/ci.yml`). Every pull request and push to `main` runs, on a Windows runner, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `cargo check --locked`. The web build comes before `cargo check` because `tauri::generate_context!` embeds `dist/`.
- **Release workflow** (`.github/workflows/release.yml`). Pushing a `v*` tag checks the tag matches `package.json`, runs the tests, builds with `npm run build:release` and creates a draft GitHub release with the installer and `latest.json`, its notes taken from this file. Publishing the draft is left to you. It needs the `TAURI_SIGNING_PRIVATE_KEY` secret (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if set); with `CRYSTAL_SIGN_PFX_BASE64` and `CRYSTAL_SIGN_PFX_PASSWORD` it also code-signs, and then fails rather than ship unsigned.
- **`npm run typecheck`.** `tsc --noEmit` over `tsconfig.app.json` and `tsconfig.node.json`.
- **Install section in the README** for people using the app rather than building it: where to download, the SmartScreen prompt while the installer is unsigned, first-run Supabase and `.env.local` setup, and where the program, settings and logs live.
- **`docs/PRIVACY.md`.** What is stored in Supabase, what is on disk (vault, `.env.local`, `settings.json`, Portal sessions, Nebula chats and keys, `diagnostics.log`, `localStorage`), what leaves the machine and when, and what The Nebula sends to each model provider. There is no telemetry.
- **Updater key backup note** in the README's "Publishing a release".

### Removed

- **27 unused shadcn/ui components** from the template (accordion, alert, aspect-ratio, avatar, badge, breadcrumb, card, carousel, chart, checkbox, collapsible, drawer, form, hover-card, input-otp, menubar, navigation-menu, pagination, radio-group, resizable, separator, sheet, sidebar, table, tabs, toggle, toggle-group). Nothing imported them.
- **20 dependencies only they used:** `@hookform/resolvers`, `react-hook-form`, `zod`, `embla-carousel-react`, `input-otp`, `react-resizable-panels`, `vaul`, and the Radix accordion, aspect-ratio, avatar, checkbox, collapsible, hover-card, menubar, navigation-menu, radio-group, separator, tabs, toggle and toggle-group packages.

### Security

- **`npm audit fix`** cleared 24 of 36 advisories (including the critical one and the high ones in `rollup`, `ws` and `postcss`) without major upgrades. The 12 left need breaking upgrades: `react-router-dom` 7, `vite` 8 (`esbuild`), `vitest` 5 and `tailwindcss` 4 (`braces`). All but `react-router` are build and test tooling that does not ship in the app; the `react-router` advisories cover an open redirect through `<Link>` targets with backslashes and SSR hydration, and Crystal OS renders on the client and never passes a computed path to `<Link>` or `useNavigate`.
- **`cargo audit`** finds no vulnerabilities. It warns about 7 unmaintained or unsound crates, all pulled in by Tauri: `proc-macro-error` and the `unic-*` crates at build time, and `glib`, which is only compiled on Linux.

## [v0.8.2] - 2026-10-04

### Upgrade note

This is the last version that has to be installed by hand. From here, **Settings → Install & update → Check for updates** installs newer releases in place, once a release has been published with `npm run build:release` (see the README's "Publishing a release"). The updater's private key is kept outside the repo; back it up, because without it installed copies cannot update in place.

### Added

- **Check for updates.** A new first block in Settings → Install & update. It reads `latest.json` from the newest GitHub release through `tauri-plugin-updater`; when that is newer than the running build, **Update to vX** downloads the installer with a progress bar, verifies its minisign signature against the public key in `tauri.conf.json`, and runs it in passive mode, which reopens the app when done. Before the installer starts, the sidecar, shells and agents are stopped so none of them holds a file it replaces (`stop_children` in `lib.rs`, shared with a normal quit). The webview has no updater permission of its own: it calls two app commands, `update_check` and `update_install`, and install only runs the update the last check found (`src-tauri/src/updater.rs`).
- **`npm run build:release`.** `build:desktop` plus `createUpdaterArtifacts` (`src-tauri/tauri.release.conf.json`), which signs the installer with `TAURI_SIGNING_PRIVATE_KEY`, then `scripts/updater-manifest.mjs` writes `latest.json` next to it. The notes come from the version's CHANGELOG section, and the URL uses the dotted asset name GitHub serves (`Crystal.OS_0.8.2_x64-setup.exe`).
- **Optional Windows code signing.** Every bundled binary goes through `scripts/sign-windows.mjs` (`bundle.windows.signCommand`). It signs with `signtool` when `CRYSTAL_SIGN_THUMBPRINT` (a certificate in the Windows store) or `CRYSTAL_SIGN_PFX` is set, timestamped, and otherwise leaves the build unsigned and says so. `CRYSTAL_SIGN_REQUIRED=1` turns the skip into a failure.

### Changed

- **NSIS is the only bundle target.** `targets: "all"` also built an MSI that nothing used; the Installer section already preferred the `.exe`. Builds are faster and leave one installer.
- **The npm package is named `crystal-os`** instead of the template's `vite_react_shadcn_ts`.

## [v0.8.1] - 2026-10-03

### Added

- **Today card on The Orbit.** A focus line, a mood (Rough, Low, Okay, Good, Great) and an optional one-line reflection, saved into the vault's daily note `YYYY-MM-DD.md`. The folder is whichever one your newest daily note is in, or `Daily/` when there are none (`pickDailyFolder` in `src/lib/dailyNote.ts`). The card writes only its own block, between `<!-- crystal-os:today -->` comments, and adds the `daily` tag to the frontmatter. Everything else in the note stays as it is. On open it reads the block back, so the note is the only store. Saves carry the note's mtime, so an edit made in Obsidian meanwhile is reloaded rather than overwritten (`TodayCard.tsx`).
- **"Daily review" button on the Home Orbit card.** It replaces the "The Orbit" link text, with an ice-to-mauve glass tooltip ("Log today's orbit", new `orbit` tone on `GlassTip`). It opens The Orbit with the cursor in the Today card.
- **This week (or month) so far.** The Orbit's next arrow now steps one past the latest finished review into the period still running, labelled "so far". The Reflect & export card is hidden until that period's review is ready. Clicking the Home card when no review is waiting opens this week, which is what its teaser counts (`inProgressPeriod` in `src/lib/orbitReview.ts`, `orbitStore.land`).

### Fixed

- **The Orbit showed no completed tasks.** It only showed finished periods, so on any day before Sunday 6 PM the newest review was last week. Ticks recorded since the v0.8.0 migration all fall in the current week, so they never appeared. The current week and month can now be opened (see above). Tasks completed before the migration still have no history, because `tasks` stores no completion time.
- **`0003_orbit_review.sql` had a stray backtick** in `gen_random_uuid()`, a syntax error on a fresh run. Re-running the corrected file is safe.

### Removed

- **Dead Daily Focus state.** `dailyFocus`/`setDailyFocus` and the `settings` `daily_focus` read and upsert are gone from `AppContext.tsx`. The Today card replaces them, with the vault as the store. The `settings` table is left in place.

## [v0.8.0] - 2026-10-03

### Upgrade note

Apply `supabase/migrations/0003_orbit_review.sql` in the Supabase SQL Editor, then run `npm run verify:rls` (it now checks the two new tables too). It creates `task_completions` and `focus_sessions` with the same per-user RLS as the other tables, and is safe to run more than once. Until it is applied, The Orbit shows a setup banner and counts no completions or focus time, and ticking a task off shows a "Could not record the completion" toast; everything else works. History starts when it is applied: completions and focus runs from before then were never recorded.

### Added

- **The Orbit: weekly and monthly reviews.** A new section between Home and the Engine (`src/components/views/OrbitPage.tsx`). A Weekly/Monthly switch shows the newest finished period. Weeks run Monday to Sunday and are ready at 6 PM on Sunday; months are ready at 6 PM on their last day. Until then the previous period is shown. Arrows page back through earlier periods and **Latest** returns. Each review has these cards:
  - **Tasks:** completed against added, as two rings plus counts. Lists the names, the first five then **+N more**.
  - **Focus:** total Pomodoro time, the per-day average (and per-week for a month), and a bar per day.
  - **Money:** net, income and spending, with bars against the previous period.
  - **Trends:** each number against the last period and the 4-week or 3-month average. ▲/▼ are coloured by whether the change is good (spending going up is not).
  - **Vault notes:** notes added, with their names.
  - **Next week / Next month:** a mini agenda of calendar events and open tasks, by day (or by week for a month), each group capped with **+N more**. A repeating task is listed once, marked "repeats".
  - **Reflect & export:** optionally pick one prompt (What went well / What didn't go well / Focus for next week), optionally add a note, and **Export to vault**.
- **Review export.** Writes `Reviews/Weekly/2026-W40.md` (ISO week) or `Reviews/Monthly/2026-10.md`. The numbers go in frontmatter for Dataview, followed by sections for each card. New notes are wikilinked and the reflection goes last. When the note already exists, a confirmation asks before overwriting it. The note is built by `toMarkdown` in `src/lib/orbitReview.ts`, which also holds the period maths, stats, trends and agenda, all unit-tested.
- **Auto-export reviews** (Settings → The Orbit, off by default, stored per device). Writes each review once, when it is ready or on the next launch if the app was closed then (`OrbitAutoExport.tsx`). It never overwrites an existing note and leaves the reflection out; export again from the page to add one.
- **Ready badge.** A dot on The Orbit's nav icon (sidebar and phone bar) and a "Weekly review ready" chip on the Home card mark a review you have not opened. Opening it clears the mark (`src/lib/orbitStore.ts`, local to the device).
- **Completion and focus history.** Every tick from Home or the Engine adds a `task_completions` row, one per completion for repeating tasks, with the title and category copied so renaming or deleting the task keeps its history. Unticking removes the latest row, so a misclick does not count. The Pomodoro store reports each finished focus phase, and each focus run reset or resized after at least a minute, to a recorder (`pomodoro.setRecorder`). AppContext saves these as `focus_sessions` rows. Paused time is not counted.
- **Note dates.** Vault notes now carry `created`, the local day the note was written: frontmatter `created`, else `date`, else a `YYYY-MM-DD` in the file name, else the file's creation time, else its modified time (`noteCreatedDay` in `src/lib/vaultCore.ts`). A bare YAML date such as `2026-10-03`, which YAML reads as midnight UTC, stays on that day instead of shifting to the 2nd west of Greenwich. Creation time comes from `birthtimeMs` on the server and a new `ctime` field from Rust (`src-tauri/src/vault.rs`).
- **Creating notes.** `POST /api/obsidian/create` (`createNote` in `server/obsidian/vault.ts`) and `createNoteNative` write a new `.md` note and any parent folders. Both refuse with `409`/`conflict` when the note exists, unless `overwrite` is set. `useCreateNote` and `createVaultNote` wrap them.

### Changed

- **The Home greeting card is The Orbit's card.** The greeting and clock now sit on The Orbit's black hole (blurred at 25%, like the Horizon and Engine boxes) under light glass. A teaser line shows this week's tasks done and focus time, a chip shows when a review is ready, and clicking the card opens The Orbit. Its id stays `clock`, so saved Home layouts keep its place.
- **The Orbit's look.** A pale, tilted black hole (`src/assets/orbit-backdrop.webp`) sits behind the page through `ImageBackdrop`, blurred at 15%. The palette is taken from it: an ice-white and cyan photon ring, slate blue, lavender-mauve, and rust for warnings over near-black navy (`--orbit-*` in `index.css`). Every part of the page uses it: liquid glass cards, the Weekly/Monthly switch and period arrows, prompt chips, the note box, buttons, the overwrite dialog and its backdrop, toasts, focus outlines, loading shimmer, and the sidebar with its gradient logo and glowing pill. Dialogs and toasts render into `<body>`, so they follow it through `orbit-theme` on `<body>`.
- **Switching Weekly/Monthly or periods fades** the cards out and in (150 ms each). Like the Engine's v0.7.7 fade, each card fades on its own, not a wrapper, so the glass blur never cuts out. The old review stays on screen until the new one's data has loaded, so the page never fades in empty and then fills. Performance mode or the OS reduced-motion setting swaps at once.
- **The Portal's icon is now `AppWindow`.** The Orbit took the orbit icon.
- **Plaid banking moves to v0.10.0.**


### Added

- **The Atmosphere has a default background.** A misty forest lake (`src/assets/atmosphere-backdrop.webp`) now sits behind the page and the Home weather box when you have not chosen an image of your own, blurred by the **Image blur** setting like a custom image, with the sky's tint and effects drawn over it. It is fetched only after the saved-image read finds nothing, so a saved image never flashes the default first. Choosing a PNG or JPEG still replaces it; the remove button now goes back to the default rather than the plain sky, and **Image blur** is always shown. The store has a new `customImage` flag, and `imageUrl` is the image shown (yours or the default). The plain sky appears only if the default cannot load.
- **The Engine fades between List and Board.** Switching views fades the old one out and the new one in (150 ms each). The fade runs on each glass card and header (`.engine-view[data-fade]` in `index.css`), not on a wrapper, because opacity on an ancestor of a `backdrop-filter` cuts the blur off and it snapped back with a flicker when the fade ended. Performance mode or the OS reduced-motion setting swaps at once, as before. Rows still skip their own fade-in when a view mounts, so the v0.7.6 flicker fix stands.

## [v0.7.6] - 2026-10-02

### Added

- **The Engine gets the Horizon's look.** A red black hole sits behind the Engine page, blurred at 15% like the Horizon's, and the Engine box on Home wears it at 25% (`src/assets/engine-backdrop.webp`). The page takes an ember palette from the image: orange buttons, rings and focus outlines, gold check marks, dark ember glass panels at the same opacity as the Horizon's, a tinted sidebar with a glowing active pill and a fire gradient logo. Dropdowns and pickers opened from the Engine follow it through an `engine-theme` class on `<body>`.

### Fixed

- **Switching the Engine between List and Board flickered.** Every row of the new view mounted transparent and faded in, blanking the page for a moment, and the scrollbar appearing or vanishing shifted it sideways. Rows already present when a view mounts now skip the fade (`AnimatePresence initial={false}`), and the Engine keeps a stable scrollbar gutter. New tasks still fade in.

### Changed

- The Horizon-only backdrop code is now shared: `src/lib/imageBackdrop.ts` (`useImageBackdrop(image, amount)`, `PAGE_BACKDROP_BLUR`, `CARD_BACKDROP_BLUR`) and `src/components/layout/ImageBackdrop.tsx` replace `horizonBackdrop.ts` and `HorizonBackdrop.tsx`. The CSS classes `horizon-image` and `home-horizon-scene`/`-image` are now `image-backdrop-image` and `home-backdrop-scene`/`-image`.
- **The search bar is on Home only.** Every other tab drops it and gets the space back. `Alt+Shift+Space` (desktop) and Ctrl/Cmd+K now switch to Home from any tab and focus the bar; Ctrl+K is still left to the shell inside the Terminal. The shortcuts moved from `CommandPalette` to `Index.tsx`, which keeps the desktop hotkey's failed-to-register toast mounted on every tab. The Horizon's week and day hour grids grow by the bar's height.
- The Pomodoro ring and the category manager's overlay read the page's palette instead of fixed indigo and navy, so they follow the Engine's colours. Other pages look the same.

## [v0.7.5] - 2026-10-01

### Upgrade note

Apply `supabase/migrations/0002_task_repeat_kinds.sql` in the Supabase SQL Editor before using this version. It adds `repeat_kind` and `repeat_weekdays` to `tasks`; until it is applied, saving a task fails with a "column does not exist" error. Existing repeats (rows with only `repeat_days`) are read as "every N days" and need no backfill.

### Added

- **Smarter repeats.** A task's **Repeat** is now a choice: every N days (as before), weekly on chosen weekdays (Mon/Wed/Fri), monthly on the start date's day of the month (a task started on the 31st lands on the last day of shorter months), or N days after completion. An "after completion" task shows only its pending occurrence; ticking it off moves it to N days from today, keeping its length, with a "Next due" toast, so chores slide instead of piling up. It goes overdue like a one-off task if it is not done in time; scheduled repeats never do. Task rows show the repeat ("Mon, Wed, Fri", "Monthly on the 22nd", "3 days after done"). The rule is a `RepeatRule` (`src/lib/utils.ts`) with `normalizeRepeat`, `taskFallsOnDate`, `completionUpdates` and `describeRepeat`, stored as `repeat_kind`, `repeat_days` and `repeat_weekdays`. Completing a task from Home or Tasks goes through a new `completeTask` in `AppContext`.
- **Edit notes in the Archive.** **Edit** in the note reader opens the whole file, frontmatter included, in a CodeMirror markdown editor themed from the page's colours (`src/components/views/NoteEditor.tsx`, lazy-loaded so CodeMirror stays out of the main bundle). **Save** or Ctrl+S writes it back with the `mtime` it was opened at. On desktop that is the same temp-file-and-swap `write_vault_file` Quick Add uses; on the web there are two new routes, `GET /api/obsidian/raw` and `PUT /api/obsidian/note`, with the same check (`409` on a stale `mtime`, 2 MB cap, `saveNote` in `server/obsidian/vault.ts`). If the note changed on disk while you edited, you choose **Discard mine, load theirs** or **Overwrite with mine**. Unsaved edits are kept as a draft when you switch notes or tabs, until the window closes, and **Cancel** asks before discarding them.
- **Week and day views on the Horizon.** Alongside Month and Agenda, **Week** (Sunday to Saturday, like the month grid) and **Day** show hour-by-hour columns (`src/components/views/TimeGrid.tsx`). All-day events sit in a strip above the grid; overlapping events share the column side by side, each run of overlaps laid out on its own (`layoutDay` in `src/lib/timeGrid.ts`); events crossing midnight are clipped to each day. A line marks the current time, and the grid opens scrolled to an hour before now (or 7 AM on other weeks). Clicking an empty slot opens **New Event** at that half hour, an hour long; clicking a day's heading in the week view opens that day. **Today** and the arrows page by week or day, the periods either side are prefetched, and the chosen view is remembered on this device.
- **Overdue section in Tasks.** Open tasks past their end date get their own **Overdue** group at the top of the list, oldest first, each with a **Today** button that moves it to start today, keeping its length. **Move all to today** does the whole group. Uses the same overdue rule as Home's Engine (`isTaskOverdue` and `rescheduleToToday` in `src/lib/utils.ts`).
- **Customisable Home grid.** Drag a widget by its box to move it; presses on links, buttons and fields inside a widget still work, and a press that doesn't move 6 px is still a click that opens the page. **Edit layout** (under the grid) adds controls to each widget to resize it to 1, 2 or 3 columns, nudge it earlier or later, or hide it; hidden widgets come back from **Show …** buttons, and **Reset layout** restores the default. The layout is saved in localStorage, so each device keeps its own (`src/lib/homeLayout.ts`, `src/components/views/HomeGrid.tsx`). Widgets added in a later version are appended to a saved layout rather than lost.
- **Settings search.** A filter box at the top of Settings (Ctrl+F jumps to it) hides sections that don't match and unfolds the ones that do, matching section titles and everything inside them. Within a matching section, rows that don't match fade back. Enter scrolls to the first match, Escape clears the search, and unfolding a section for a search does not change whether it stays folded afterwards.
- **Error reporting.** Unhandled promise rejections, uncaught errors and failed Supabase writes are now recorded (`src/lib/diagnostics.ts`). The Supabase client uses a logging `fetch` that notes any non-GET request outside `/auth/v1/` that fails or returns an error status, with the method, the path (which names the table), the status and Supabase's error code and message. It never logs request bodies or query strings, so task names, amounts and filter values stay out of the log. On desktop the entries are appended to `diagnostics.log` in the app log folder (`%LOCALAPPDATA%\com.crystalos.desktop\logs`), rotated to `diagnostics.old.log` past 512 KB (`src-tauri/src/diagnostics.rs`); on the web they are kept for the session. **Settings → Diagnostics → Copy diagnostics** copies the latest 200 entries with the app version, user agent, online state and window size.
- **E2E smoke test.** `npm run test:e2e` runs a Playwright test (`e2e/smoke.spec.ts`) in Edge that signs in with a test account (`E2E_EMAIL` / `E2E_PASSWORD` in `.env.local`), adds a task and a transaction, checks both survive a reload, deletes them, and opens every page, failing on any uncaught error or empty page. It is skipped when the credentials are not set.
- **`npm run badges`** rewrites the README version badge from `package.json` and the tests badge from a fresh Vitest run (`scripts/update-badges.mjs`), and leaves the tests badge alone if anything fails.
- **Terminal split view.** Drag a terminal tab over the frame to show up to 4 shells at once. An outline previews the drop: the half of the pane nearest the pointer to split it, or the whole pane to replace it (or swap, if the shell is already on screen). With 4 panes showing, other tabs can only replace one. Panes have a draggable title bar and a close-pane button that keeps the shell running; dividers drag to resize and double-click to reset. The split survives leaving the Terminal page. The layout is a small binary tree in `src/lib/terminalLayout.ts`, with tests.

### Changed

- **The Archive is lighter.** While anything on the page scrolls, the floating crystals, twinkling sparkles, haze and aura pause where they are and resume 180 ms after the scroll stops, so the scroll gets the frames (`data-scrolling` on `ObsidianBackdrop`). High-DPI screens draw fewer background sparkles, which they paint at several times the pixels: 60 at 1.25×, 44 at 1.75× and 32 at 2.5× instead of 80 (`backSparkleCount` in `src/lib/obsidianScene.ts`). Past 80 notes the note list is virtualised with `@tanstack/react-virtual`, so only the rows in view are mounted.

### Dependencies

- Added `@uiw/react-codemirror`, `@codemirror/lang-markdown`, `@codemirror/view`, `@codemirror/language`, `@lezer/highlight` (note editor) and `@tanstack/react-virtual` (Archive note list).

### Fixed

- **README badges were stale.** They said v0.7.0 and 301 tests; they now match the current version and test count.

## [v0.7.4] - 2026-09-30

### Added

- **Any Canadian city for the weather.** The city dropdown on The Atmosphere is now a search box over all ~840 Environment Canada city page locations, not just the nine Ontario ones. Before you type it suggests those nine; typing matches city names (accents ignored, so "montreal" finds Montréal) and then forecast regions ("city of toronto"), and each row shows its province and region so places like Richmond, BC and Richmond Hill, ON are easy to tell apart. Arrow keys and Enter pick a city; Escape closes the list. The location list (names and regions only, about 118 KB) is fetched once per session the first time the picker loads (`useCityList` in `src/hooks/useWeather.ts`). The picker is a new `ThemedCombobox` in `src/components/ui/field-controls.tsx`, styled like `ThemedSelect`.

### Changed

- **A saved city is accepted if its id looks like any city page location** (a province or territory code and a number, e.g. `qc-147`; `isCityId` in `src/hooks/useWeather.ts`), so a city picked from search survives a reload. Unknown ids still fall back to Markham.

### Fixed

- **"Mississauga" showed another city's weather.** Its hard-coded location id, `on-82`, belongs to a different place, so picking it loaded that place's forecast while the Home weather box still said Mississauga from the hard-coded name (the picker, which shows the forecast's name, disagreed). Once the full location list has loaded, the nine suggestions now take their ids from it by name (`resolveSuggestions` in `src/hooks/useWeather.ts`), and a suggestion the list has no match for is labelled with the list's name for its id. The Home box now shows the forecast's own city name, the same one the picker shows. A city already saved as `on-82` keeps that place until Mississauga is picked again.
- **Dropdowns would not scroll with the cursor resting on a row.** v0.7.3 gave every element `overscroll-behavior: none`, but any element with `overflow: hidden` is a scroll container too, and each dropdown row's label is one (it truncates long text). With `none`, the label swallowed the wheel instead of passing it on to the list, so the list only scrolled from the gaps between labels. `overscroll-behavior: none` now applies only to real scrollers (`html`, `body`, `textarea`, Tailwind's `overflow-auto`/`overflow-scroll` classes and Radix scroll area viewports, in `src/index.css`), so panels still stop dead at their ends without rubber-banding while clipped elements let the wheel through. This also fixes the wheel over any other truncated text or clipped card inside a scroll panel. Separately, hovering a row no longer scrolls it into full view: as the wheel moved the list, a row cut off at the edge could slide under the still cursor and jump the list back. Only the keyboard (arrows, Home/End, opening the list) scrolls the highlighted row into view now. Both apply to every `ThemedSelect` in the app and to the new city picker.

## [v0.7.3] - 2026-09-26

### Added

- **A global hotkey for Home.** `Alt+Shift+H` works from any app: it shows Crystal OS if it is hidden and switches to the Home page, or, if the window is already open, just switches to Home from whichever tab is on screen. It is registered in Rust like the other two hotkeys, emits `home://open` to the webview (`useHomeHotkey` in `src/hooks/useGlobalHotkey.ts`, mounted in `Index.tsx` so it works on every tab), and is saved as `homeShortcut` in `settings.json`. Change it in Settings under **Keyboard shortcuts** → **Go to Home**; it cannot share a combo with the other two, and a failed registration shows the same toast at startup.

## [v0.7.2] - 2026-09-26

### Changed

- **The Horizon has a look of its own.** A black hole with a blue accretion disk sits behind the page, blurred at 15% on the Atmosphere's Image blur scale (a 6 px blur on a 1600 px copy). The purple is gone: the logo, buttons, active sidebar item, event dots, dropdowns and date pickers are electric blue over deep navy, the panels are dark blue glass so text reads over the bright disk, and the sidebar gets a blue edge glow. Dropdowns and pickers render into `<body>`, outside the page, so the palette is also set on `<body>` while the Horizon is open.
- **Home's "Today on the Horizon" box wears the same black hole,** blurred at 25% (10 px) under a very light glass with a blue hover glow, like the other themed boxes.
- **The Disconnect Google Calendar tooltip is themed.** It uses the app's glass tooltip with a blue border instead of the browser's plain `title` box.

Both blurred copies are baked once per session on a canvas with the same `blurImage` the Atmosphere uses (`src/lib/horizonBackdrop.ts`), so neither place runs a live CSS blur. The image fades in over 600 ms once baked; reduced motion skips the fade.

### Fixed

- **Categories duplicated themselves.** On every load the app fetched the categories and, if none came back, created the starter set. A failed fetch (an expired sign-in, a network drop, waking from sleep) also returns no rows, so each failed load added another copy of every category. Seeding now only runs when the fetch succeeded and the table is really empty (`shouldSeedCategories` in `src/lib/seedCategories.ts`, with tests). A failed fetch shows an error instead. Copies created before this fix stay in Supabase until removed.

## [v0.7.1] - 2026-09-24

### Changed

- **The Archive's sparkles can be seen.** The stars on the crystal tips are 24–40 px instead of 10–20 px, and the background stars 10–22 px instead of 6–16 px. Each star's rays are now two thin gradient lines instead of a clipped star shape, which shrank to a dot at small sizes.
- **The Archive's crystals cost far less to draw.** The resting glass is painted with gradients and no longer carries a `backdrop-filter`. That blur ran on all 53 crystals and was recomputed every frame, because the drifting haze and floating crystals behind it never stop moving. Only a crystal lit by the pointer now gets a live blur, and its halo and bright rim are hidden while it is dark. Every third crystal holds still instead of floating, and the per-layer `will-change` hints on the sparkles, halos and glints are gone.
- **The Horizon's dots cascade in when the page opens.** They pop in cell by cell from the top left, about 600 ms in all. Performance mode and reduced motion skip it.
- **Paging months on the Horizon fades and slides.** The old month, dots included, fades out toward the side you left and the new one fades in from the other, in about 350 ms. It plays in performance mode too. The months either side of the one on screen are prefetched, so their dots usually arrive with the grid. When they do not, they fade in once loaded instead of popping in.

### Fixed

- **Scroll panels stretched past their ends.** A touchpad scroll that was already moving when it reached the end of a panel kept going and rubber-banded past the edge (WebView2's elastic overscroll), while a fresh scroll started at the edge did not. Every element now has `overscroll-behavior: none`, so scrolling stops dead at the bounds everywhere. A scroll that reaches the end of an inner panel also no longer hands on to the panel around it.
- **Opening or closing a day on the Horizon flickered.** The day panel faded in as one layer with its glass card inside it. A layer below full opacity becomes the card's backdrop root, so the card's blur saw nothing until the fade ended and then snapped in. The dim scrim and the card now fade as separate siblings, and the event form works the same way.
- **The Archive's sparkles vanished in performance mode.** Performance mode ends each animation on its last frame, and a twinkle ends invisible. The stars now hold at 80% there instead.
- **A task's repeat could not be turned off.** Setting **Repeat every** back to 0 sent no value for the repeat, and saving a task skips fields with no value, so `repeat_days` stayed set in Supabase. The task looked fixed until the next reload, then repeated again. The form now always sends the interval, and a 0 clears the column to `null`.
- **Negative repeat intervals were accepted.** `min={0}` only limits the spinner, so typing `-3` stored `-3`. The calendar treated that task as one-off, but Home's overdue check treated it as repeating, so it never showed as overdue. The field now clamps to 0 or more, and a new `normalizeRepeatDays` (`src/lib/utils.ts`, with tests) turns anything that is not a positive whole number into "no repeat" everywhere a task is read, saved or checked. Tasks already stored with a negative interval are read as one-off.

## [v0.7.0] - 2026-09-24 - The Living Sky (Release Summary)

*This release gives The Atmosphere a world of its own, the Living Sky: a sky that follows the sun, weather you can see, an aurora that leans toward your cursor, and your own photo under frosted glass if you want one. Around it, the rest of the shell gets tidier: The Archive moves to the sidebar's bottom group and drops the search bar, its crystal cave fills the whole border, Settings sections fold away, every switch and slider glides, and the Terminal's title stays black and white.*

It also caps the development arc from `v0.6.0` through `v0.6.9`. Over that period Crystal OS gained a coding agent in its own tab, themed caves and skies for pages that used to share one indigo glass, a Home screen that shows every space at once, an installer that updates the app from inside it, and a run of passes that cut the idle memory and CPU of the Portal and the app around it.

### Highlights

- **The Nebula (`v0.6.0`, `v0.6.6`)**: a coding agent that reads, changes and runs things in a project folder, on three model tiers (OmniRoute, NVIDIA NIM, or Claude Code on your own account), with Claude Code's effort levels and Auto / Manual / Plan modes. Your Claude skills and local MCP servers come along, chats are saved and resume after a restart, and a WebGL nebula in your colours swirls behind it. `v0.6.6` added a context meter that shows how full the model's window is
- **Themed spaces (`v0.6.1`, `v0.6.9`, `v0.7.0`)**: The Archive became a dark amethyst cave with glass crystals growing in from the edges, sparkles, and a cursor light the crystals reflect, and its Home box took the same look. The Atmosphere now has the Living Sky, detailed below. Every themed page restyles the sidebar, panels and title to match
- **Home on one screen (`v0.6.8`, `v0.6.9`)**: a 3×3 grid with a Vault money card, upcoming tasks ordered by priority once today is clear, and Nebula, Portal, Terminal and Archive boxes that each wear their page's look. Styled tooltips render above the page, so neighbouring cards no longer cut them off, and the Vault's three charts draw in together
- **A Portal that costs less in the background (`v0.6.2`, `v0.6.5`, `v0.6.7`)**: hidden apps drop their render caches after 30 seconds and are throttled unless set to **Keep live**, hiding to the tray trims everything at once, and **Keep loaded in background** can close an app's whole WebView2 process after a delay you choose. Shortcuts and focus now work while typing inside an app
- **Performance mode and lighter loads (`v0.6.3`, `v0.6.7`)**: views are code-split and, in performance mode, load only when first opened, with cached data dropped after a minute and animations turned off. Tasks and transactions past Supabase's 1000-row cap now load, the desktop sidecar shrank from 13.5 MB to about 650 KB, and a hidden window stops every backdrop loop and pauses polling
- **Install & update from inside the app (`v0.6.6`)**: Settings lists every GitHub release and downloads its installer to your Downloads folder, or builds one from a source checkout with a live log
- **Builds that look like dev (`v0.6.4`, `v0.6.6`)**: Inter and Cascadia Mono are bundled, since the desktop CSP blocked the Google Fonts CDN, and a CSP fix lets xterm's injected styles through, so the Terminal no longer renders in the sans-serif font in packaged builds. `npm run build:desktop` also prunes old installers first
- **The Living Sky (`v0.7.0`)**: sky phases from the city's sunrise and sunset, weather effects, the aurora, a custom background image with adjustable blur, and a matching weather box on Home, detailed below
- **A calmer shell (`v0.7.0`)**: The Archive in the bottom group without the search bar, a fuller crystal border with brighter sparkles, collapsible Settings sections, gliding switches and sliders, and a monochrome Terminal title, detailed below

### Added

- **The Atmosphere has its own look: the Living Sky.** A sky gradient for the time of day, from the chosen city's sunrise and sunset (dawn and dusk run 45 minutes either side). It has a glowing sun, the moon in its current phase, and twinkling stars at night. The panels and sidebar switch to deep night glass, and the page title and sidebar pill take teal and sky blue.
- **Weather effects** (Settings → The Atmosphere, on by default). Cloud bands, overcast, fog, rain, snow, sleet and lightning follow the current conditions. Lightning flashes the sky, draws a bolt, and lights up the clouds and aurora for a moment.
- **Aurora** (on by default). Soft ribbons of northern lights over a pine treeline. They sway on their own, bend toward the cursor, sit behind the clouds and rain, and are brightest at night and faint by day. It combines freely with weather effects; with both off you get the plain sky.
- **Custom background image.** Pick a PNG or JPEG (up to 25 MB) in Settings. It is scaled to at most 2560 px, stored in IndexedDB on this device, and shown under frosted glass behind the page and the Home box. The sky becomes a light tint over it, and all effects, the aurora included, draw on top. Remove it with the bin button.
- **Image blur** (Settings → The Atmosphere, shown once an image is set). Sets how much the glass frosts the image, from sharp (0%) to heavy (100%, a 40 px blur); the default is 50%. The blurred copy is baked once on a canvas when you let go of the slider, not blurred live. A live full-screen CSS blur under the aurora's moving layers could make the desktop app drop the photo and show the plain sky.
- **The weather box on Home wears the Living Sky**: the phase's sky (or your image), the aurora band and pines, clouds, rain or snow streaks, fog and lightning flicker, all in CSS.
- **Settings sections fold away.** Click a section's header (Keyboard shortcuts, Startup, Vault, The Nebula, The Portal, The Atmosphere, Performance, Install & update) to collapse or expand it. The body eases between heights over 360 ms (a CSS grid row moving between `0fr` and `1fr`, so nothing is measured in script) while it fades, and the chevron turns. A folded section leaves the tab order, and which sections are folded is remembered on this device (`crystal-os-settings-collapsed` in `localStorage`).

### Changed

- The chosen weather city lives in a shared store (`src/lib/atmosphereStore.ts`) so the page, backdrop and Home box stay in step. It uses the same `crystal-os-weather-city` key, so your saved city carries over.
- The Portal's Stargate stars now come from a shared `StarCanvas` component, which the Atmosphere's night sky also uses. They look and behave the same.
- **The Archive moved to the sidebar's bottom group,** at its top, above The Nebula. On desktop the group now reads Archive, Nebula, Portal, Terminal, Settings. The phone bar keeps The Archive in its row, since it has no bottom group.
- **The global search bar is hidden on The Archive,** as on the Terminal, Portal and Nebula tabs, along with its shortcuts. The Archive has its own vault search, and its note rail now runs down to the bottom of the window in the space the bar used.
- **The Archive's border is lined with crystals.** There are 53 crystals instead of 32: each corner grows three, and clusters now sit every 12–16% along each edge instead of every 22–26%, so the edges read as one continuous band. They grow in slightly faster one after another, so the extra crystals do not stretch the opening.
- **The Archive's sparkles are easier to see.** There are 80 background stars instead of 44, at 6–16 px instead of 3–11 px, and the stars on the crystal tips are 10–20 px instead of 8–16 px. Each star has a larger white core, thinner and longer rays, and a soft violet glow behind it that twinkles in step.
- **Switches and sliders glide.** Switches slide over 300 ms with a slight overshoot and a soft glow when on, instead of a 150 ms snap. Sliders (swirl speed, star density, image blur) ease the thumb and the filled bar to each new step over 180 ms instead of jumping, and the thumb grows a little on hover and shrinks while held. These controls and the Settings fold keep their short transitions in performance mode (they carry `data-smooth`, which the `perf-still` rule skips), since they cost next to nothing.
- **The Terminal title glitches in black and white.** The ghost copies behind the Terminal page title, the Home Terminal box title and the sidebar's Crystal OS mark on the Terminal tab are now bright white and dim grey instead of red and cyan, matching the tab's monochrome look.

### Fixed

- **The Terminal title and sidebar mark turned aqua in performance mode.** The red and cyan ghost copies were only hidden by their animation's keyframes. Performance mode jumps animations to their end state, and these keyframes had no 100% frame, so the end state was the unclipped copy and the cyan one covered the white text. The copies are now clipped away in their base style and in a closing keyframe, so they stay hidden whenever the animation is not running: performance mode, reduced motion, or a paused window.

## [v0.6.9] - 2026-09-23 - The Archive Joins the Grid

### Changed

- **The Archive box on Home wears the Archive's look**: the amethyst cave behind and around the card with twinkling sparkles, violet glass, a gem icon, the gradient title, the Archive's tag chips, and an amethyst tooltip on quick add. It matches the Nebula, Portal and Terminal boxes.
- **Upcoming tasks are ordered by priority first** (urgent, high, medium, low), then by earliest date, then by earliest start time. They were ordered by date first, so a low-priority task tomorrow sat above an urgent one next week. The ordering lives in `src/lib/homeTasks.ts`, with tests.

### Fixed

- **Home tooltips were cut off by neighbouring cards.** The tooltip was drawn inside its card, and every card is its own stacking context (backdrop blur, isolation), so any card later in the grid painted over the part that stuck out, such as the right corner of **Add task** under Today on the Horizon. Every `GlassTip` (quick add, add task, complete task, the Portal box's app icons) now renders above the page.
- **The Vault's charts now all draw in together.** Entering the Vault, only Spending Breakdown played its entrance while Cash Flow and Net Savings Trend appeared already drawn. Recharts plays its entrance only on a chart's first render, and a resize right after mount replays it as a near-invisible morph. Each chart now waits behind a skeleton until its box has held one width for 120 ms, then all three draw in over the same 900 ms. Performance mode and reduced motion skip the entrance.

## [v0.6.8] - 2026-09-23 - Every Space on One Screen

### Changed

- **Home is a 3×3 grid.** Row one: clock, weather, and a **Vault** card (this month's net, money in and out, top spending category) that replaces the AI smart summary and opens The Vault. Row two: the Engine, today's events, and the Archive. Row three: **Nebula**, **Portal** and **Terminal** boxes, which replace Daily Focus. Each of those boxes, and the space around it, wears its page's look: the Nebula box uses your palette (and stars, if on), the Portal box your Portal theme with its spinning ring, the Terminal box black scanlines and the glitch frame.
  - **Nebula** shows chats, projects, the latest chat and running agents. Before the first Nebula visit it reads the saved chat index without starting any agents.
  - **Portal** shows connected apps with unread badges; click an app to open it in the Portal.
  - **Terminal** lists the running shells (desktop).
- **The Engine shows upcoming tasks when today is clear**: the next 14 days' open tasks, soonest first, labelled "Tomorrow", a weekday, or a date.
- **The whole Archive card opens The Archive**, not only its notes and "Browse all".
- **Styled tooltips** on Home's quick-add, add-task and complete-task buttons and the Portal app icons, in place of the browser's plain `title` box (`src/components/ui/glass-tooltip.tsx`).

## [v0.6.7] - 2026-09-18 - Unload What You're Not Using

### Added

- **"Keep loaded in background" per Portal app** (on by default). Right-click an app's pill to turn it off, and once that app has been off screen for the unload delay its webview is closed, freeing its whole WebView2 process. Reopening it loads it again from its data folder, so it stays signed in. The menu item explains what is lost when an app closes (unsent drafts, scroll position, in-page state, the unread badge). "Keep live in background" is greyed out while an app is set to unload. Stored as `keepLoaded: false` in `crystal-os-portal-apps`, written only when off, so existing app lists load unchanged.
- **Settings → Performance.**
  - **Performance mode** (off by default, applies at once): Pulse, Engine, Horizon, Vault, Atmosphere, Archive and Settings load only when first opened; React Query drops unused data after 1 minute instead of 5 (per-query `staleTime` is unchanged, so a quick return does not refetch); page transitions, CSS animations and canvas backdrops are turned off, with loading spinners still turning. The Nebula, Terminal and Portal keep loading with the app and keep running in the background.
  - **Portal unload delay**, in seconds (default 60, 0 = as soon as you switch away, max 3600).
- **`portal_unload` command** (`src-tauri/src/portal.rs`). It holds the same lock as `portal_show` and refuses to close the app on screen, so an app reopened just as its timer fires is either kept or cleanly rebuilt, never left blank. The countdowns live in `src/lib/portalLifecycle.ts`.

### Performance

- **Views are code-split** (`src/lib/viewLoader.ts`). Outside performance mode every chunk is fetched while the app is idle after launch, so switching tabs still does not wait.
- **Hidden window, idle app.** Minimising the window or hiding it to the tray stops every backdrop's `requestAnimationFrame` loop (Nebula, Portal stars, Terminal static), freezes CSS animations (`html.app-hidden`), and marks React Query unfocused, which pauses `refetchInterval` polling such as the 10-minute weather refresh. Rust now emits `app://visibility` on show and hide (`src-tauri/src/window.rs`), because a window hidden with `hide()` does not reliably mark its document hidden. `src/lib/appActivity.ts` also checks the window's visibility at startup, for launches straight into the tray.
- **OS "reduce motion" now also skips the page slide** between tabs, not just the backdrops.
- **The Pomodoro timer polls once a second while the window is hidden** instead of four times; only the tray title shows the time then. It returns to four times a second when the window is shown.
- **The Home clock re-renders once a minute**, at the start of each minute, instead of every second.

### Fixed

- **Closing the window with × skipped the tray's memory trim.** `CloseRequested` called `window.hide()` directly instead of `window::hide`, so Portal apps kept their caches until the 30-second idle timer. It now takes the same path as the tray and hotkey.
- **`portal_rebuild` could race a show.** It ran outside the show/hide queue in `portalNative.ts`, so toggling **Keep live** during an app switch could close a webview between `portal_show` finding it and putting it on screen. It is now queued in order with show and hide, like the new unload.
- **Performance mode's 1-minute cache now covers data already loaded.** `setDefaultOptions` only reaches new queries and React Query never lowers a cached query's `gcTime`, so data loaded before the switch kept the 5-minute window. `src/lib/queryCacheTime.ts` retimes cached queries on every switch.
- **ESLint no longer scans build output** (`src-tauri/target`, `server-dist`), and the 8 remaining lint errors are fixed: typed Supabase rows in `AppContext.tsx`, no `any` in the Tasks drag handler, and type aliases for the empty `CommandDialogProps` and `TextareaProps` interfaces. The Home calendar range now derives from `today`, so its `useMemo` dependency is real.
- **CHANGELOG dates:** v0.6.4 and v0.6.5 are dated 2026-09-17, when they were released.

## [v0.6.6] - 2026-09-17 - Installers, New Portal Apps, Context Meter & A Readable Terminal

### Added

- **Settings → Install & update.** A new panel at the bottom of Settings lists every published release from `joezhuo2/crystal-os`, defaults to the newest stable one that has an installer attached, and saves that installer to your Downloads folder with a progress bar and a **Show in folder** button. A version picker lets you take any other release instead, including pre-releases and older versions; a release with no Windows asset is listed but cannot be downloaded. Releases are fetched and written in Rust (`src-tauri/src/installer.rs`) because `api.github.com` is deliberately absent from the webview's `connect-src`, and the webview cannot write to Downloads.
- **Build an installer from source, from inside the app.** The same panel runs `npm run build:desktop` in a Crystal OS checkout and streams the build log into a scrollable pane, with **Stop** to kill the whole process tree. Use it when a release has no attached installer, or to build ahead of the next release. The packaged app has no source of its own, so **Choose folder** points it at a checkout; the path is saved as `installerSourceDir` in `settings.json`, and a folder without a `build:desktop` script is rejected. Needs Node.js and the Rust toolchain on the machine.

- **Context meter in The Nebula.** The chat toolbar now shows how full the model's context window is: tokens in context after the latest step, the window size, and a fill bar that turns amber at 70% and red at 90%. Hover it for the exact count and model. High reads each main-thread step's `usage` from Claude Code's stream (input + cache read + cache write + output) and takes the window size from `result.modelUsage[model].contextWindow`, falling back to 1M for `[1m]` model ids and 200k for other Claude models; subagent steps are ignored because they run in their own context. Low and Medium take ACP `usage_update` (`used`, and `size` when dsh reports it); a model with no reported size shows the count without a fraction. The last reading is saved with the chat (`context` in `harness/chats/<id>.json`, optional, so older chat files still load).

### Changed

- **The Portal's preset apps are now LinkedIn, Spotify, Gmail, and Outlook** in place of WhatsApp, Messenger, Slack, and Telegram. Discord, Instagram, X, and Reddit are unchanged, and apps you had already connected are untouched — presets only seed the connect screen. Two of the new presets carry WebView2 limits worth knowing: Google blocks sign-in from embedded webviews, so Gmail may send you to a real browser for the password step, and Spotify's web player needs Widevine DRM that WebView2 does not ship, so it browses but does not play.

### Fixed

- **The Terminal rendered in the app's sans-serif font in packaged builds.** The root cause was the CSP, not the font. `index.html` carries an inline `<style>` for the boot splash, so at build time Tauri adds that block's hash to `style-src`. A CSP source list that contains a hash makes browsers ignore `'unsafe-inline'`, so the `<style>` element xterm injects at runtime (which holds the terminal's `font-family` and cell sizes) was blocked, and the grid inherited the body font. `dev:desktop` loads the page from Vite with no CSP at all, which is why only builds showed it. `app.security.dangerousDisableAssetCspModification` is now `["style-src"]`, so Tauri leaves `style-src` as written (`'self' 'unsafe-inline'`); `script-src` is still hashed as before.
- **Terminal font loading.** Cascadia Mono is now bundled with the app (`@fontsource/cascadia-mono`, latin + latin-ext + the box-drawing subset, regular and bold) rather than taken from the machine, and `TerminalPage` waits for the face to load before opening xterm. xterm measures the character cell once, inside `open()`, and keeps those metrics for the life of the terminal — opening before the font was ready measured the fallback and the whole grid stayed in it. Under `dev:desktop` the font was already warm by the time anyone reached the tab, which is why only builds showed it.
- **`portal_rebuild` was unreachable from the webview.** It was added in v0.6.5 and registered in `generate_handler!`, but never declared in `src-tauri/build.rs` or allowlisted in `capabilities/default.json`, so every call was rejected — which meant toggling **Keep live in background** never actually applied. Both lists now include it.

## [v0.6.5] - 2026-09-17 - Quieter in the Background

Crystal OS sitting in the tray with Discord and Instagram connected used about 2.0-2.5 GB across three separate WebView2 process trees, and 8–12% CPU. This release goes after both.

### Performance

- **Off-screen Portal apps now drop their render caches.** A Portal app that has been hidden for 30 seconds is put into WebView2's low memory mode, which frees renderer caches, decoded images, and GPU tiles while leaving its sockets, timers, and scripts running — so messages still arrive and unread badges stay current. It is restored before the app is shown again. The 30-second wait means opening a menu, or switching apps and coming straight back, never makes an app drop caches it is about to need (`src-tauri/src/portal/webview2.rs`, `src-tauri/src/portal.rs`).
- **Hiding the window to the tray trims everything at once,** including Crystal OS's own interface, which is the single largest page the app runs. With the window hidden there is nothing on screen to paint, so the 30-second wait is skipped (`src-tauri/src/window.rs`).
- **Portal apps are no longer exempt from background throttling by default.** Every app previously ran at full speed while hidden, which is where most of the idle CPU went. Apps are now throttled when off screen — slowed, but not suspended, so sockets stay open — unless you turn on the new keep-live setting.
- **Back/forward cache is off for Portal apps and the main window.** It keeps whole rendered pages in memory so the back button can restore them instantly, which is worth little for single-page sites and costs tens of megabytes each. Going back re-renders instead. The Portal's disk cache is also capped at 50 MB (`BROWSER_ARGS` in `src-tauri/src/portal.rs`, `additionalBrowserArgs` in `src-tauri/tauri.conf.json`).

### Added

- **"Keep live in background" per Portal app.** Right-click an app in the Portal navbar to toggle it. On, the app runs at full speed while hidden, which is what a voice call or a live notification stream needs; off (the default) it is throttled. WebView2 fixes this policy when a webview is built, so changing it rebuilds that app's webview — the app's data folder is untouched, so it stays signed in.
- **`portal_rebuild` command.** Closes a Portal app's webview without touching its data folder, so the next show builds a fresh one. Reloading the page is not enough for settings WebView2 only reads at build time.

### Fixed

- `src-tauri/Cargo.toml` had drifted to `0.6.3` while `package.json` and `tauri.conf.json` were at `0.6.4`. All three now agree.

### Known limitation

Each Portal app still uses its own WebView2 data folder, so each one runs a full browser process tree of its own — a separate GPU process, manager, and network, storage, and audio utilities. Measured across Crystal OS, Discord, and Instagram, those duplicated GPU processes alone accounted for roughly 1.2 GB of the 2.0 GB total. Collapsing them into one shared process tree needs per-app WebView2 profiles, which neither wry 0.55 nor Tauri 2.11 currently exposes; the alternative of simply sharing one data folder would break signing out of, or removing, a single app without affecting the others. This is not addressed in this release.

## [v0.6.4] - 2026-09-17 - Self-Hosted Fonts & Clean Builds

### Changed

- **Inter font is now self-hosted via `@fontsource-variable/inter`.** The Google Fonts CDN link in `index.html` was removed because the desktop app's Content Security Policy blocks it, causing the app to silently fall back to the system font. The variable font is now bundled and loaded locally, so the exact same typography renders in both the web and desktop builds. Font references in `tailwind.config.ts`, `src/index.css`, and `index.html` (boot splash) were updated to `Inter Variable` first, with `Inter` as fallback.

### Added

- **`prune:bundles` script.** `npm run build:desktop` now runs `prune:bundles` first, which removes stale MSI and NSIS installers from previous versions in `src-tauri/target/release/bundle/`. Without this, each build left ~70 MB of old installers. The script keeps only installers matching the current `package.json` version.
- **`@fontsource-variable/inter` dependency** (v5.3.0) for self-hosted variable Inter font.

### Removed

- Google Fonts preconnect and stylesheet links from `index.html`.

## [v0.6.3] - 2026-09-17 - Lighter Load

### Fixed

- **Tasks and transactions past the first 1000 now load.** The dashboard fetched each table in one query, and Supabase caps a response at 1000 rows, so anything past that never appeared. Both tables now load in pages of 500 until every row is in (`src/lib/pagedLoad.ts`).

### Performance

- **The dashboard renders after the first page.** `AppContext` shows the app once categories, settings, and the first page of tasks and transactions have arrived, and the remaining pages fill in behind it. Pages are fetched by id after the last row seen, not by offset, so a task added or deleted during loading cannot make a row get skipped or show up twice. Each page is merged in the same order the old query used: tasks earliest first, transactions newest first. If a page fails, the rows already loaded stay on screen and a toast says the list is incomplete. The full history still ends up in memory, because the Financials charts and the Home totals are calculated from every transaction.
- **Desktop sidecar bundle: 13.5 MB to about 650 KB.** `googleapis` bundled a generated client for every Google API, and the calendar only uses Calendar v3 and OAuth2. It has been replaced with `google-auth-library` and direct REST calls through `OAuth2Client.request`, which still refreshes the access token and retries failed read and delete requests (`server/calendar/events.ts`, `server/calendar/oauth.ts`).
- **The server vault cache drops deleted notes.** `listNotes` in `server/obsidian/vault.ts` cached every note it parsed but never removed any, so deleted and renamed notes stayed in memory until the process exited. Each listing now removes cache entries for files that are gone, and `readNote` removes a note it can no longer find. The desktop vault already did this.
- **Dismissed toasts are removed after 1 second.** They used to stay in state for about 16 minutes (`TOAST_REMOVE_DELAY` in `src/hooks/use-toast.ts`). One second is enough for the close animation.

## [v0.6.2] - 2026-09-17 - Portal Focus

### Fixed

- **The Portal's right-click menu keeps the page visible.** Opening a pill's context menu (or any dialog over The Portal) used to swap the app's page for a large app icon, because the native webview has to be hidden before HTML can draw over it. The page is now captured first with WebView2's `CapturePreview` and shown as a still picture behind the menu. When the menu closes, the live page comes back without a fade. If the capture fails or takes over 800 ms, or the page is still loading, the old icon placeholder is used (`portal_snapshot` in `src-tauri/src/portal.rs`, `snapshotAndHidePortal` in `src/lib/portalNative.ts`).
- **Portal shortcuts work while typing in an app.** Keys pressed inside Discord, Instagram, or another app page went to that page, so **Ctrl+Tab**, **Ctrl+Shift+Tab**, **Ctrl+W**, and **Ctrl+R** only worked after clicking Crystal OS's own UI. Each app webview now catches those combos with WebView2's `AcceleratorKeyPressed` event before the page sees them and sends them to The Portal as `portal://shortcut` events (`src-tauri/src/portal/webview2.rs`).
- **The toggle hotkey hides the window after you click into a Portal app.** `Alt+Space` checked whether the window had focus, and a Portal app page taking keyboard focus made that check fail, so the hotkey kept trying to show a window that was already in front. You had to Alt+Tab away and back before it would hide. It now checks whether Crystal OS is the foreground window (`window::is_foreground` in `src-tauri/src/window.rs`).
- **Keyboard focus lands somewhere useful.** Showing the window with a hotkey or the tray now focuses the Portal app on screen, or the main page when no app is shown, so typing and shortcuts work without a click. When a menu or dialog hides a Portal app, focus moves to the main page so the menu and dialog respond to the keyboard.

## [v0.6.1] - 2026-09-17 - Crystal Archive

### Added

- **The Archive has its own crystal theme.** The tab now looks like a dark amethyst cave instead of the default indigo glass (`src/components/layout/ObsidianBackdrop.tsx`, `src/index.css`).
  - **Crystals from the edges.** 32 glass crystals in five faceted shapes grow in from the four corners and edges when the tab opens, then drift slowly along their own axis. Each has a resting opacity between 0.3 and 0.9. Every crystal points into the screen, and its flat base always sits past the edge, at any window size. The layout is seeded, so it is the same on every visit (`src/lib/obsidianScene.ts`).
  - **Sparkles.** Four-point stars twinkle at random positions in the background, and one sits near the tip of each crystal, on top of the glass.
  - **Cursor light.** A violet aura follows the pointer, breathing between 0.5 and 0.8 opacity, and fades out when the pointer leaves the window.
  - **Crystals reflect the light.** A crystal near the pointer gets a brighter rim, a halo, and a stronger glass `backdrop-filter` (brightness, saturation, contrast) with a glint that sits where the pointer is. The effect grows as the pointer gets closer, and is measured along each crystal's own tilt.
  - **Themed page and sidebar.** Panels, tag chips, the note list, the note reader's tags, the Quick Add and vault buttons, the page title, and the sidebar all switch to violet on this tab.

### Performance

- **Pointer tracking without React renders.** One `pointermove` listener schedules at most one animation frame. The frame reads every crystal's position first and then writes CSS custom properties (`--obsidian-mx`/`--obsidian-my` on the backdrop, `--lit`/`--lx`/`--ly` on each crystal), skipping crystals that stay dark. The CSS maps those properties to `transform` and `opacity`, and every animation (float, twinkle, grow, breathe, haze drift) uses only those two, so the compositor does the work. The stronger reflection layer is hidden while its crystal is dark, so its filter only runs near the pointer. No canvas, WebGL, or 3D library is used.
- **Reduced motion.** With reduced motion on, the crystals, sparkles, haze, and aura stop animating. The cursor light and reflections still follow the pointer.

## [v0.6.0] - 2026-09-17 - The Nebula

### Added

- **The Nebula: a coding agent in its own tab (desktop).** Pick or create a project folder, open chats under it, and ask an agent to read, change, and run things in that folder. The tab sits above The Portal in the sidebar and in the command palette. Design and spike results are in `docs/adr/0003-nebula-deepseek-harness.md`.
  - **Three model tiers per chat.**
    - **Low** uses OmniRoute `auto/coding`.
    - **Medium** uses the first NVIDIA NIM model that answers, in this order: Kimi K3, DeepSeek V4 Flash, Nemotron 3 Ultra, then OmniRoute. A model is skipped for a minute if it has no key, is missing from the endpoint's model list, or fails before producing output; the turn then moves to the next model, with a note in the chat.
    - **High** runs Claude Code on your own Anthropic account, even when `~/.claude/settings.json` routes Claude Code through a gateway.
    - Low and Medium share one DeepSeek Harness session. Switching to or from High hands over a summary of the conversation, marked by a divider.
  - **Effort and modes like Claude Code.**
    - Effort is low, medium, high, extra high, or max, and applies to Claude Code on High.
    - Modes are **Auto** (runs tools without asking; a small amber dot marks it), **Manual** (an Allow once / Deny card for each tool request, on every tier), and **Plan** (reads and plans only; changes are refused).
    - Tier and effort are locked while a turn runs; mode changes take effect immediately.
  - **Your Claude skills and MCP servers come along.**
    - DeepSeek chats get the skills from `~/.claude/skills` and enabled plugins, and the local MCP servers from Claude Desktop, Claude Code, and enabled plugins. Each server can be turned off in Settings.
    - A server that fails to start no longer blocks the chat: the chat opens without MCP servers and a banner says so.
    - claude.ai connectors cannot be shared, because they sign in on claude.ai.
  - **Stop a running turn.** While the agent works, the send button turns into a red Stop button, and Esc stops from anywhere on the tab. The agent is asked to cancel; if it has not stopped within 3 seconds, or you press Stop again, its process is ended. Pending approval cards are cancelled, unfinished tool calls are marked failed, and the chat says "Stopped." instead of showing an error or trying the next model.
  - **Chat history.**
    - Click a project folder to open a new chat in it (an unused one is reused). The arrow next to it collapses and expands the folder.
    - Chats are grouped by project, pinned first, then newest. They can be renamed, pinned, and deleted. Removing a project leaves its folder alone.
    - Transcripts, including tool calls and approvals, are saved after every message and reopen after a restart. Sessions resume where they left off.
  - **Token counts per model.** The toolbar shows this chat's total, or the project's total while the chat is still empty. Its popover breaks usage down per model, for the chat, its project, and all time, with a reset. Project totals are kept when chats are deleted and are rebuilt from saved chats the first time this version starts. Claude counts are exact. DeepSeek Harness only reports context size, so those counts are estimates, marked with ≈.
  - **Model names come from your settings.** Badges, skip notices, token rows, and the Medium tooltip show the model ids you configured, so a slot you changed (for example to `z-ai/glm-5.3`) is never reported under its default name. Saving settings warns when NVIDIA NIM does not list a Medium model id, since Medium would otherwise skip it silently. Turns no longer end after 60 seconds: a prompt waits as long as the agent works.
  - **No search bar on this tab.** Like Terminal and The Portal, The Nebula hides the global search bar and ignores its shortcuts, including the global palette hotkey.
  - **A swirling nebula.**
    - The background is a WebGL nebula that blends three colours you choose and turns at a speed you set, with optional twinkling four-point stars at a density you set. Change it from the gear in the tab or in Settings.
    - It pauses when hidden and draws a still frame when reduced motion is on.
    - It releases its GPU context when you leave the tab, and falls back to CSS gradients when WebGL is unavailable.
  - **Settings → The Nebula.**
    - NVIDIA NIM and OmniRoute API keys: write-only, stored in Crystal OS's own DeepSeek Harness folder, never shown again.
    - Endpoints and model ids for every tier, and the High tier's Claude model.
    - The projects folder.
    - The MCP server list.
    - The nebula look.
- **DeepSeek Harness runtime.** The first visit offers to install `@deepseek-ai/dsh@0.1.5-rc.1` with npm into `%APPDATA%\com.crystalos.desktop\dsh` (needs Node.js 22+). It never touches `~/.dsh`. The version is pinned in `src-tauri/src/harness/mod.rs` because the harness is a developer preview.
- **Native harness module** (`src-tauri/src/harness/`). Twenty new commands:
  - spawn one DeepSeek Harness process per project folder and one Claude Code process per High chat;
  - pass the processes' output to the page line by line;
  - store chats with atomic writes.

  Every child process joins a Windows Job Object, so agents, their MCP servers, and anything they started end when Crystal OS exits or the page reloads. Claude Code's argument list is built only from validated enums, ids, and paths, never prompt text, and every `ANTHROPIC_*` / `CLAUDE*` variable is removed from its environment. API keys and MCP server environment values stay in Rust.

## [v0.5.6] - 2026-09-16 - Portal keyboard shortcuts

### Added

- **Browser-style tab shortcuts for The Portal (desktop).** Three keyboard shortcuts work while a Portal app is on screen, matching common browser conventions: **Ctrl+Tab** cycles to the next connected app, **Ctrl+Shift+Tab** cycles to the previous one (wrapping at both ends), **Ctrl+W** opens the **Remove…** confirmation for the active app, and **Ctrl+R** reloads it. These only fire when the Portal is the active tab, no overlay is open, and the focus is not inside a text field. `Ctrl+R` in particular prevents Tauri's default behaviour of reloading the whole app, which used to drop you back on the Home tab while the child webview stayed visible over the page (`src/components/views/PortalPage.tsx`).

### Changed

- **Confirm dialog state lifted from navbar to page.** The `sign out` / `remove` confirmation dialog state was moved out of `PortalNavbar` and into `PortalPage`, so both the right-click context menu and the new keyboard shortcuts can open it. The navbar now receives `confirm` and `onConfirmChange` as props (`src/components/portal/PortalNavbar.tsx`).

## [v0.5.5] - 2026-09-15 - Locked page scrolling

### Fixed

- **The window no longer scrolls into empty space.** Nothing pinned the app's height before: `html` and `body` rolled freely and the tab's `<main>` panel could not shrink (it is a flex item whose `min-height: auto` keeps it as tall as its content), so whenever a page's content was taller or wider than the viewport the *whole window* scrolled — up, down, and sideways into blank space — instead of the panel scrolling. `html` and `body` are now `overflow: hidden` (`src/index.css`), the app shell is a fixed `h-screen` frame (`src/pages/Index.tsx`), and `<main>` is `min-h-0` so it carries the scrolling. Every tab now scrolls inside its own content area: long pages scroll in the content panel, the Tasks board keeps its own horizontal scroll, and the sidebar and search bar stay put.
- **Terminal and Portal frames fit the shell.** Their heights were sized for the old, unbounded layout and are now set to the shell's real content box (`calc(100vh - 4rem)` on desktop, `calc(100vh - 7rem)` on mobile), so no residual scrollbar sits between them and the window edge.

## [v0.5.4] - 2026-09-15 - Themed app pill hover

### Changed

- **Portal app pills light up in the theme colours on hover.** Hovering an app pill in the Portal navbar now gives it a gradient border running between the theme's two accent colours, a glow around the pill, and theme-tinted text with a soft glow: lavender for **Void swirl**, gold for **Event horizon**, and ice blue for **Stargate blue**. The app's icon glows too. Before, hover only brightened the text and faintly tinted the border. The active pill keeps its own style, and the Back / Forward / Reload / Open in browser buttons are unchanged. Each theme defines a new `--portal-hover-text` colour (`src/index.css`).
- **Themed navbar tooltips.** Every tooltip in the Portal navbar was the system tooltip. They are now small cards in the Portal theme: gradient border, glow, and the label in the theme's text colour. App pills show the app name with "Right-click for options, drag to reorder" below it (in the web build, "Opens in a new tab"); **Connect an app**, **Back**, **Forward**, **Reload**, and **Open in browser** show their names. Tooltips always open above the control, over the page header, because the app's webview draws above anything placed below the navbar. The browser-control tooltips line up with their button's right edge so they stay inside the window. All use a new `PortalTip` helper (`src/components/portal/PortalNavbar.tsx`).

## [v0.5.3] - 2026-09-15 - Home shortcut

### Added

- **Clickable sidebar logo.** The Crystal OS mark at the top left of the sidebar (the "C" when collapsed, the full name when expanded) is now a button that opens **The Pulse** (home) from any page, including Terminal and Portal. It has a hover fade, a keyboard focus ring, and a "Go to home" label for screen readers (`src/components/layout/Navigation.tsx`).

## [v0.5.2] - 2026-09-15 - Loading screens

### Added

- **Start-up splash.** The window no longer opens on an empty screen. `index.html` now contains a "Crystal OS / Loading…" splash (a crystal mark, the name, and a sweeping progress bar) that paints before the app bundle loads. React replaces it on its first render, and `AppSplash` (`src/components/layout/AppSplash.tsx`) shows the same splash while the saved session is restored, replacing the old spinner. The native window also gets a dark `backgroundColor` in `tauri.conf.json`, so there is no white frame before the page draws. Animations stop under *reduce motion*.
- **Portal loading skeleton.** While an app's page loads, the Portal frame shows a skeleton of a web app (icon rail, list column, message area) tinted by the current Portal theme, with a "Loading <app>…" badge (`src/components/portal/PortalSkeleton.tsx`). It replaces the "Opening <app>…" spinner.

### Changed

- **Portal webviews stay hidden until their page has loaded** (`src-tauri/src/portal.rs`). Before, a new app showed WebView2's dark background until the site painted. A webview is now hidden on creation and on **Reload**, **Back to home page**, and **Sign out**, and shown (with the usual fade-in) when the page-load hook reports the page finished, provided that app is still the one on screen. A 20-second timeout (`LOAD_TIMEOUT`) shows it anyway if the page never finishes. **Back** and **Forward** do not hide the app.

## [v0.5.1] - 2026-09-15 - Terminal tabs

### Added

- **Up to 5 terminals in parallel.** The Terminal page has a tab strip above the frame (`src/components/views/TerminalPage.tsx`): one tab per shell, **+** to open another, **×** or middle-click to close one, and an `n/5` counter. Each shell runs on its own pseudoconsole and keeps running while another tab (or another page) is shown, so a long build in one tab does not block the others. The last remaining terminal cannot be closed. Returning to the Terminal page selects the tab used last.
- **Tab shortcuts** while a terminal has focus: **Ctrl+Shift+T** opens a tab, **Ctrl+Shift+W** closes the current one, **Ctrl+Tab** / **Ctrl+Shift+Tab** cycle through tabs.
- New commands `terminal_list`, `terminal_open`, and `terminal_close`, each allowlisted in `capabilities/default.json`. `terminal_open` refuses a sixth shell (`MAX_SESSIONS` in `src-tauri/src/terminal.rs`, mirrored as `MAX_TERMINALS` in `src/lib/terminalNative.ts`).

### Changed

- `terminal_attach`, `terminal_restart`, `terminal_write`, and `terminal_resize` now take the shell's `id`. `terminal_attach` no longer starts a shell; the page lists running shells and opens one only when there are none. **Refresh** restarts only the selected shell and keeps its tab position.
- Output events are routed per shell by a new `TerminalHub` in `terminalNative.ts`, which holds a new shell's early output until its view attaches and drops events from closed or refreshed shells. `TerminalStream` now handles a single session only.
- All running shells are killed when the app quits.
- Tests: `terminalNative.test.ts` covers routing between shells, early output, Refresh, and remounting (8 tests); `terminal.rs` adds a test for the session limit.

## [v0.5.0] - 2026-09-14 - The Portal

### Added

- **The Portal.** A new sidebar tab (orbit icon, above Terminal) that runs external web apps such as Discord and Instagram as real, signed-in pages inside Crystal OS (`src/components/views/PortalPage.tsx`). Its own navbar across the top holds one pill per connected app, a **+** to connect more, and **Back / Forward / Reload / Open in browser** for the app on screen. The palette has an **Open The Portal** row.
  - **Connecting apps.** **+** opens a dialog with eight presets (Discord, Instagram, WhatsApp, Messenger, X, Reddit, Slack, Telegram) and a **Custom app** form that takes a name and any `https://` address. With no apps yet, the page shows the presets directly. Google sites and Spotify are not offered: Google blocks sign-in inside embedded webviews, and WebView2 has no Widevine DRM for Spotify playback.
  - **Managing apps.** Drag pills to reorder them. Right-click a pill for **Reload**, **Back to home page**, **Open in browser**, **Sign out…** (clears that app's cookies and storage only), and **Remove…** (also deletes its saved data). Both destructive actions ask first. The list, order, and last app used are saved in localStorage (`crystal-os-portal-apps`, `crystal-os-portal-active`).
  - **Stays signed in and running.** Each app is a native child webview of the main window (`src-tauri/src/portal.rs`) with its own data folder in `%APPDATA%\com.crystalos.desktop\portal\<app id>\`, so sessions survive restarts and never mix. Apps load on the first Portal visit of a session and then keep running while you use other tabs, so calls and message sockets stay connected. Switching apps fades the current page out and the next one in.
  - **Unread badges.** Counts are read from page titles (`(3) Discord`, or a dot for `• Discord` / `* Slack`) and shown on each pill, with the total on the sidebar Portal button on every tab.
  - **Themes.** The Portal restyles the whole window while it is open: backdrop, sidebar, navbar, and an animated gradient ring around the app. Pick one of three in **Settings → The Portal**: **Void swirl** (default; violet and cyan nebula), **Event horizon** (black with a pulsing amber accretion ring), or **Stargate blue** (navy ripples, electric-blue shimmer, twinkling stars). Saved as `crystal-os-portal-theme`. Animations stop under *reduce motion*.
  - **Web build.** The tab still manages the app list, but clicking an app opens it in a new browser tab, with a note that embedding needs the desktop app (these sites refuse to load inside another page).
  - New commands: `portal_show`, `portal_hide`, `portal_fade_out`, `portal_nav`, `portal_open_external`, `portal_sign_out`, `portal_remove`, `portal_prune`, each allowlisted in `capabilities/default.json`. The capability has no remote entry, so the loaded sites cannot call any of them. App ids are checked (`[a-z0-9-]`, since they name folders) and only `https` addresses are accepted. Links a site opens to other domains go to the default browser; the site's own popups (sign-in flows) stay in the app.
  - Tests: `src/lib/portalApps.test.ts` and `src/lib/portalStore.test.ts` (25), plus 4 Rust tests in `portal.rs`.
- **Terminal look.** While the Terminal tab is open, the window turns black with a flickering static backdrop (`src/components/layout/TerminalStatic.tsx`), the shell sits in a glitching monochrome frame, and the sidebar and header switch to a matching monochrome style.

### Changed

- **The search bar is hidden on the Terminal and Portal tabs.** On the Portal it would open underneath the app, which draws above the page.
- Tauri's `unstable` feature is enabled, which child webviews need. With child webviews attached, Tauri no longer treats the main window as a webview window, so `window.rs` (hotkey and tray show/hide) and `pick_vault` now use the plain `Window` type.
- Tray **Quick Add** hides the Portal's app while its dialog is open, so the dialog is visible.

### Fixed

- The active-tab highlight in the collapsed sidebar is centred on its icon. The icon used to sit 12px from the highlight's left edge and 4px from its right.

## [v0.4.6] - 2026-09-14 - Terminal

### Added

- **Terminal tab (desktop).** A terminal icon above Settings in the sidebar opens a PowerShell terminal inside Crystal OS (`src/components/views/TerminalPage.tsx`). It uses xterm.js on a real Windows pseudoconsole (`portable-pty`), so colours, tab completion, history, and prompts that ask for input all work. PowerShell 7 (`pwsh`) is used when installed, otherwise Windows PowerShell. The palette has an **Open Terminal** row. The web build does not show the tab.
- **Refresh.** Programs installed after Crystal OS started are not on the shell's PATH, because a child process copies the app's environment from launch time. **Refresh** starts a new shell with PATH and the other variables read again from the registry (machine, then user).
- The shell keeps running while you use other tabs; coming back redraws the last 256 KB of output. Ctrl+C copies when text is selected and interrupts otherwise; Ctrl+V pastes. Ctrl+K and Escape go to the shell while the terminal has focus.
- New commands: `terminal_attach`, `terminal_restart`, `terminal_write`, `terminal_resize` (`src-tauri/src/terminal.rs`), each allowlisted in `capabilities/default.json`. The shell is killed when the app quits.

## [v0.4.5] - 2026-09-14 - Settings Page

### Added

- **Settings page.** A gear pinned to the bottom of the sidebar opens **Settings** (`src/components/views/SettingsPage.tsx`) with every desktop preference in one place: both global hotkeys, **Launch at login**, and the vault folder. On the web it lists the in-app shortcut and notes that the rest lives in the desktop app.
- **Search bar hotkey.** `Alt+Shift+Space` (desktop, global) shows Crystal OS and focuses the search bar. Saved as `paletteShortcut` in `settings.json`; the two global hotkeys cannot share a combo.
- **`Cmd/Ctrl + K`** focuses the search bar while Crystal OS is focused, on web and desktop. The bar shows the shortcut until focused.

### Changed

- **`Alt+Space` only shows or hides the window.** It no longer opens the search bar. A combo saved before this release (`globalShortcut`) keeps working for show/hide.
- `set_global_shortcut` takes an `action` (`"toggle"` or `"palette"`), `get_global_shortcut` and `set_global_shortcut` return both statuses, and `pause_global_shortcut` releases both combos while one is being recorded.
- The palette's **Change global hotkey** and **Change vault folder** rows are replaced by a single **Open Settings** row. **Launch at login** moved from the hotkey dialog to Settings.

## [v0.4.4] - 2026-09-13 - Always-On Hotkey

### Added

- **Launch at login (desktop).** The global hotkey used to work only after you opened Crystal OS yourself. Now the packaged app registers itself to start at sign-in (`tauri-plugin-autostart`; the `HKCU\...\Run` key on Windows, a LaunchAgent on macOS) with `--hidden`, so it waits in the tray and `Alt+Space` works right after login. On by default, and re-applied on every launch so the entry survives a reinstall. **Launch at login** in the **Change global hotkey** dialog turns it off; the choice is saved as `launchAtLogin` in `settings.json`. New commands: `get_launch_at_login`, `set_launch_at_login` (`src-tauri/src/autostart.rs`). Debug builds never register.
- **Single instance.** Opening Crystal OS while it is already running (for example from the Start menu while it sits in the tray) shows the existing window instead of starting a second process that could not claim the hotkey (`tauri-plugin-single-instance`).

### Changed

- **Closing the window hides it to the tray instead of quitting**, so the hotkey stays live. **Quit Crystal OS** in the tray still exits and stops the sidecar.
- The main window is created hidden (`"visible": false`) and shown in `setup` unless the app was started with `--hidden`, so a login launch never flashes the window.

## [v0.4.3] - 2026-09-13 - Native Vault

### Added

- **Native vault access (desktop).** The Archive, the home vault widget, the palette's note results, and Quick Add now read and write your Obsidian vault through Rust (`src-tauri/src/vault.rs`) instead of the sidecar's `/api/obsidian` routes. The desktop app no longer needs `OBSIDIAN_VAULT_PATH`.
  - **Commands.** `list_vault` returns every note's path, `mtime`, and size. `read_vault_file` and `write_vault_file` read and write one note. `watch_vault` restarts the file watcher. `get_vault_status` and `pick_vault` report and change the vault folder. Errors come back as `{ code, message }` with a stable code: `not_configured`, `missing`, `permission_denied`, `not_found`, `invalid_path`, `conflict`, or `io`.
  - **Folder picker.** On first launch, The Archive shows **Choose vault folder**, which opens the system folder dialog from Rust (`tauri-plugin-dialog`). The folder is saved as `vaultPath` in `%APPDATA%\com.crystalos.desktop\settings.json` and loaded at startup. **Choose / Change vault folder** in the command palette switches vaults later and shows the current folder.
  - **Live updates.** A recursive watcher (`notify-debouncer-mini`, 250 ms) emits `vault://changed` with the changed note paths. `useVaultLiveUpdates`, mounted once in `Index.tsx`, refetches every vault query, so edits, renames, and deletions made in Obsidian appear without a refresh.
  - **Incremental reads.** `src/lib/vaultNative.ts` caches parsed notes by `mtime` and only re-reads files whose `mtime` changed, 16 at a time. Frontmatter is parsed with `js-yaml`, since `gray-matter` needs Node; invalid YAML is ignored instead of hiding the note.
  - **Safe quick add.** Writes go to a temp file (`.<name>.crystal-tmp`) that is then swapped in, falling back to an in-place write if Windows refuses the swap. Each write sends the `mtime` it read. If Obsidian saved the note in between, Rust returns `conflict` and the append is redone on top of the new content, up to three attempts.
- **Error states in The Archive (desktop).** A saved folder that is gone at startup, for example renamed or on an unplugged drive, shows **Vault folder not found** with **Choose vault folder** and **Retry**. An unreadable folder shows **Vault folder is not readable**. The watcher restarts when the folder is reachable again. A note deleted while open shows **This note is gone** with **Close note**, instead of a generic error. These errors are not retried automatically.
- **`src/lib/vaultCore.ts`.** Note parsing, search ranking, tag filtering, frontmatter tag upsert, and quick-add formatting (`planQuickAdd`, `queryNotes`, `normalizeNotePath`), with no Node imports. Both the Node middleware and the desktop client use it.
- **`src-tauri/src/settings.rs`.** Shared read-modify-write access to `settings.json`, used by the hotkey (`globalShortcut`) and the vault (`vaultPath`). Writes hold a lock so the two cannot overwrite each other's key.

### Changed

- **The webview can only call app commands it is granted.** `build.rs` now declares every app command, and `src-tauri/capabilities/default.json` allowlists each one (`allow-list-vault`, `allow-get-global-shortcut`, and so on). The webview still has no fs, shell, or dialog plugin permissions. The vault commands accept only `.md` paths inside the picked folder: `..`, absolute paths, drive letters, NTFS stream names, `.obsidian`/`.trash`/`.git`/`node_modules`, and symlinks or junctions that lead outside are all refused. Tauri 2 has no fs allowlist in `tauri.conf.json`, so the scope is enforced in `vault.rs` and in the capability file.
- **`server/obsidian/vault.ts` and `plugin.ts` delegate to `vaultCore.ts`.** The API and responses are unchanged. `appendToNote` now writes the note in one call rather than a frontmatter write followed by an append.
- `hotkey.rs` reads and writes `settings.json` through `settings.rs`.

### Notes

- The web app and `npm run dev` still use the `/api/obsidian` middleware and `OBSIDIAN_VAULT_PATH`. The sidecar still serves those routes, but the desktop Archive no longer calls them.
- New dependencies: `tauri-plugin-dialog` and `notify-debouncer-mini` (Rust), `js-yaml` (npm), and `tempfile` for Rust tests.
- Tests: 9 Rust unit tests in `vault.rs` (path normalisation, escape attempts, ignored folders, stale-write conflicts, deleted notes, missing root, symlink escape, watcher filtering), plus `src/lib/vaultCore.test.ts` and `src/lib/vaultNative.test.ts`. Vitest: 152 passing.
- Not yet verified in a running desktop window.

## [v0.4.2] - 2026-09-13 - Tray Menu

### Added

- **System tray (desktop).** Crystal OS now has a tray icon with a menu: **Show / Hide Crystal OS**, a Pomodoro section, **Quick Add…**, and **Quit Crystal OS**.
  - **Icons.** Windows and Linux show a colour gem (`src-tauri/icons/tray/tray-color.png`, 32px). macOS uses a monochrome template image (`tray-template.png`, 44px for Retina) so the menu bar tints it for light and dark mode. Both are rasterised from the SVGs beside them with `tauri icon`.
  - **Clicks.** On Windows, left-clicking the icon shows or hides the window and right-clicking opens the menu. On macOS any click opens the menu. Show/Hide checks whether the window is on screen, not whether it has focus, because clicking the tray takes focus away from the window.
  - **Pomodoro.** A disabled status row shows the phase and time left (`Focus 24:12`, or `Focus 25:00 (paused)`). **Start** relabels itself **Pause** while the timer runs. **Reset** restores the current phase's full length. The tray tooltip shows the same countdown and updates every second.
  - **Quick Add…** shows and focuses the window, then opens the existing Quick Add dialog with an empty draft. Signed out, it just shows the window.
  - **Quit** exits the app; the sidecar is still killed on exit.
  - **IPC.** Tray → Rust → webview event → store. Rust emits `tray://pomodoro` (`"toggle"` or `"reset"`) and `tray://quick-add`. `src/lib/tray.ts` applies them and pushes `{ label, tooltip, running }` back through the `update_tray_pomodoro` command whenever that view changes. Rust keeps no copy of the countdown. The bridge starts in `main.tsx`, outside React, so it works on the login screen and on every page.
  - **Failure is not fatal.** If the tray cannot be created, the error is logged and the window and hotkey work as before.
- **`src-tauri/src/window.rs`.** Show, hide, and on-screen checks shared by the hotkey and the tray. The hotkey's toggle behaviour is unchanged.

### Changed

- **The Pomodoro timer keeps running when you leave the Tasks page.** Its state moved out of `PomodoroTimer.tsx` into a module-level store (`src/lib/pomodoro.ts`, read with `usePomodoro`). Previously navigating away unmounted the component and threw the countdown away.
- **The Pomodoro countdown no longer drifts.** Time left is computed from a wall-clock deadline instead of subtracting one second per `setInterval` tick, which a throttled background webview could delay. Covered by `src/lib/pomodoro.test.ts` and `src/lib/tray.test.ts`.

### Notes

- Closing the window still quits the app rather than hiding it to the tray.
- The web app is unchanged. `initTrayBridge()` and `useTrayQuickAdd` are no-ops outside Tauri and load `@tauri-apps/api` only through dynamic imports.

## [v0.4.1] - 2026-09-13 - Global Hotkey

### Added

- **Global hotkey (desktop).** `Alt+Space` summons Crystal OS from any app and opens the existing command palette with its input focused and any previous query selected. Pressing it again while Crystal OS has focus hides the window. There is no second palette: the hotkey drives `CommandPalette.tsx`.
  - **Toggle.** A hidden or minimised window is restored, centred, shown, and focused. A window that is visible but behind another app is focused where it is, not moved. The window only hides when it already has focus.
  - **Registered in Rust at startup** (`src-tauri/src/hotkey.rs`, via `tauri-plugin-global-shortcut`), so the combo works before the webview has loaded or anyone has signed in. Rust emits `palette://open` after showing the window; `useGlobalHotkey` (`src/hooks/useGlobalHotkey.ts`) listens for it.
  - **Configurable.** "Change global hotkey" in the palette (desktop only, also found by typing "hotkey") opens a dialog that records a new combo. At least one of Ctrl, Alt, Shift, or Win is required, except for F-keys. The current combo is released while the dialog is open, so pressing it there is captured rather than hiding the window. **Reset to Alt + Space** restores the default.
  - **Persisted** as `globalShortcut` in `%APPDATA%\com.crystalos.desktop\settings.json`, next to the sidecar's `.env.local`. Other keys in that file are preserved. A combo is only saved once it registers, so the file never holds one that failed.
  - **Registration failure does not crash the app.** If another app already owns the combo at startup, Crystal OS starts normally, logs a warning, and shows a toast once the palette mounts; the palette row reads "not registered". If a new combo fails in the dialog, the error is shown inline and as a toast, and the previous combo is re-registered.
- **`src/lib/hotkey.ts`.** `acceleratorFromEvent()` turns a `keydown` into the plugin's accelerator format using `KeyboardEvent.code`, so the combo does not depend on keyboard layout. `formatAccelerator()` renders it for display (`Ctrl+Super+KeyK` becomes `Ctrl + Win + K`). Covered by `src/lib/hotkey.test.ts`.

### Notes

- There is no tray icon yet (planned for 1.3), so a window hidden with the hotkey can only be brought back with the hotkey. Closing the window still quits the app.
- The web app is unchanged. `useGlobalHotkey` is a no-op outside Tauri and loads `@tauri-apps/api` only through dynamic imports.

## [v0.4.0] - 2026-09-12 - Desktop App

### Added

- **Desktop app (Tauri 2).** `npm run dev:desktop` opens Crystal OS in a native window on the Vite dev server. `npm run build:desktop` produces a Windows installer. The web commands are unchanged and need no Rust. The reasoning is recorded in `docs/adr/0001-desktop-shell.md`.
  - **`crystal-api` sidecar.** The packaged app has no Vite server, so the vault and Google Calendar middleware ship as a Node single-executable (`scripts/build-sidecar.mjs`). Tauri launches it on `127.0.0.1:8787` and kills it on exit. It keeps the Supabase-JWT gate on every route and accepts cross-origin requests only from the Tauri webview. It reads `.env.local` from `%APPDATA%\com.crystalos.desktop\`.
  - **`src/lib/platform.ts`.** `isDesktop()`, `apiUrl()`, and `openExternal()`. `apiRequest` routes through `apiUrl`, so only the packaged app talks to the sidecar. The module has no top-level Tauri import, so the web bundle does not carry it.

### Changed

- **Google Calendar Connect opens the system browser on desktop.** Google refuses OAuth inside embedded webviews. The web app still navigates in place.
- **`server/obsidian/plugin.ts` and `server/calendar/plugin.ts` export `createObsidianMiddleware` and `createCalendarMiddleware`.** The Vite plugins and the sidecar share one implementation. Web behaviour is unchanged.

## [v0.3.2] - 2026-09-12

### Added

- **Escape closes overlays.** Pressing `Escape` now dismisses the event form and day panel in The Horizon, the transaction drawer in Financials, the task form in Tasks, and the category manager in both. Previously only the command palette, the Pomodoro timer, and the field-control popups responded to it; every other overlay had to be closed with its button or backdrop.
  - **`useEscapeKey`** (`src/hooks/useEscapeKey.ts`) — a shared hook backed by a module-level stack of handlers and a single `keydown` listener that is attached while at least one overlay is mounted. Only the most recently mounted overlay closes on each press, so stacked overlays peel off one at a time: with an event form open over a day panel, the first press closes the form and the second closes the panel.
  - Events that are already `defaultPrevented` are ignored, so an open `ThemedSelect`, `DateField`, or Radix popup inside an overlay closes first without taking the overlay with it. IME composition keystrokes are ignored too.
  - The event form will not close while a create or update is still saving, matching its backdrop.

### Changed

- **The Horizon — month grid shows up to 21 event dots per day.** Dots are smaller (`w-1.5 h-1.5`) and wrap into rows of seven inside a 54px column, instead of a single row capped at three. A day with a dozen events no longer looks the same as a day with three.

## [v0.3.1] - 2026-09-10

### Changed

- **The Archive — the left rail is now two independent scroll regions.** The tag cloud and the note list each take half the rail and scroll on their own, so a vault with several dozen tags no longer pushes the note list off the bottom of the panel. Previously the tags were an unbounded `flex-wrap` block above a single scroller: the more tags a vault had, the less of the list was reachable, and past roughly thirty tags none of it was.
  - The rail's height is fixed (`70vh`, or `calc(100vh - 13rem)` from `lg` up) rather than capped with `max-height`, because an equal split needs a definite height to divide. Both halves are `flex-1 basis-0 min-h-0`, so they share the space evenly when both overflow and the tag half still shrinks to its content when a vault has only a few tags.
  - The note count sits between them as a fixed divider, so it stays visible while either half scrolls.
  - The search field remains pinned above both.

## [v0.3.0] - 2026-09-07

Authentication and per-user data isolation. Nothing in the application is reachable without a session, and both the Obsidian and Google Calendar routes now require one.

**Breaking:** this release needs a Supabase project with `supabase/migrations/0001_auth_and_rls.sql` applied, plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` — the client throws at import if either is missing. Existing data is not migrated; the migration creates all five tables rather than altering them.

### Added

- **`AuthContext`** (`src/contexts/AuthContext.tsx`) — owns the Supabase session and nothing else, exposing `session`, `user`, `loading`, `signIn`, and `signOut`. It calls `getSession()` once on mount and subscribes to `onAuthStateChange` for the lifetime of the provider, so background token refreshes and sign-outs elsewhere are picked up.
  - `signIn` distinguishes a network failure from a rejected password: offline, or an error mentioning `fetch`, reports "Can't reach Supabase" rather than "invalid login credentials".
- **`LoginPage`** (`src/components/auth/LoginPage.tsx`) — an email and password form that calls `signIn` and renders whatever error comes back. It has no knowledge of Supabase. There is no registration flow by design; the single account is created in the Supabase dashboard.
- **`supabase/migrations/0001_auth_and_rls.sql`** — the first checked-in migration. Creates `tasks`, `transactions`, `task_categories`, `financial_categories`, and `settings`, each with `user_id uuid not null default auth.uid()` referencing `auth.users(id) on delete cascade`, a `user_id` index, RLS enabled, and four policies scoped to `auth.uid() = user_id`. The `update` policies carry both `using` and `with check`, so a row's `user_id` cannot be rewritten to hand it to another account.
  - `settings` has no surrogate id — its primary key is `(user_id, key)`, since `key` alone would collide across users.
  - Category foreign keys are `on delete set null`, so deleting a category leaves its tasks and transactions intact and uncategorised.
- **`requireUser`** (`server/auth/requireUser.ts`) — the per-request authorization check in front of both API plugins. It reads the bearer token and validates it through Supabase rather than by local signature verification, which stays correct whether the project signs with a symmetric secret or an asymmetric key. Successful validations are cached for 60 seconds, since browsing the vault issues many requests in quick succession; rejections are never cached, and expired entries are swept on write so a long-lived server cannot accumulate rotated tokens.
- **`apiRequest`** (`src/lib/apiRequest.ts`) — one helper for every call to the vault and calendar middleware. It attaches the access token at call time rather than at mount, so an hourly token rotation cannot leave a stale header, and it does so outside the react-query `queryKey`, so a refresh does not invalidate every cached query. Failures throw an `ApiError` carrying the HTTP status.
- **`shouldRetry`** — the shared react-query retry policy. 401 and 403 are not transient failures, so they are never retried; anything else gets one retry. Applied as the client-wide default in `App.tsx`, replacing react-query's default of three.
- **`seedDefaultCategories`** (`src/lib/seedCategories.ts`) — creates the starter categories as real rows on first sign-in and adopts the ids the database assigns. Only `name` and `color` are sent; `id` and `user_id` come from column defaults.
- **`npm run verify:rls`** (`scripts/verify-rls.ts`) — connects with the anon key and no session, and fails if any of the five tables returns a row or accepts an insert. Reading nothing is not proof on its own, so the script probes a write as well.
- Unit tests for `requireUser`, `apiRequest`, and `seedDefaultCategories`. `vitest.config.ts` stubs the two Supabase env vars, so the suite runs on a fresh clone with no `.env.local` and never touches real credentials.
- **`LICENSE`** — MIT.

### Changed

- `AppProvider` reads `user` from `AuthContext`, refuses to fetch while it is null, and clears tasks, transactions, categories, and daily focus on sign-out, so the previous session's data never lingers behind the login form. The fetch effect is keyed on `user?.id`, not `user`, because Supabase hands back a new user object on every hourly token refresh.
  - No `.eq("user_id", …)` filter appears anywhere in the data layer. RLS does that server-side; duplicating it in the client would be a second place to get it wrong.
- Every mutation in `AppProvider` reports a rejected write through a toast and the console instead of silently doing nothing. Each one previously checked `if (!error)`, which is how a rejected insert could close a form and leave no trace.
- The starter categories are seeded as rows rather than kept in memory with hand-written ids like `"work"` and `"salary"`. A task filed under one of those sent a non-uuid `category_id` to a uuid column and the insert was rejected. If seeding fails the in-memory defaults still render, so the UI is not empty, and the failure is surfaced.
- `setDailyFocus` sends `user_id` explicitly and conflicts on `(user_id, key)`. An upsert is `insert … on conflict do update` and must satisfy the insert policy's `with check` and, on collision, the update policy's `using` and `with check`; supplying `user_id` from the session removes any dependence on how the column default interacts with conflict resolution. It is the only upsert in the codebase.
- `Index.tsx` renders a spinner while the session lookup settles, then `LoginPage` when there is no session. `AppProvider` mounts inside that check, so it can never issue an unauthenticated query.
- **Connecting Google Calendar** is a button that fetches `/api/calendar/auth/start` and navigates to the URL it returns, rather than an `<a href>` pointed at that route — a top-level navigation cannot carry an `Authorization` header, so the route would have been unreachable once gated. The route replies `200 { url }` instead of `302`, and a failure renders inline.
- `useVault` and `useGoogleCalendar` drop their near-identical local `request` helpers in favour of `apiRequest`, and use `shouldRetry` in place of `retry: 1`.
- `README.md` documents the real schema. It previously listed `profiles` and `categories`, which do not exist, and claimed RLS policies scoped to each user while no user existed to scope to.
- `.gitignore` covers token and password stores, `.mcp.json`, Supabase local state and seeds, calendar and mailbox exports, HAR captures, and database dumps.

### Security

- **The Supabase anon key is no longer hardcoded.** It sat in `src/lib/supabase.ts` across ten commits and remains in git history, so the project it belonged to has been retired in favour of a new one; both values now come from `VITE_` env vars. They are still public at runtime by design — RLS is what protects the data.
- **The dev server no longer binds every network interface.** `server.host` was `"::"`, which served `/api/obsidian/*` and `/api/calendar/*` — the entire Obsidian vault and the connected Google Calendar — to any device on the same network, with no authorization check on either. It is now `127.0.0.1`. Running under Docker or WSL2 would have to return to `0.0.0.0`, at which point the route gating carries the burden alone.
- **Both API plugins require a valid session.** The Obsidian plugin checks authorization before it checks whether a vault is configured, so an unauthenticated caller cannot even probe the machine for one. Missing server-side auth configuration returns 503 rather than failing open.
  - `/api/calendar/auth/callback` is the one exemption, and has to be: it is a redirect issued by Google's servers, which will never carry our `Authorization` header. It keeps its own protection — a random `state` nonce, verified on return, expiring after 10 minutes.
- Row Level Security is enabled on all five tables, replacing unconditional `anon` access.

## [v0.2.5] - 2026-09-06

### Added

- **Command palette: "Add a new event"** — a quick action, always offered alongside Quick Add, that opens The Horizon's create-event form for today from any tab.
- `showEventForm` / `setShowEventForm` on `AppContext` — UI-only, never persisted — so the palette can request the form and The Horizon can honour it once mounted.

### Changed

- `CalendarPage` consumes the request in an effect that waits for the calendar status query to settle, so a still-loading `connected === false` cannot swallow it, and clears the flag either way so it never re-fires on a later visit.

## [v0.2.4] - 2026-09-06

### Fixed

- **The Vault — number rounding.** The savings running total is rounded to cents before it reaches the chart, and both Y axes format ticks to two decimals, so floating-point accumulation no longer surfaces as `1234.5600000000002` on an axis or in a tooltip.
- **The Vault — chart hovering.** Recharts tooltips inherited the page's own colours and rendered near-invisible text on the dark surface. Cash Flow, Category and Savings tooltips now set explicit content, label, and item colours, and the Savings tooltip formats its value as currency instead of a bare number.

## [v0.2.3] - 2026-09-06

### Added

- **Themed field controls** (`src/components/ui/field-controls.tsx`) — `ThemedSelect`, `DateField`, and `TimeField`, drop-in replacements for the native `<select>`, `<input type="date">`, and `<input type="time">`.
  - Popups render in a portal, so a dialog's overflow or stacking context can never clip them, and are pinned to their trigger with fixed coordinates that flip above when the viewport has no room below.
  - Panels re-measure after render, reposition on scroll and resize, and dismiss on outside pointer-down or Escape.
  - `ThemedSelect` options accept an optional colour swatch, used for task and transaction categories.
  - `DateField` wraps the shadcn calendar, parses `YYYY-MM-DD` at local noon so DST never shifts the day, honours `min`, and supports an optional `clearable` placeholder for The Horizon's "Repeat until".

### Changed

- Every native `<select>`, date, and time input across The Engine, The Vault, The Atmosphere, and The Horizon now uses the themed controls. The browser's own popup rendered as OS chrome — a white sheet on Windows/Chrome — punched through the dark glass theme.
- `color-scheme: dark` on `:root`, so remaining native chrome (number spinners, scrollbars, browser pickers) stays dark.
- `tailwind.config.ts` imports `tailwindcss-animate` and `@tailwindcss/typography` as ES modules instead of calling `require()`.

## [v0.2.2] - 2026-09-06

### Added

- **Today on the Horizon** — a full-width widget on The Pulse showing the day's Google Calendar events: a count, all-day events first, then events sorted by start and end time, each with a friendly 12-hour time range. Clicking it opens The Horizon.
  - Reads the same `localStorage` key as The Horizon, so the widget follows whichever calendar you picked there.
  - Queries local midnight to local midnight and then filters by date, so a multi-day event that merely overlaps today is shown with its end date rather than as a stray row.
  - Distinct copy for the not-connected, error, and empty states — it never renders a bare zero when Google Calendar simply is not wired up.

## [v0.2.1] - 2026-09-06

### Added

- **Skeleton loaders** (`src/components/ui/dashboard-skeletons.tsx`) — per-widget placeholders that match the shape of the content they stand in for: weather, AI smart summary, daily focus, Today on the Horizon, and the vault widget.
- A `shimmer` keyframe and animation in `tailwind.config.ts`, plus a `.skeleton-shimmer` utility in `src/index.css` — a tinted glass block with a highlight sweeping across it, which degrades to a static tint under `prefers-reduced-motion: reduce`.

### Changed

- `Skeleton` takes a `variant` of `"shimmer"` (default) or `"pulse"`, and is `aria-hidden`; the wrappers announce the busy region instead, so screen readers hear one status rather than a pile of empty blocks.
- The Pulse's widgets render these skeletons while loading, replacing the ad-hoc `animate-pulse` divs that were inlined in `HomePage.tsx`.

## [v0.2.0] - 2026-09-06

The Horizon — the calendar tab now reads and writes a real Google Calendar
instead of rendering local tasks.

### Added

**The Horizon — Google Calendar integration**

- Vite middleware plugin (`server/calendar/plugin.ts`) serving Google Calendar over `/api/calendar/*` on both the dev server and `vite preview`. `googleapis` is Node-only, so every Google call happens server side and the browser bundle only ever sees JSON.
  - `GET /api/calendar/status` — `{ configured, connected, account? }`, which drives the whole tab.
  - `GET /api/calendar/auth/start` — redirect to Google's consent screen.
  - `GET /api/calendar/auth/callback` — exchange the code and store the refresh token.
  - `POST /api/calendar/auth/disconnect` — revoke the grant and forget the token.
  - `GET /api/calendar/calendars` — the calendars available to pick between.
  - `GET /api/calendar/events` — list events for a `calendarId` and `timeMin`/`timeMax` window.
  - `POST /api/calendar/events`, `PATCH|DELETE /api/calendar/events/:id` — event CRUD, with `?scope=single|all` for recurring events.
- OAuth layer (`server/calendar/oauth.ts`): consent URL generation, code exchange, token revocation, and a status probe that reports a revoked grant as disconnected rather than as a live token.
- Event layer (`server/calendar/events.ts`): calendar and event listing, create/patch/delete, and the mapping between Google's schema and the app's own event shape.
- `.env.local` writer (`server/calendar/envFile.ts`) that rewrites a single key's line as raw text, so comments, key order, and `OBSIDIAN_VAULT_PATH` all survive untouched.
- Date flattening — Google's `date`/`dateTime` union becomes the `YYYY-MM-DD` + `HH:MM` strings the rest of Crystal OS already uses, and an all-day event's exclusive end date is shifted back so it reads inclusively. Wall-clock parts are read straight off Google's strings, so an event shows the time its own calendar reports, not the server's.
- Recurrence — the event form composes and parses a single `RRULE` (daily/weekly/monthly/yearly with an optional end date). Listing uses `singleEvents`, so a series arrives as instances and an edit or delete asks whether it means *this event* or *all events*; leaving the repeat field alone never rewrites the series.
- Rewritten calendar page (`src/components/views/CalendarPage.tsx`) — month grid and 30-day agenda view, a day panel, an event form with all-day/timed, location, description and recurrence fields, a delete confirmation dialog, a calendar picker coloured by each calendar's own colour, and a connect/disconnect panel that names the missing environment variable when the integration is not configured.
- `useGoogleCalendar` hook — React Query bindings (`useCalendarStatus`, `useCalendarList`, `useCalendarEvents`, `useCreateEvent`, `useUpdateEvent`, `useDeleteEvent`, `useDisconnectCalendar`) that surface the API's own error messages instead of a bare status code.
- The selected calendar is remembered in `localStorage`.
- 33 unit tests: 21 over the event mappers (all-day boundaries, timezone handling, RRULE round trips, validation) and 12 over the `.env.local` writer (upsert, removal, comment and EOL preservation).

### Changed

- The calendar tab is now **The Horizon** and shows Google Calendar events. The previous local view — habit-streak heatmap, drag-and-drop weekly task board, and task day modal — has been replaced; tasks remain on their own tab.
- `.env.example` documents `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `GOOGLE_REFRESH_TOKEN`.
- README: Google Cloud setup steps, the endpoint table, the token/date/recurrence behaviour notes, and the updated project structure.

### Security

- The client secret and refresh token never reach the browser; only the refresh token is persisted, and the access token lives in process memory where `googleapis` refreshes it automatically.
- The `GOOGLE_*` keys are deliberately not `VITE_`-prefixed, so nothing is inlined into the client bundle.
- The consent flow carries a random `state` nonce that is verified on callback and expires after 10 minutes.
- Request bodies capped at 64 KB, matching the vault API.
- Deleting an event is the only destructive action in the app and is behind a confirmation dialog.

### Dependencies

- Added `googleapis`, `dotenv`.

## [v0.1.0] - 2026-09-05

First tagged release. Crystal OS is a personal productivity dashboard — tasks,
calendar, finances, weather, Pomodoro — with an Obsidian vault wired in as a
first-class surface.

### Added

**The Archive — Obsidian vault integration**

- Vite middleware plugin (`server/obsidian/plugin.ts`) serving the vault over `/api/obsidian/*` on both the dev server and `vite preview`. `fast-glob` and `gray-matter` are Node-only, so all vault work stays server side and the browser bundle only ever sees JSON.
  - `GET /api/obsidian/notes` — list notes, with `?q=` search, `?tag=` filter, and `?limit=`.
  - `GET /api/obsidian/notes?path=<rel>` — read a single note including its body.
  - `POST /api/obsidian/quick-add` — append `{ text, notePath?, tags? }` to a note.
- Vault engine (`server/obsidian/vault.ts`): frontmatter parsing, title derivation, tag normalisation, markdown stripping for excerpts, and an mtime-keyed note cache.
- Ranked search — title (exact > prefix > substring) beats tags beats path beats body, with a snippet returned for body matches so the UI can show why a note matched.
- Quick Add appends a `- **HH:MM** text` bullet under a `## YYYY-MM-DD` heading, creating the note and any parent directories when missing. New notes fall back to an `inbox` tag so untagged captures stay findable.
- Frontmatter tag upsert that patches the YAML textually: the existing list style (inline `[a, b]` or block `- a`) is preserved and no other key is reformatted.
- The Archive page (`src/components/views/ArchivePage.tsx`) — searchable note list with tag chips and a GFM markdown reader that renders frontmatter, tags, and status. Obsidian wikilinks (`[[Note]]`, `[[Note|alias]]`) resolve to in-app navigation; unresolved links stay plain text instead of becoming dead anchors.
- Quick Add dialog (`src/components/QuickAddDialog.tsx`) — capture text, optional target note path, and tag entry with suggestions drawn from the vault's existing tags. Failures keep the dialog open so text is never lost.
- Vault widget on the home dashboard: recent notes, top tags as filters, and a quick-add shortcut.
- `useVault` hook — React Query bindings (`useVaultNotes`, `useVaultNote`, `useQuickAdd`) that surface the API's own error messages, so "OBSIDIAN_VAULT_PATH is not set" reaches the user instead of a bare status code.
- 42 unit tests over the vault engine covering path safety, tag normalisation, search ranking, frontmatter upsert across YAML styles, and quick-add appends.

**Command palette**

- Vault notes now appear in palette results, searched server-side across note bodies (2+ characters, debounced 250 ms).
- Quick Add is always offered as the first row, seeded with whatever has been typed.
- Selecting a note result opens it in The Archive.

**Elsewhere**

- `archive` tab in the sidebar and bottom navigation.
- `useDebouncedValue` helper in `src/lib/utils.ts`.
- `.env.example` documenting `OBSIDIAN_VAULT_PATH`.
- Weather section: current conditions and a 7-day forecast for saved Ontario locations, plus a home-dashboard widget.
- Category management UI for task and financial categories.

### Changed

- `AppContext` carries vault UI state (`selectedNotePath`, `showQuickAdd`, `quickAddDraft`) so the palette, the home widget, and The Archive can drive one another.
- Vitest now collects from `server/**` in addition to `src/**`.
- `@tailwindcss/typography` added to the Tailwind plugin list for the note reader.
- README rewritten: the Obsidian layer, the real dev port (8080), the actual environment variables, and the current project structure.

### Security

- Every vault filesystem access goes through `resolveVaultPath`, which rejects absolute paths, drive letters, and any traversal escaping the vault root.
- `OBSIDIAN_VAULT_PATH` is deliberately not `VITE_`-prefixed, so the vault location is never inlined into the client bundle.
- Request bodies capped at 64 KB, capture text at 10,000 characters, tags at 12 per request and 60 characters each, validated against the Obsidian tag charset.

### Dependencies

- Added `fast-glob`, `gray-matter`, `react-markdown`, `remark-gfm`.
