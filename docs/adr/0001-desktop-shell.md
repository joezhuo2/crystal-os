# ADR 0001 — Desktop shell: Tauri 2 with a Node sidecar

- **Status:** Accepted
- **Date:** 2026-09-12
- **Roadmap:** Phase 1.1 (Shell bootstrap)

## Context

Crystal OS is a Vite + React SPA. Phase 1 turns it into a native desktop app with a global hotkey (1.2), a tray menu (1.3), and native vault file access (1.4). The web build has to keep working the whole time.

Two features depend on Node code that currently runs only inside the Vite dev/preview server:

- **The Archive** — `/api/obsidian/*` (`server/obsidian/plugin.ts`) reads the Obsidian vault from disk.
- **The Horizon's Google sync** — `/api/calendar/*` (`server/calendar/plugin.ts`) holds the OAuth client secret and refresh token.

A packaged desktop app loads its bundle from `dist/` with no Vite server behind it, so those routes would disappear.

## Decision

### Shell: Tauri 2, not Electron

| | Tauri 2 | Electron |
|---|---|---|
| Installer size | ~10 MB shell (+ sidecar, below) | ~100 MB+ (bundles Chromium + Node) |
| Renderer | System WebView2, already on Windows 11 | Bundled Chromium |
| Backend | Rust, typed IPC commands | Node main process |
| Permissions | Capability files scope each API per window | Everything open to main; renderer isolation by convention |
| Phase 1 needs | Official global-shortcut, tray, and scoped-fs plugins | Available, via main-process APIs |

Tauri's capability model matters for 1.4: vault access can be scoped to the single user-chosen directory, not the whole disk. Electron's one real advantage, Node in the main process, is covered for now by the sidecar below.

### Backend for the packaged app: Node sidecar

The existing middleware is bundled into a standalone executable (`crystal-api`) that Tauri launches and kills alongside the window:

- `server/obsidian/plugin.ts` and `server/calendar/plugin.ts` export framework-free `create*Middleware` factories. The Vite plugins and the sidecar share them, so there is one implementation.
- `server/standalone.ts` mounts them on `node:http`; `server/sidecar.ts` is the entry point.
- `scripts/build-sidecar.mjs` bundles with esbuild and packs a Node Single Executable Application to `src-tauri/binaries/crystal-api-<triple>.exe`.
- The sidecar binds `127.0.0.1:8787`, keeps the Supabase-JWT gate on every route, and allows CORS only from the Tauri webview origins.
- It reads `.env.local` from the app config dir (`%APPDATA%\com.crystalos.desktop\`), not the install dir, so settings survive upgrades and the calendar refresh token can be written back.

Alternatives rejected:

- **Disable Archive and Calendar in the packaged app until 1.4.** Smallest change, but the desktop app would lose features the web app has.
- **Call a separately running `npm run preview`.** Full features, but the app would depend on a terminal staying open.
- **Port the middleware to Rust now.** 1.4 does this for the vault. Moving the Google OAuth code to Rust has no payoff yet.

### Runtime gating

`src/lib/platform.ts` provides `isDesktop()`, `apiUrl()`, and `openExternal()`. It imports nothing from `@tauri-apps/*` at module level, so the web bundle contains no desktop code. `apiRequest` sends every API call through `apiUrl`, which switches to the sidecar only in the packaged app. `dev:desktop` loads from the Vite server, so relative paths keep working there.

On desktop, Google consent opens in the system browser, because Google blocks OAuth inside embedded webviews. The sidecar's callback page tells the user to return to the app, and react-query refetches the connection status when the window regains focus.

## Consequences

- Desktop builds need the Rust toolchain and MSVC build tools. Web development does not.
- The installer grows by roughly 100 MB, because the sidecar embeds a Node runtime. Phase 1.4 can shrink this or remove the sidecar.
- Port 8787 is fixed. If another process already holds it, Archive and Calendar show a connection error. Dynamic port assignment over IPC is deferred.
- `dev:desktop` does not start the sidecar; the Vite middleware serves the API, as it does on the web.
- Google OAuth for the packaged app needs a second authorized redirect URI: `http://127.0.0.1:8787/api/calendar/auth/callback`.
- Only Windows is built and verified in 1.1. macOS and Linux are covered by the 1.5 exit criteria.
