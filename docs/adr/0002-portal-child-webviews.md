# ADR 0002 — The Portal: external web apps as Tauri child webviews

- **Status:** Accepted
- **Date:** 2026-09-14
- **Release:** v0.5.0

## Context

The Portal tab lets the user connect web apps such as Discord and Instagram and use them inside Crystal OS, signed in, from a small navbar of app pills.

Those sites cannot be embedded the ordinary way. They send `X-Frame-Options: DENY` or a `frame-ancestors` CSP, so an `<iframe>` renders blank. A proxy that strips the headers would break their sign-in and is unacceptable for sites holding the user's accounts.

## Decision

### Native child webviews, not iframes

Each connected app is a real WebView2 webview added to the main window with `Window::add_child` (`src-tauri/src/portal.rs`). This needs Tauri's `unstable` Cargo feature.

- The webviews live in Rust, keyed by app id (`portal-<id>`). The React page (`PortalPage.tsx`) only measures a placeholder element and calls `portal_show` with its bounds. `ResizeObserver`, window resize, and a short per-frame loop while the page slides in keep the webview aligned.
- Leaving the tab calls `portal_hide`. The webviews keep running, so switching back is instant, and calls and message sockets stay connected. Apps load on the first Portal visit of a session, not at app launch, so login-time startup stays light.
- A webview stays hidden while its page loads (on creation, Reload, home, and sign-out), so the page's skeleton placeholder shows through instead of an empty dark rectangle. The `on_page_load` hook shows it when the page finishes and the app is still on screen; a 20-second timeout shows it regardless (added in v0.5.2).
- Switching apps fades the old page out and the new one in by setting `opacity` on the page's root element with `eval`. Native webviews cannot be faded from the host page. Each webview has a dark background colour, so the fade never flashes white.

Rejected alternatives:

- **Iframes.** Blocked by the sites, as above.
- **Separate borderless windows positioned over the main window.** They would have to follow every move, resize, minimise, and z-order change, and would show up as separate windows in the taskbar and Alt+Tab.
- **Opening apps in the system browser.** That is simply not the feature. It remains the fallback on the web build, where child webviews do not exist.

### One data directory per app

Each webview gets `data_directory = %APPDATA%\com.crystalos.desktop\portal\<id>\`.

- Sessions persist across restarts and never mix between apps.
- **Sign out** calls `clear_all_browsing_data` on that webview only.
- **Remove** closes the webview and deletes its folder. WebView2 can hold files briefly after closing, so `portal_prune`, run on the first Portal visit, deletes folders of apps that are no longer connected.
- App ids become folder names, so Rust accepts only `[a-z0-9-]{1,40}`.

### Security

- Only `https` home pages are accepted.
- `capabilities/default.json` has no `remote` entry, so pages loaded from remote origins cannot call any Crystal OS command.
- `on_new_window` keeps a site's own popups in the app (sign-in flows) and sends links to other sites to the default browser.

### Native webviews draw above the page

A child webview is an OS-level surface, so no DOM element can appear on top of it. The UI works around this:

- The search bar is unmounted on the Portal tab.
- Tooltips in the Portal navbar use native `title` attributes.
- Any overlay that can cover the frame calls `usePortalOcclusion(open)`. This covers the Add dialog, the pill context menu, the sign-out and remove confirmations, and the global Quick Add dialog. While any occluder is open, the page hides the webview.
- Before hiding, `snapshotAndHidePortal` asks `portal_snapshot` for a JPEG of the page (WebView2 `CapturePreview`) and shows it in the webview's place, so the page stays visible behind the menu or dialog. `portal_show` then brings the live page back with `fade: false`. A page that is still loading, or a capture that fails or takes over 800 ms, falls back to the app-icon placeholder.
- `showPortalApp`, `hidePortal`, and `snapshotAndHidePortal` run strictly in call order, so a slow first `portal_show` cannot re-show a webview after a later hide.

### Keyboard focus

Each webview has its own keyboard focus, so keys pressed in an app page never reach the main webview's `keydown` listeners.

- The Portal's tab shortcuts (Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+W, Ctrl+R) are caught in each app webview with WebView2's `AcceleratorKeyPressed` event, marked handled so the page ignores them, and sent to the main webview as `portal://shortcut` (`src-tauri/src/portal/webview2.rs`).
- `portal_hide` moves focus to the main webview when it hides an app on screen, so menus and dialogs get the keyboard.
- Showing the window (hotkey, tray) focuses the app on screen, or the main webview.
- Tauri's `Window::is_focused` turns false while a child webview has focus, so the toggle hotkey checks the foreground window instead (`window::is_foreground`).
- The webview is placed on an inner element inset 8px from the frame edge, so its square corners clear the frame's rounded ring.

### Main window type

With child webviews attached, Tauri stops treating `main` as a `WebviewWindow`: `get_webview_window("main")` returns `None`, and a `WebviewWindow` command argument fails to extract. `window.rs` and `pick_vault` therefore use the plain `Window` type.

## Consequences

- The `unstable` feature is not covered by Tauri's semver guarantees. Minor Tauri upgrades may need changes in `portal.rs` and `window.rs`.
- Each loaded app is a WebView2 browser process group with its own data folder, typically 150–300 MB of RAM per app.
- Windows has no switch for background throttling (`background_throttling` is set but only honoured on macOS). Hidden pages get timer throttling, as a background browser tab would. Websockets and WebRTC keep working, so messages, badges, and calls continue.
- Google services cannot be used: Google rejects sign-in from embedded webviews. Spotify cannot play: WebView2 has no Widevine DRM.
- Unread badges depend on each site's title format (`(3) Name`, `• Name`, `* Name`). A site that changes its format loses its badge, but nothing else breaks.
- The web build cannot embed these sites. It keeps the app list and opens apps in new tabs.
