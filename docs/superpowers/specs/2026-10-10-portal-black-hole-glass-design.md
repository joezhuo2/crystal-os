# The Portal: black hole glass redesign

Date: 2026-10-10
Status: approved in chat, pending spec review

## Goal

Replace The Portal's three selectable themes (Void swirl, Event horizon,
Stargate blue) with a single look built on a warm, tilted black hole image
(cream photon ring, peach and dusty-rose accretion disk, near-black space).
The page and its Home widget use glassmorphism over that image. Every item
that currently follows the Portal theme is restyled to the new palette.

## Decisions (from the user)

| Topic | Choice |
|---|---|
| Frame around the app webview | Glass bezel with soft glow, no spinning ring |
| Page backdrop | Image with light blur (`PAGE_BACKDROP_BLUR`, 15) |
| Accent palette | Cream + peach-rose |
| Home widget | Light glass like the Orbit card (`CARD_BACKDROP_BLUR`, 25) |

## Palette

Taken from the image. Exact values may be tuned during implementation, but
the roles are fixed.

| Variable | Role | Value |
|---|---|---|
| `--portal-a` | primary accent (warm peach) | `#f4b89a` |
| `--portal-b` | secondary accent (dusty rose) | `#d8a0a8` |
| `--portal-cream` | photon-ring highlight | `#fff1e6` |
| `--portal-hover-text` | text on hover | `#fff4ea` |
| `--portal-surface` | glass fill base | `rgb(18 11 12 / 0.55)` |
| `--portal-bg` | fallback behind the image | `#060404` |

The page root and `body.portal-theme` also retint the shadcn tokens
(`--primary`, `--ring`, `--border`, `--input`, `--muted`, `--muted-foreground`,
`--popover`, `--card`, `--secondary`, `--accent`, `--glass-border`), in the
same way `.orbit-root` / `body.orbit-theme` do, so dialogs, popovers and
toasts opened from The Portal match it.

## Changes

### Asset and backdrop bake

- Add `src/assets/portal-backdrop.webp` (the supplied image).
- `src/lib/imageBackdrop.ts`: add `"portal"` to `BackdropImage` and `IMAGES`.
  The existing canvas blur bake and cache are reused unchanged.

### Store

`src/lib/portalStore.ts` loses everything theme related: `PortalTheme`,
`PortalThemeInfo`, `PORTAL_THEMES`, `DEFAULT_PORTAL_THEME`,
`PORTAL_THEME_CLASS`, `THEME_KEY`, the `theme` field of `PortalState`, and
`setTheme`. The stale `crystal-os-portal-theme` localStorage key is ignored
(not migrated, not deleted). `portalStore.test.ts` drops its theme cases.

### Portal page

- `src/pages/Index.tsx`: the Portal root class is `portal-root` alone. The
  backdrop is `<ImageBackdrop image="portal" />`. `body` gets a
  `portal-theme` class while the Portal tab is active, like `orbit-theme`.
- Delete `src/components/layout/PortalBackdrop.tsx`.
- `src/index.css`:
  - Remove the `.portal-theme-void|horizon|stargate` blocks, the
    `.portal-backdrop*` rules, and the per-theme frame overrides.
  - One palette on `.portal-root`, `body.portal-theme` and `.home-space-portal`.
  - `.portal-frame` becomes a glass bezel: translucent warm-dark fill, 1px
    cream hairline border, inset top highlight, soft peach outer glow, drop
    shadow. No animation. `.portal-frame::before` becomes a static blurred
    halo at low opacity. No live `backdrop-filter` (the image is pre-blurred).
  - `.portal-host` / `.portal-screen` use the glass surface.
  - Navbar pills, icon buttons, active pill, tooltip, skeleton, skeleton
    badge, gradient text, accent and orbit icon keep their structure and use
    the new variables; solid surface fills become translucent glass.
  - `@property --portal-angle` and keyframes that no Portal rule uses any
    more are removed, unless another rule still references them
    (`portal-shimmer` is used by the Nebula Home box and stays).
- `Navigation.tsx` sidebar active pill keeps reading `--portal-a`; only its
  comment changes.

### Home widget

`PortalSpace` in `src/components/views/HomeSpaces.tsx`:

- Drops the theme class and swatch lookup.
- Renders the image with `useImageBackdrop("portal", CARD_BACKDROP_BLUR)` in
  a `.home-backdrop-scene` / `.home-backdrop-image` layer, the same markup
  the Orbit box uses in `HomePage.tsx`.
- `.home-card-portal` becomes a light glass pane (Orbit-card style: faint
  tint gradient, cream hairline border, text shadow, inset highlight), with
  a peach glow on hover. The spinning conic border is removed.
- `GlassTip` colours come from the fixed palette.

### Settings

The Portal section only held the theme picker, so it is removed: the
`Section id="portal"` block and `usePortal` / `PORTAL_THEMES` imports in
`SettingsPage.tsx`, the `portal` entry in `src/lib/settingsSections.ts`, and
"The Portal's theme" from the Settings description text. Any test that
expects the section is updated.

### Unchanged

- Rust webview background (`#05050a` in `portal.rs`).
- App list, badges, lifecycle, navbar behaviour.
- Reduced-motion rules (fewer Portal animations remain to cover).

## Testing

- `npm run typecheck`, `npm run lint`, `npm test`.
- Dev preview: screenshot of the Portal page (empty state and with an app
  skeleton where possible) and of the Home tab's Portal widget.
