# Portal Black Hole Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace The Portal's three themes with one warm black hole image backdrop and a glassmorphism look, on the Portal page and its Home widget.

**Architecture:** Reuse the existing pre-blurred image backdrop pipeline (`src/lib/imageBackdrop.ts`, `ImageBackdrop.tsx`, `.home-backdrop-*`) that The Horizon, The Engine and The Orbit already use. One fixed palette in `index.css` replaces the `portal-theme-*` classes; the theme state and Settings picker are deleted.

**Tech Stack:** React 18 + TypeScript, Tailwind + hand-written CSS in `src/index.css`, Vitest + Testing Library, Tauri desktop shell.

**Spec:** `docs/superpowers/specs/2026-10-10-portal-black-hole-glass-design.md`

## Global Constraints

- Palette: `--portal-a: #f4b89a` (peach), `--portal-b: #d8a0a8` (dusty rose), `--portal-cream: #fff1e6`, `--portal-hover-text: #fff4ea`, `--portal-surface: rgb(18 11 12 / 0.55)`, `--portal-bg: #060404`.
- Page backdrop blur: `PAGE_BACKDROP_BLUR` (15). Home widget blur: `CARD_BACKDROP_BLUR` (25).
- No spinning ring, no live `backdrop-filter` on large surfaces (image is pre-blurred). Small tooltip may use `backdrop-filter`.
- `.portal-frame` keeps `padding: 3px` and `.portal-host` keeps `padding: 5px` / `border-radius: 13px`: the native webview is sized from `.portal-screen`, so the geometry must not change.
- Rust side (`src-tauri/src/portal.rs`, `BACKGROUND`) is not touched.
- Keyframes `portal-rotate`, `portal-text`, `portal-shimmer` stay (still used). `portal-spin`, `portal-rotate-reverse`, `portal-sway`, `portal-breathe`, `portal-ripple`, `portal-flare` and `@property --portal-angle` go.
- Comments follow the repo's style: full sentences explaining why.

## Review Focus

1. Stale `crystal-os-portal-theme` key in localStorage from an older version: store must load normally and ignore it. Pinned in Task 5.
2. Dialogs, dropdowns and toasts opened from The Portal portal to `<body>`: they must pick up the new palette via `body.portal-theme`, and lose it on leaving the tab. Pinned in Task 3 (class toggle) and checked in Task 6 preview.
3. Settings search for "portal" or "theme": must not crash or show an empty Portal section; the Performance section (which mentions "portal unload delay") must still match. Pinned in Task 2.
4. `prefers-reduced-motion`: no Portal rule left animating except the ones already listed under reduced motion. Checked in Task 3/4 CSS.
5. Empty Portal (no apps) and loading skeleton: text must stay legible over the glass. Checked in Task 6 preview.

---

## File map

| File | Change |
|---|---|
| `src/assets/portal-backdrop.webp` | new, the supplied image |
| `src/lib/imageBackdrop.ts` | add `"portal"` image |
| `src/components/views/SettingsPage.tsx` | remove Portal section |
| `src/lib/settingsSections.ts` | remove `portal` entry |
| `src/components/views/SettingsSearch.test.tsx` | assert section gone |
| `src/pages/Index.tsx` | image backdrop, `body.portal-theme`, no theme class |
| `src/components/layout/PortalBackdrop.tsx` | delete |
| `src/index.css` | Portal section rewrite, Home widget glass, sidebar, keyframes |
| `src/components/layout/Navigation.tsx` | comment only |
| `src/components/views/HomeSpaces.tsx` | image layer, no theme |
| `src/lib/portalStore.ts` | remove theme state |
| `src/lib/portalStore.test.ts` | drop theme tests, add stale-key test |

---

### Task 1: Portal backdrop image

**Files:**
- Create: `src/assets/portal-backdrop.webp`
- Modify: `src/lib/imageBackdrop.ts:1-25`

