# The Orbit: weekly and monthly reviews (v0.8.0)

Agreed in the 2026-10-03 session. A new section, between Home and the Engine, that reviews the last finished week or month and exports it to the vault.

## Decisions

| Topic | Decision |
| --- | --- |
| Name and icon | "The Orbit", lucide `Orbit`. The Portal moves to `AppWindow`. |
| Which period | The newest *finished* one. Weeks run Mon–Sun and are ready Sunday 18:00. Months are ready at 18:00 on their last day. Arrows browse earlier periods. |
| Completions | New `task_completions` table: a row per tick (repeating tasks once per completion). Unticking deletes the latest row. Title and category are copied. |
| Focus | New `focus_sessions` table: a row per finished focus phase, or per run reset/resized after ≥ 60 s. Paused time is excluded. |
| Vault notes | Count notes *created* in the period. Date order: frontmatter `created`, `date`, then a `YYYY-MM-DD` in the file name, then file creation time, then mtime. |
| Money | Income and spending, each vs the previous period, plus net. |
| Next period | Mini agenda: Google Calendar events plus open tasks (each task once). Grouped by day (weekly) or by week (monthly), with "+N more". |
| Names | First 5, then "+N more". Plain names. |
| Trends | Each stat vs the previous period and vs the 4-week / 3-month average. |
| Reflection | Optional: pick one of 3 prompts and/or write a note. Added to the export. |
| Export | `Reviews/Weekly/YYYY-Www.md` and `Reviews/Monthly/YYYY-MM.md`. Asks before overwriting. Reviews are not stored anywhere else. |
| Auto-export | Settings toggle, stored locally. Exports once per period, with no reflection, and never overwrites. |
| Ready badge | Dot on the nav icon and a chip on the Home card, stored locally. Cleared when that review is opened. |
| Home | The greeting/clock card becomes a liquid-glass card on the Orbit image, with a teaser line. It opens The Orbit. |
| Motion | Weekly/Monthly and period changes fade each card out and back in, 150 ms each way. The old review is held until the new data is ready. Performance mode skips the fade. |
| Theme | Ice/cyan, slate, lavender-mauve and rust over navy-black. Applied to every component, and to `body.orbit-theme` for portalled UI. |

## Units

- `supabase/migrations/0003_orbit_review.sql`: the two tables, indexes and RLS.
- `src/lib/orbitReview.ts`: pure period maths, stats, trends, agenda and markdown, tested in `orbitReview.test.ts`.
- `src/lib/orbitStore.ts`: local state for auto-export, seen reviews and the Weekly/Monthly view.
- `src/hooks/useOrbitReview.ts`: fetches the history and assembles a `Review`, plus the ready and teaser hooks.
- `src/components/views/OrbitPage.tsx`, `orbit/OrbitCharts.tsx`, `orbit/OrbitAutoExport.tsx`.
- Vault: the `created` field (`vaultCore.ts`, `vault.rs`, `server/obsidian/vault.ts`) and note creation (`POST /api/obsidian/create`, `createNoteNative`).
