# Privacy: what Crystal OS stores and sends

Crystal OS has no server of its own and no telemetry. It never sends usage data, crash reports or analytics anywhere. Your data lives in two places: files on your own disk, and the third-party services you choose to connect.

Paths below are for the desktop app on Windows. `%APPDATA%\com.crystalos.desktop\` is called the **config folder**.

## On your disk

| What | Where |
|------|-------|
| Tasks, finances and history | `data\` in the config folder (in the repo root for `npm run dev`), one JSON file per table: `tasks` (names, dates and times, priority, category, repeat rule, notes, checklist), `task_categories` and `financial_categories` (names and colours), `transactions` (name, amount, income or expense, category, date), `task_completions` (one row per task you tick off), `focus_sessions` (one row per Pomodoro focus run), `habits` and `habit_checks`. Plain text, never uploaded. There is no account and no sign-in. |
| Obsidian vault | The folder you picked. Crystal OS reads notes and writes only where you ask it to: Quick Add captures, the note editor, the Today card's block in the daily note, and exported reviews under `Reviews/`. |
| Server-side settings | `.env.local` in the config folder (in the repo root for `npm run dev`). Holds the vault path, the Google OAuth client id and secret, and the Google refresh token written when you click **Connect** in The Horizon. Plain text: anyone who can read your user profile can read it. |
| Mail accounts | `mail-accounts.json` next to `.env.local`: the address, provider and refresh token of each Gmail or Outlook account you connect for the mail digest. Plain text, like `.env.local`; the tokens are never sent to the webview. **Disconnect** removes the account's entry (and revokes the Google grant). |
| Trades (The Ledger) | `trades.json` next to `.env.local`: the trades rebuilt from your Wealthsimple order emails (account type, symbol, side, quantity, price, time and a link to the email), CAD/USD conversions, trades you add, edit, hide or import from CSV, your trade journal (notes, tags, grade) and the ids of emails already read. Plain text, never uploaded; delete the file to start over. |
| App preferences | `settings.json` in the config folder: hotkeys, launch at login, vault folder, installer source folder. |
| Portal sessions | `portal\<app id>\` in the config folder, one WebView2 profile per app with its cookies and storage. **Sign out** clears an app's cookies and storage; **Remove** deletes the folder. |
| Nebula | `harness\state.json` (projects, chat index, token totals), `harness\chats\<id>.json` (full transcripts), `harness\logs\` (engine stderr), all in the config folder. The NVIDIA NIM and OmniRoute keys are in `dsh\.credentials.yaml` in the config folder, in plain text; they are never sent to the webview. |
| Diagnostics | `%LOCALAPPDATA%\com.crystalos.desktop\logs\diagnostics.log` (rotated to `diagnostics.old.log` at 512 KB). Recent errors: unhandled rejections, uncaught errors and failed data saves, with the app version. It stays on your machine; **Settings → Diagnostics → Copy diagnostics** puts it on the clipboard for you to share if you want to. |
| Per-device UI state | The webview's `localStorage`: layout of Home widgets, folded Settings sections, The Orbit's "seen" marks and auto-export switch, the Portal app list, theme, weather city, notification settings, The Engine's work day hours (`crystal-os-capacity`), and the keys of reminders already shown (`crystal-os-notified`: a task or event id and a date, kept two days) so a restart does not repeat them. Task, transaction and completion changes made while the local API was unreachable (`crystal-os-offline-queue:local`), until they are saved. The command palette's recently opened items (`crystal-os-recents:local`): up to 8 task names, vault note titles and paths, and calendar event titles, ids and dates. |
| Notifications | Desktop toasts go to Windows' notification centre (or your browser's), which may keep them in its history until you clear them. They carry a task or event title, a time and an event's location, or a Portal app's name and unread count. |
| Downloaded installers | Your Downloads folder, only when you click **Download** in Settings → Install & update. |

Uninstalling keeps the config folder and the log folder unless you tick the uninstaller's option to delete app data, so a reinstall picks up where you left off. Delete both folders to remove everything Crystal OS stored locally.

## What leaves your machine

| Destination | When | What is sent |
|-------------|------|--------------|
| Your old Supabase project | Once, only if you import data from v0.16 or older | A sign-in and read-only requests for your rows. Nothing is written or deleted there |
| Google Calendar API | After you connect The Horizon | Calendar reads, and the events you create, edit or delete |
| Gmail API and Microsoft Graph | After you connect a mail account | Read-only requests for the last 1 to 90 days of message headers and previews (sender, subject, date, a short preview). Crystal OS never sends, moves, marks or deletes mail |
| Gmail API | When you open The Ledger or The Courier with a Gmail account connected | Read-only search for Wealthsimple order and conversion emails (`from:wealthsimple.com`), then the body of each new one, to rebuild your trades locally. Crystal OS never sends, moves, marks or deletes mail |
| Anthropic (`api.anthropic.com`) | Mail digest, only when `ANTHROPIC_API_KEY` is set | The sender, subject and preview of up to 60 emails per digest that the built-in rules could not classify confidently. Nothing is sent without a key |
| Environment Canada (`api.weather.gc.ca`) | Weather and Atmosphere, including air quality (AQHI) | The location you picked, and for air quality a box of about 1.5° around its published map point and the id of the nearest station |
| Hugging Face (`huggingface.co`) | **Search by meaning** in The Archive, the first time you turn it on | A download request for the search model (`Xenova/all-MiniLM-L6-v2`, about 23 MB). The model then runs on your device; no note text or search query is sent anywhere |
| Your system's location service | **Use my location** in the weather city picker, when you click it and confirm in Crystal OS's own dialog, or once at launch if you turn on **Update location on launch** (off by default), and every 30 minutes for **Pulse reminders** while a timed event with a location is coming up | A request for your rough position, handled by Windows Location (or your browser on the web). For weather, Crystal OS uses the position once to pick the nearest Environment Canada location and only that location's id is saved, as the weather city. For Pulse reminders it is sent to OSRM (below) to time the drive and is not stored |
| OpenStreetMap Nominatim (`nominatim.openstreetmap.org`) and OSRM (`router.project-osrm.org`) | **Pulse reminders** (Settings → Notifications, on by default), for timed events with a location in the next 6 hours | The event's location text to Nominatim, then your rough position and that place's coordinates to OSRM to time the drive. Nothing is stored beyond this session; turn **Pulse reminders** off to send none |
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