**Interfaces:**
- Produces: `BackdropImage` now includes `"portal"`; `useImageBackdrop("portal", blur)` and `<ImageBackdrop image="portal" />` work.

- [ ] **Step 1: Copy the image**

```bash
cp "C:/Users/Joe/AppData/Local/Temp/claude/C--Users-Joe-Documents-crystal-os/ec2f0337-71ca-4994-97f6-9de8cffb31f9/images/1.webp" src/assets/portal-backdrop.webp
```

- [ ] **Step 2: Register it in `imageBackdrop.ts`**

Header comment: add "and the Portal (a warm, peach and rose one)" to the list of images. Then:

```ts
import orbitImage from "@/assets/orbit-backdrop.webp";
import portalImage from "@/assets/portal-backdrop.webp";
import archiveImage from "@/assets/archive-backdrop.jpg";
```

```ts
export type BackdropImage = "horizon" | "engine" | "orbit" | "portal" | "archive";

const IMAGES: Record<BackdropImage, string> = {
  horizon: horizonImage,
  engine: engineImage,
  orbit: orbitImage,
  portal: portalImage,
  // Home box only; The Archive page keeps its amethyst cave.
  archive: archiveImage,
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/assets/portal-backdrop.webp src/lib/imageBackdrop.ts
git commit -m "feat(portal): add black hole backdrop image"
```

---

### Task 2: Remove the Portal theme section from Settings

**Files:**
- Modify: `src/components/views/SettingsPage.tsx` (imports line 3 and 16-17, line 389, line 459, section at lines 633-674)
- Modify: `src/lib/settingsSections.ts:25`
- Test: `src/components/views/SettingsSearch.test.tsx:28`

- [ ] **Step 1: Change the test to expect no Portal section**

In `SettingsSearch.test.tsx`, replace

```ts
    expect(section("portal").hidden).toBe(true);
```

with

```ts
    // The Portal's only setting was its theme, which is gone.
    expect(section("portal")).toBeNull();
```

Add a new case after "matches text inside a section, not just its title":

```ts
  it("still finds the Portal's unload delay under Performance", () => {
    render(<SettingsPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "portal" } });
    expect(section("performance").hidden).toBe(false);
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/components/views/SettingsSearch.test.tsx`
Expected: FAIL, `section("portal")` is an element, not null.

- [ ] **Step 3: Remove the section**

`settingsSections.ts`: delete the line

```ts
  { id: "portal", title: "The Portal", hint: "Theme, web apps", keywords: ["theme", "web apps", "discord", "instagram"] },
```

`SettingsPage.tsx`:
- Delete the whole `<Section id="portal" icon={AppWindow} title="The Portal"> ... </Section>` block.
- Delete `const { theme: portalTheme } = usePortal();`.
- Delete imports `usePortal` (`@/hooks/usePortal`) and `PORTAL_THEMES, portal` (`@/lib/portalStore`) if nothing else in the file uses them (check with grep first).
- Drop `AppWindow` and `Check` from the lucide import if unused elsewhere in the file.
- Description text becomes `"Hotkeys, startup, your vault folder, The Nebula, and installing updates."`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/components/views/SettingsSearch.test.tsx && npm run typecheck`
Expected: PASS. If the new "portal" case fails, check the Performance section's keywords still contain `"portal unload delay"`.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/SettingsPage.tsx src/lib/settingsSections.ts src/components/views/SettingsSearch.test.tsx
git commit -m "feat(settings): drop the Portal theme picker"
```

---

### Task 3: Portal page — image backdrop and glass palette

**Files:**
- Modify: `src/pages/Index.tsx` (lines 22, 135, 180-186, 205-207, 225-226)
- Delete: `src/components/layout/PortalBackdrop.tsx`
- Modify: `src/index.css` Portal section (~lines 604-1060)
- Modify: `src/components/layout/Navigation.tsx:61`

