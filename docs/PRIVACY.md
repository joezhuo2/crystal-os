# Privacy: what Crystal OS stores and sends

Crystal OS has no server of its own and no telemetry. It never sends usage data, crash reports or analytics anywhere. Your data lives in three places: the Supabase project you point it at, files on your own disk, and the third-party services you choose to connect.

Paths below are for the desktop app on Windows. `%APPDATA%\com.crystalos.desktop\` is called the **config folder**.

## Supabase (your project)

Stored in the Supabase project named by `VITE_SUPABASE_URL`. Only your account can read or write these rows: every table has Row Level Security scoped to `auth.uid() = user_id` (`npm run verify:rls` checks it).

| Table | What is in it |
|-------|---------------|
| `tasks` | Task names, dates and times, priority, category, repeat rule, completed flag |
| `task_categories`, `financial_categories` | Category names and colours |
| `transactions` | Name, amount, income or expense, category, date |
| `task_completions` | One row per task you tick off: its title, category and when |
| `focus_sessions` | One row per Pomodoro focus run: start, end, length, linked task |
| `settings` | Per-user key/value preferences |

Sign-in uses Supabase Auth with email and password. The session token is kept in the webview's `localStorage`.

## On your disk

| What | Where |
|------|-------|
| Obsidian vault | The folder you picked. Crystal OS reads notes and writes only where you ask it to: Quick Add captures, the note editor, the Today card's block in the daily note, and exported reviews under `Reviews/`. |
| Server-side settings | `.env.local` in the config folder (in the repo root for `npm run dev`). Holds the Supabase URL and anon key, the vault path, the Google OAuth client id and secret, and the Google refresh token written when you click **Connect** in The Horizon. Plain text: anyone who can read your user profile can read it. |
| App preferences | `settings.json` in the config folder: hotkeys, launch at login, vault folder, installer source folder. |
| Portal sessions | `portal\<app id>\` in the config folder, one WebView2 profile per app with its cookies and storage. **Sign out** clears an app's cookies and storage; **Remove** deletes the folder. |
| Nebula | `harness\state.json` (projects, chat index, token totals), `harness\chats\<id>.json` (full transcripts), `harness\logs\` (engine stderr), all in the config folder. The NVIDIA NIM and OmniRoute keys are in `dsh\.credentials.yaml` in the config folder, in plain text; they are never sent to the webview. |
| Diagnostics | `%LOCALAPPDATA%\com.crystalos.desktop\logs\diagnostics.log` (rotated to `diagnostics.old.log` at 512 KB). Recent errors: unhandled rejections, uncaught errors and failed Supabase saves, with the app version. It stays on your machine; **Settings → Diagnostics → Copy diagnostics** puts it on the clipboard for you to share if you want to. |
| Per-device UI state | The webview's `localStorage`: layout of Home widgets, folded Settings sections, The Orbit's "seen" marks and auto-export switch, the Portal app list, theme, weather city, notification settings, and the keys of reminders already shown (`crystal-os-notified`: a task or event id and a date, kept two days) so a restart does not repeat them. Task, transaction and completion changes made while Supabase was unreachable (`crystal-os-offline-queue:<user id>`), until they are sent; the same rows as in Supabase, so treat them the same way. |
| Notifications | Desktop toasts go to Windows' notification centre (or your browser's), which may keep them in its history until you clear them. They carry a task or event title, a time and an event's location, or a Portal app's name and unread count. |
| Downloaded installers | Your Downloads folder, only when you click **Download** in Settings → Install & update. |

Uninstalling keeps the config folder and the log folder unless you tick the uninstaller's option to delete app data, so a reinstall picks up where you left off. Delete both folders to remove everything Crystal OS stored locally. Supabase rows stay in your project until you delete them there.

## What leaves your machine

| Destination | When | What is sent |
|-------------|------|--------------|
| Your Supabase project | Always, while signed in | The rows above, over HTTPS |
| Google Calendar API | After you connect The Horizon | Calendar reads, and the events you create, edit or delete |
| Environment Canada (`api.weather.gc.ca`) | Weather and Atmosphere | The location you picked |
| Your system's location service | **Use my location** in the weather city picker, only when you click it | A request for your rough position, handled by Windows Location (or your browser on the web). Crystal OS uses the position once to pick the nearest Environment Canada location and does not store or send it anywhere; only that location's id is saved, as the weather city |
| GitHub (`github.com/joezhuo2/crystal-os`) | **Check for updates**, or opening Install & update | A request for the release list and `latest.json`; nothing about you beyond your IP address |
| Portal apps | When you add one | Whatever you do on that site, exactly as in a browser |
| Model providers (The Nebula) | When you send a message | See below |

### What The Nebula sends to model providers

The Nebula sends your messages, the agent's instructions, and the content the agent reads from your project folder (files it opens, command output, search results) to the model for the tier you pick. Anything in that folder the agent touches, including secrets in files it reads, can be sent.

| Tier | Sent to |
|------|---------|
| Low | OmniRoute on `localhost:20128`, which forwards to whichever upstream providers you configured in OmniRoute |
| Medium | NVIDIA NIM (`integrate.api.nvidia.com`) with your NIM key, falling back to OmniRoute |
| High | Anthropic, through Claude Code signed in to your own account |

The skills and MCP servers you leave enabled also run with the project's context, and an MCP server may contact its own service. Crystal OS does not send anything to these providers on its own: no request is made until you send a message.
