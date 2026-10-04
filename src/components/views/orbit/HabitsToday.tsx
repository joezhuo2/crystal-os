import { memo, useState } from "react";
import { Check, Plus, Settings2 } from "lucide-react";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { HabitManager } from "@/components/views/orbit/HabitManager";
import { HabitsError, useHabitActions, useHabitsData } from "@/hooks/useHabits";
import {
  TIP_NAMES_SHOWN,
  WEEKDAY_LABELS,
  currentStreak,
  dayShare,
  habitGrid,
  indexChecks,
  isActiveOn,
  type HabitDay,
} from "@/lib/habits";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const streakLabel = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** The habits done on a day, the first few by name, then "+N more". */
function DoneList({ cell }: { cell: HabitDay }) {
  if (!cell.done.length) return null;
  const shown = cell.done.slice(0, TIP_NAMES_SHOWN);
  const more = cell.done.length - shown.length;
  return (
    <span className="orbit-habit-tip-list">
      {shown.map((h) => (
        <span key={h.id} className="orbit-habit-tip-item">
          <span className="orbit-habit-dot" style={{ background: h.color }} aria-hidden="true" />
          <span className="truncate">{h.name}</span>
        </span>
      ))}
      {more > 0 && <span className="orbit-habit-tip-more">+{more} more</span>}
    </span>
  );
}

const GridCell = memo(function GridCell({ cell, size }: { cell: HabitDay | null; size: "week" | "month" }) {
  if (!cell) return <li className="orbit-habit-cell orbit-habit-cell-pad" aria-hidden="true" />;
  const share = dayShare(cell);
  const count = cell.done.length;
  const label = cell.future
    ? dayLabel(cell.day)
    : cell.total
      ? `${dayLabel(cell.day)} · ${count}/${cell.total} ${cell.total === 1 ? "habit" : "habits"}`
      : dayLabel(cell.day);
  const hint = cell.future ? "Still to come" : !cell.total ? "No habits yet" : !count ? "None done" : undefined;
  return (
    <GlassTip label={label} hint={hint} detail={<DoneList cell={cell} />} tone="orbit">
      <li
        tabIndex={0}
        aria-label={`${label}${count ? `: ${cell.done.map((h) => h.name).join(", ")}` : ""}`}
        className={`orbit-habit-cell ${size === "week" ? "orbit-habit-cell-week" : ""} ${cell.future ? "orbit-habit-cell-future" : ""} ${
          cell.isToday ? "orbit-habit-cell-today" : ""
        } ${share > 0.6 ? "orbit-habit-cell-bright" : ""}`}
        style={count ? ({ "--share": share } as React.CSSProperties) : undefined}
        data-done={count > 0 || undefined}
      >
        {size === "week" && <span className="orbit-habit-cell-date">{Number(cell.day.slice(8))}</span>}
        {count > 0 && <span className="orbit-habit-cell-count">{count}</span>}
      </li>
    </GlassTip>
  );
});

/**
 * The Today card's habits: a chip per habit to tick off today, and a grid of
 * this week or this month (following the Weekly/Monthly switch), each day
 * lit by how many habits were done.
 */
export function HabitsToday({ kind, today }: { kind: "weekly" | "monthly"; today: string }) {
  const query = useHabitsData();
  const { setToday } = useHabitActions();
  const [managing, setManaging] = useState(false);

  const habits = query.data?.habits ?? [];
  const checks = query.data?.checks ?? [];
  const active = habits.filter((h) => isActiveOn(h, today));
  const index = indexChecks(checks);
  const doneToday = active.filter((h) => index.get(h.id)?.has(today)).length;
  const cells = habitGrid(kind, today, habits, checks);
  const missing = query.error instanceof HabitsError && query.error.missingTables;

  return (
    <div className="orbit-habits">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="orbit-habits-title">
          Habits
          {active.length > 0 && (
            <span className="orbit-habits-count">
              {doneToday}/{active.length} today
            </span>
          )}
        </h3>
        {!query.error && (
          <GlassTip label="Manage habits" hint="Add, rename, recolour or reorder" tone="orbit">
            <button type="button" className="orbit-icon-button" onClick={() => setManaging(true)} aria-label="Manage habits">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </GlassTip>
        )}
      </div>

      {query.error ? (
        <p className="orbit-empty">
          {missing ? (
            <>
              Habits need the <span className="orbit-path">0004_habits.sql</span> migration. Run it in the Supabase SQL editor.
            </>
          ) : (
            `Couldn't load your habits: ${query.error.message}`
          )}
        </p>
      ) : query.isLoading ? (
        <div className="flex gap-2" role="status" aria-label="Loading habits">
          <div className="orbit-skeleton-bar w-20 h-6" />
          <div className="orbit-skeleton-bar w-24 h-6" />
          <div className="orbit-skeleton-bar w-16 h-6" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
          <div className="flex flex-wrap content-start gap-1.5 min-w-0" role="group" aria-label="Today's habits">
            {active.length === 0 ? (
              <>
                <p className="orbit-empty w-full mb-1">No habits yet. Add a few to tick off each day.</p>
                <button type="button" className="orbit-chip inline-flex items-center gap-1" onClick={() => setManaging(true)}>
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  Add a habit
                </button>
              </>
            ) : (
              active.map((h) => {
                const days = index.get(h.id) ?? new Set<string>();
                const done = days.has(today);
                const streak = currentStreak(days, today);
                return (
                  <GlassTip
                    key={h.id}
                    label={h.name}
                    hint={`${streak ? `Streak: ${streakLabel(streak)}` : "No streak yet"} · ${done ? "Done today" : "Tick for today"}`}
                    tone="orbit"
                  >
                    <button
                      type="button"
                      aria-pressed={done}
                      onClick={() => void setToday(h.id, !done)}
                      className={`orbit-chip orbit-habit-chip ${done ? "orbit-chip-on" : ""}`}
                      style={{ "--habit": h.color } as React.CSSProperties}
                    >
                      {done ? (
                        <Check className="w-3 h-3 orbit-habit-check" aria-hidden="true" />
                      ) : (
                        <span className="orbit-habit-dot" style={{ background: h.color }} aria-hidden="true" />
                      )}
                      <span className="truncate">{h.name}</span>
                    </button>
                  </GlassTip>
                );
              })
            )}
          </div>

          <div className={kind === "weekly" ? "orbit-habit-grid-week" : "orbit-habit-grid-month"}>
            <ol className="orbit-habit-grid orbit-habit-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((d) => (
                <li key={d}>{kind === "weekly" ? d : d[0]}</li>
              ))}
            </ol>
            <ol className="orbit-habit-grid" aria-label={kind === "weekly" ? "Habits this week" : "Habits this month"}>
              {cells.map((cell, i) => (
                <GridCell key={cell?.day ?? `pad-${i}`} cell={cell} size={kind === "weekly" ? "week" : "month"} />
              ))}
            </ol>
          </div>
        </div>
      )}

      <HabitManager open={managing} onOpenChange={setManaging} />
    </div>
  );
}