**Interfaces:**
- Consumes: `ImageBackdrop image="portal"` from Task 1.
- Produces: CSS variables `--portal-a`, `--portal-b`, `--portal-cream`, `--portal-hover-text`, `--portal-surface`, `--portal-bg` on `.portal-root`, `body.portal-theme`, `.home-space-portal`. Task 4 relies on the `.home-space-portal` one.

- [ ] **Step 1: `Index.tsx`**

- Remove `import PortalBackdrop ...` and `import { PORTAL_THEME_CLASS } from "@/lib/portalStore";`.
- Remove `const { theme: portalTheme } = usePortal();` and the `usePortal` import if unused elsewhere in the file.
- Root class: `? "portal-root"` instead of `` ? `portal-root ${PORTAL_THEME_CLASS[portalTheme]}` ``.
- Backdrop: `case "portal": return <ImageBackdrop image="portal" />;`
- Body classes effect: add `document.body.classList.toggle("portal-theme", activeTab === "portal");` and update the comment to mention the Portal.

- [ ] **Step 2: Delete `PortalBackdrop.tsx`**

```bash
git rm src/components/layout/PortalBackdrop.tsx
```

Check `StarCanvas` still has other users (`grep -rn StarCanvas src`); leave it if so.

- [ ] **Step 3: Rewrite the Portal CSS head**

Replace from the `/* ---------- Portal aesthetic ----------` comment through the end of the `.portal-theme-stargate .portal-frame::before` rule (keeping `@property --portal-angle` for now; Task 4 removes it, since `.home-card-portal` still spins until then) with:

```css
/* ---------- Portal aesthetic ----------
   Applied while The Portal tab is active: a warm black hole (cream photon
   ring, peach and dusty-rose disk) behind glass. The image is pre-blurred
   (imageBackdrop.ts), so no glass here pays for a live blur. The app webview
   is native and covers `.portal-screen`, so the bezel, navbar and sidebar
   carry the look. On <body> as well (Index.tsx) so portalled dialogs, menus
   and toasts follow it; the Home box takes the --portal-* colours. */
@property --portal-angle {
  syntax: "<angle>";
  inherits: true;
  initial-value: 0deg;
}

@layer components {
  .portal-root,
  body.portal-theme,
  .home-space-portal {
    --portal-bg: #060404;
    --portal-surface: rgb(18 11 12 / 0.55);
    --portal-a: #f4b89a;
    --portal-b: #d8a0a8;
    --portal-cream: #fff1e6;
    --portal-hover-text: #fff4ea;
  }

  .portal-root,
  body.portal-theme {
    --background: 12 30% 3%;
    --popover: 12 22% 8%;
    --card: 12 18% 11%;
    --secondary: 14 16% 16%;
    --muted: 14 14% 14%;
    --border: 18 22% 24%;
    --input: 18 22% 24%;
    --primary: 20 82% 78%;
    --primary-foreground: 12 40% 8%;
    --ring: 22 90% 84%;
    --accent: 352 42% 74%;
    --glow-indigo: 20 85% 72%;
    --muted-foreground: 20 18% 76%;
    --glass-border: 28 100% 94%;
  }

  .portal-root {
    background: var(--portal-bg);
  }

  /* Frame: a glass bezel around the app webview. The hairline and highlight
     are inset shadows, so the 3px padding the webview is measured inside
     stays exactly as it was. */
  .portal-frame {
    position: relative;
    border-radius: 16px;
    padding: 3px;
    background: linear-gradient(160deg, rgb(255 241 230 / 0.16), rgb(40 22 22 / 0.28) 45%, rgb(244 184 154 / 0.12));
    box-shadow:
      inset 0 0 0 1px rgb(255 241 230 / 0.22),
      inset 0 1px 0 rgb(255 248 240 / 0.35),
      0 0 40px color-mix(in srgb, var(--portal-a) 22%, transparent),
      0 20px 60px rgb(0 0 0 / 0.55);
  }

  /* A still, soft halo: peach where the disk is bright, rose on the far side. */
  .portal-frame::before {
    content: "";
    position: absolute;
    inset: -10px;
    z-index: -1;
    border-radius: 22px;
    background: linear-gradient(
      120deg,
      color-mix(in srgb, var(--portal-a) 40%, transparent),
      transparent 40% 60%,
      color-mix(in srgb, var(--portal-b) 35%, transparent)
    );
    filter: blur(28px);
    opacity: 0.5;
    pointer-events: none;
  }

  /* Ring radius 16px, ring 3px: a square corner clears the inner curve once it
     is at least 7px in from the frame's edge, so the screen sits 3px + 5px in. */
  .portal-host {
    position: relative;
    border-radius: 13px;
    padding: 5px;
    background: rgb(14 8 9 / 0.42);
  }

  .portal-screen {
    position: relative;
    border-radius: 4px;
    background: rgb(10 6 7 / 0.5);
  }

  /* Placeholder content fades in on each app switch, matching the page fade
     done inside the webview (src-tauri/src/portal.rs). */
  .portal-fade {
    animation: portal-fade-in 220ms ease-out;
  }

  @keyframes portal-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
```

