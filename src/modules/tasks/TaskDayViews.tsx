import { useMemo, useState, type ReactNode } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { AnimatePresence } from "framer-motion";
import type { Task } from "@/contexts/AppContext";
import { upcomingByDate } from "@/lib/homeTasks";
import { formatSnoozeDate } from "@/lib/snooze";
import { addDays, isTaskOverdue, taskFallsOnDate, WEEKDAY_SHORT } from "@/lib/utils";

type Card = (task: Task, overdue?: boolean) => ReactNode;

const EMPTY = "glass-card rounded-xl px-4 py-6 text-center text-xs text-muted-foreground";
const HEADING = "px-1 text-xs uppercase tracking-widest text-muted-foreground";

const weekdayOf = (date: string) => WEEKDAY_SHORT[new Date(`${date}T12:00:00`).getDay()];

export function TodayView({ tasks, today, card }: { tasks: Task[]; today: string; card: Card }) {
  const [picked, setPicked] = useState(today);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const day = days.includes(picked) ? picked : today;
  const { counts, overdue, due } = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    const overdue = day === today ? open.filter((t) => isTaskOverdue(t, today)) : [];
    return {
      counts: days.map((d) => open.filter((t) => taskFallsOnDate(t, d)).length),
      overdue,
      due: open.filter((t) => taskFallsOnDate(t, day) && !overdue.includes(t)),
    };
  }, [tasks, today, day, days]);

  return (
    <div className="space-y-4 min-h-[120px]">
      <div data-fade-unit role="group" aria-label="Week" className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const count = counts[i];
          const on = d === day;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={`${formatSnoozeDate(d, today)}, ${count} task${count === 1 ? "" : "s"}`}
              onClick={() => setPicked(d)}
              className={`glass-card-hover rounded-xl py-2 text-center transition-colors ${on ? "ring-1 ring-primary bg-primary/10" : ""}`}
            >
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                {d === today ? "Today" : weekdayOf(d)}
              </span>
              <span className="block text-sm font-semibold tabular-nums">{Number(d.slice(8))}</span>
              <span className={`block text-[10px] tabular-nums ${count ? "text-primary" : "text-muted-foreground/50"}`}><AnimatedNumber value={count} /></span>
            </button>
          );
        })}
      </div>
      {overdue.length > 0 && (
        <section aria-label="Overdue" className="space-y-2">
          <h2 data-fade-unit className={`${HEADING} text-amber-300`}>Overdue</h2>
          <AnimatePresence initial={false}>{overdue.map((t) => card(t, true))}</AnimatePresence>
        </section>
      )}
      <div className="space-y-2">
        <AnimatePresence initial={false}>{due.map((t) => card(t))}</AnimatePresence>
      </div>
      {!overdue.length && !due.length && (
        <p data-fade-unit className={EMPTY}>
          Nothing {day === today ? "left for today" : `on ${formatSnoozeDate(day, today)}`}.
        </p>
      )}
    </div>
  );
}

export function UpcomingView({ tasks, today, card }: { tasks: Task[]; today: string; card: Card }) {
  const groups = useMemo(() => upcomingByDate(tasks, today), [tasks, today]);
  return (
    <div className="space-y-4 min-h-[120px]">
      {groups.map(({ date, tasks: list }) => (
        <section key={date} aria-label={formatSnoozeDate(date, today)} className="space-y-2">
          <h2 data-fade-unit className={HEADING}>
            {date === addDays(today, 1) ? "Tomorrow" : formatSnoozeDate(date, today)}
          </h2>
          <AnimatePresence initial={false}>{list.map((t) => card(t))}</AnimatePresence>
        </section>
      ))}
      {!groups.length && <p data-fade-unit className={EMPTY}>Nothing in the next two weeks.</p>}
    </div>
  );
}

export function SomedayView({ tasks, card }: { tasks: Task[]; card: Card }) {
  return (
    <div className="space-y-2 min-h-[120px]">
      <AnimatePresence initial={false}>{tasks.map((t) => card(t))}</AnimatePresence>
      {!tasks.length && <p data-fade-unit className={EMPTY}>Nothing in Someday. Snooze a task to Someday to park it here.</p>}
    </div>
  );
}
