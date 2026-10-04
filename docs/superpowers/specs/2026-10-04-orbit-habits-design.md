# The Orbit: habit tracker (v0.8.10)

Agreed in the 2026-10-04 session. Habits are ticked off in the Orbit's Today card and reviewed in the weekly and monthly reviews.

## Decisions

| Topic | Decision |
| --- | --- |
| Placement | A Habits block inside the Today card, below the focus/mood/reflection form, behind a hairline. |
| Ticking | One `orbit-chip` per active habit with its colour dot; on = `orbit-chip-on` with a check. Only today can be ticked. Saves to Supabase at once, optimistic, rolled back with a toast on failure. Not written to the daily note. |
| Grid | One combined grid that follows the Weekly/Monthly switch: this week as 7 cells (Mon–Sun), or this month as a Monday-first calendar. Cell fill is the ice/mauve gradient scaled by done/total, with the count printed. Today outlined, future days dashed. |
| Grid hover | GlassTip (`tone="orbit"`): "Mon, Oct 5 · 2/4 habits", then up to 3 done habits with colour dots and "+N more". |
| Streaks | Consecutive done days. Today is grace: an unticked today counts up to yesterday. |
| Manager | Orbit-themed Radix dialog opened from a gear in the Habits header: add (name ≤ 40 chars, colour), rename in place, recolour (9 Orbit presets + hex), drag to reorder by the grip (arrow keys too), remove with confirmation. |
| Remove | Archives (`archived_at`). History stays and counts in reviews of periods the habit was active. |
| Denominator | A habit counts on days from its creation day until its archive day. Grid totals and review rates only use those days (and never days after today). |
| Review card | Full-width Habits card after the Money/Trends/Vault row: per habit days done / active, rate bar in its colour, longest streak in the period, streak at the period end (or today). Overall rate in the header. Hidden when no habit was active. |
| Review note | Optional "Habit note" textarea in the Habits card, finished periods only. Kept per period while browsing; exported with the review, stored nowhere else. |
| Trend | "Habit completion" (percent) in Trends, only when habits exist. |
| Export | `habits_completion: N` in frontmatter; `## Habits` with a table (Habit, Done, Rate, Longest streak, Streak at end) and `### Note`. Auto-export has no note. |
| Home | Unchanged. |

## Units

- `supabase/migrations/0004_habits.sql`: `habits`, `habit_checks`, indexes, RLS.
- `src/lib/habits.ts`: pure active-day, streak, grid and summary maths, tested in `habits.test.ts`.
- `src/lib/orbitReview.ts`: `habitRate` stat and trend, `Review.habits`, the export section.
- `src/hooks/useHabits.ts`: one query (`["app", "habits"]`, cleared on sign-out) and the optimistic writes.
- `src/components/views/orbit/HabitsToday.tsx`, `HabitManager.tsx`; `HabitsCard` in `OrbitPage.tsx`.
- `GlassTip` gained a `detail` slot for the grid's list.