This removes the three `.portal-theme-*` blocks, every `.portal-backdrop*` rule and the horizon/stargate frame overrides.

- [ ] **Step 4: Text, skeleton, tooltip and sidebar tweaks**

In the same section:

`.portal-gradient-text` background becomes:

```css
    background: linear-gradient(90deg, var(--portal-a, hsl(239 84% 67%)), var(--portal-cream, #fff), var(--portal-b, hsl(160 84% 39%)), var(--portal-a, hsl(239 84% 67%)));
```

`.portal-root .portal-tooltip`: add `backdrop-filter: blur(12px);` after `border`. (Small element; the surface is now translucent.)

Comment above `.portal-pill:not(.portal-pill-active):hover`: replace "in the theme colours" with "in the Portal's peach and rose" and "theme-tinted" with "cream". Same wording fix in the tooltip comment and the skeleton comment ("tinted by the theme" → "tinted peach").

`.sidebar-portal` becomes:

```css
  /* Sidebar while The Portal is open: warm dark glass over the black hole,
     edged with a faint cream line instead of the glass border. */
  .sidebar-portal {
    background: linear-gradient(180deg, rgb(40 22 20 / 0.55) 0%, rgb(8 5 6 / 0.62) 50%, rgb(36 20 24 / 0.5) 100%);
    border-color: transparent;
    box-shadow:
      inset -1px 0 0 rgb(255 241 230 / 0.18),
      6px 0 28px color-mix(in srgb, var(--portal-a) 14%, transparent);
  }
```

Delete keyframes `portal-rotate-reverse`, `portal-sway`, `portal-breathe`, `portal-ripple`, `portal-flare` (now unused; verify with grep across `src/`).

Reduced-motion block for the Portal: remove `.portal-backdrop-glow`, `.portal-backdrop::after`, `.portal-frame`, `.portal-frame::before` from the selector list (they no longer animate). Keep `.portal-fade`, `.portal-gradient-text`, `.portal-orbit-icon`.

- [ ] **Step 5: `Navigation.tsx` comment**

Line 61: `// Colours come from the Portal palette on the page root (index.css).`

- [ ] **Step 6: Verify nothing references removed names**

Run:

```bash
grep -rn "portal-theme-\|portal-backdrop\|PortalBackdrop\|PORTAL_THEME_CLASS\|portal-sway\|portal-breathe\|portal-ripple\|portal-flare\|portal-rotate-reverse" src
```

Expected: only `HomeSpaces.tsx` (`PORTAL_THEME_CLASS`, fixed in Task 4).

Run: `npm run typecheck`
Expected: PASS (`PORTAL_THEME_CLASS` still exists in the store until Task 5).

- [ ] **Step 7: Commit**

