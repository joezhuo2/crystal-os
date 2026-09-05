# Changelog

All notable changes to Crystal OS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-05

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