```bash
git add -A src/pages/Index.tsx src/index.css src/components/layout/Navigation.tsx src/components/layout/PortalBackdrop.tsx
git commit -m "feat(portal): black hole backdrop with glass bezel and warm palette"
```

---

### Task 4: Home widget glass

**Files:**
- Modify: `src/components/views/HomeSpaces.tsx` (header comment, imports line 19, `PortalSpace` lines 94-150)
- Modify: `src/index.css` Home Portal rules (~lines 3630-3655), Home reduced-motion list (~line 4142), Portal keyframes

**Interfaces:**
- Consumes: `useImageBackdrop`, `CARD_BACKDROP_BLUR` from `@/lib/imageBackdrop`; `--portal-*` on `.home-space-portal` from Task 3.

- [ ] **Step 1: `PortalSpace`**

Imports:

```ts
import { CARD_BACKDROP_BLUR, useImageBackdrop } from "@/lib/imageBackdrop";
import { portal, selectBadgeTotal } from "@/lib/portalStore";
```

Header comment: "following the user's Nebula palette and Portal theme" → "following the user's Nebula palette; the Portal box sits over its black hole".

Above `PortalSpace`, add:

```ts
/** The Portal's peach and rose (index.css), for its app tooltips. */
const PORTAL_TIP_COLORS: [string, string] = ["#f4b89a", "#d8a0a8"];
```

In `PortalSpace`:

```tsx
  const { apps, badges } = state;
  const unread = selectBadgeTotal(state);
  const backdropUrl = useImageBackdrop("portal", CARD_BACKDROP_BLUR);
  const shown = apps.slice(0, 6);
```

```tsx
    <div className="home-space home-space-portal">
      <span aria-hidden="true" className="home-backdrop-scene">
        {backdropUrl && <span className="home-backdrop-image" style={{ backgroundImage: `url("${backdropUrl}")` }} />}
      </span>
      <div onClick={onClick} className="home-card-portal h-full p-6 cursor-pointer group">
```

`GlassTip` gets `colors={PORTAL_TIP_COLORS}` (drop the swatch expression).

- [ ] **Step 2: Home Portal CSS**

Replace `.home-space-portal::before`, `.home-card-portal` and `.home-card-portal:hover` with:

```css
  /* Portal: its black hole behind the box, already blurred at 25% Image blur
     (imageBackdrop.ts), under a very light warm glass like the Orbit's. */
  .home-space-portal {
    --primary: 20 82% 80%;
    --muted-foreground: 20 22% 82%;
  }

  .home-space-portal::before {
    background: #000;
    box-shadow: 0 0 32px color-mix(in srgb, var(--portal-a) 16%, transparent);
  }

  /* The hole sits right of centre, a little above the middle. */
  .home-space-portal .home-backdrop-image {
    background-position: 60% 48%;
  }

  .home-card-portal {
    border-radius: 1rem;
    color: #fff8f2;
    background: linear-gradient(160deg, rgb(40 22 20 / 0.1), rgb(10 5 6 / 0.32));
    border: 1px solid rgb(255 241 230 / 0.16);
    text-shadow: 0 1px 8px rgb(10 4 4 / 0.75);
    box-shadow:
      0 8px 32px rgb(8 2 2 / 0.45),
      inset 0 1px 0 rgb(255 241 230 / 0.1);
    transition: border-color 300ms, box-shadow 300ms;
  }

  .home-card-portal:hover {
    border-color: rgb(244 184 154 / 0.45);
    box-shadow:
      0 8px 32px rgb(8 2 2 / 0.45),
      0 0 30px rgb(244 184 154 / 0.22),
      inset 0 1px 0 rgb(255 241 230 / 0.14);
  }
```

`.home-portal-app` and its hover rules stay (they read `--portal-a` / `--portal-b`).

Home reduced-motion list: remove `.home-card-portal` (no longer animates).

- [ ] **Step 3: Drop the spin keyframes**

Now nothing spins: delete `@property --portal-angle { ... }` and `@keyframes portal-spin { ... }`. Confirm:

```bash
grep -rn "portal-angle\|portal-spin" src
```

Expected: no matches.

- [ ] **Step 4: Typecheck and Home tests**

Run: `npm run typecheck && npx vitest run src/components/views/HomeGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/HomeSpaces.tsx src/index.css
git commit -m "feat(home): Portal box as light glass over its black hole"
```

---

### Task 5: Remove theme state from the store

**Files:**
- Modify: `src/lib/portalStore.ts` (lines 1-58, 70, 95-110, 196-200)
- Test: `src/lib/portalStore.test.ts` (lines 2, 18-32, 171-176)

- [ ] **Step 1: Update tests first**

Import line:

```ts
import { APPS_KEY, ACTIVE_KEY, portal, selectBadgeTotal } from "./portalStore";
```

Replace the first two cases with:

```ts
  it("starts empty", () => {
    const s = portal.getState();
    expect(s.apps).toEqual([]);
    expect(s.activeId).toBeNull();
    expect(s.occluders).toBe(0);
    expect(s).not.toHaveProperty("theme");
  });

  it("falls back to no apps when storage holds corrupt JSON", () => {
    localStorage.setItem(APPS_KEY, "{oops");
    portal._reset();
    expect(portal.getState().apps).toEqual([]);
  });

  it("ignores a theme saved by an older version", () => {
    localStorage.setItem("crystal-os-portal-theme", "stargate");
    localStorage.setItem(APPS_KEY, JSON.stringify([discord]));
    portal._reset();
    expect(portal.getState().apps.map((a) => a.id)).toEqual(["discord"]);
    expect(portal.getState()).not.toHaveProperty("theme");
  });
```

Delete the "persists the theme and ignores unknown values" case.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/lib/portalStore.test.ts`
Expected: FAIL on `not.toHaveProperty("theme")`.

- [ ] **Step 3: Strip theme from the store**

- Header comment: "so the sidebar badge, the Settings theme picker, and the page itself share it" → "so the sidebar badge, the Home box and the page itself share it"; "The connected apps, the last active app, and the theme persist" → "The connected apps and the last active app persist".
- Delete `PortalTheme`, `PortalThemeInfo`, `PORTAL_THEMES`, `DEFAULT_PORTAL_THEME`, `PORTAL_THEME_CLASS` (with its comment), `THEME_KEY`.
- Delete `theme: PortalTheme;` from `PortalState`, `isTheme`, the `theme` read and field in `load()`, and `setTheme`.

- [ ] **Step 4: Run all checks**

Run: `npx vitest run src/lib/portalStore.test.ts && npm run typecheck && npm run lint`
Expected: PASS. Any remaining `theme` consumer of `usePortal()` shows up as a type error; fix it by removing the read.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portalStore.ts src/lib/portalStore.test.ts
git commit -m "refactor(portal): remove theme state"
```

---

### Task 6: Full verification and preview

- [ ] **Step 1: Whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 2: Preview in the browser pane**

Start the web dev server via `preview_start` (create `.claude/launch.json` with `npm run dev`, port from `vite.config.ts`, if missing). Sign-in may block: if so, report that and stop at screenshots of what renders.

Check, with screenshots:
- Portal tab: black hole visible behind navbar and around the glass bezel; empty state tiles readable; no spinning ring.
- Open the Add app dialog from the Portal: dialog uses peach primary (checks `body.portal-theme`). Switch to another tab: dialog colours no longer warm.
- Home tab: Portal box shows the image under light glass; hover adds a peach glow.
- `resize_window` with reduced motion is not available; instead `javascript_tool`: `getComputedStyle(document.querySelector('.portal-frame')).animationName` → `"none"`.
- `read_console_messages` with `onlyErrors: true` → none.

- [ ] **Step 3: Report**

Share screenshots and any deviations.
