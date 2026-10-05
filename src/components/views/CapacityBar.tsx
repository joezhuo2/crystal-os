import { Gauge } from "lucide-react";
import type { Task } from "@/contexts/AppContext";
import { formatEstimate, suggestNextTask } from "@/lib/capacity";
import { useCapacitySettings } from "@/lib/capacitySettings";
import { useTodayCapacity, type TodayCapacityState } from "@/hooks/useTodayCapacity";

/** "5 PM", "5:30 PM". */
function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", ...(m ? { minute: "2-digit" } : {}) });
}

type Tone = "fits" | "tight" | "over" | "idle";

function toneOf(c: TodayCapacityState): Tone {
  if (c.plannedMinutes === 0) return "idle";
  if (!c.fits) return "over";
  return c.plannedMinutes / Math.max(1, c.freeMinutes) > 0.85 ? "tight" : "fits";
}

const FILL: Record<Tone, string> = {
  fits: "bg-emerald-400/80",
  tight: "bg-amber-400/80",
  over: "bg-red-400/85",
  idle: "bg-white/20",
};
const TEXT: Record<Tone, string> = {
  fits: "text-emerald-300",
  tight: "text-amber-300",
  over: "text-red-300",
  idle: "text-muted-foreground",
};

function verdict(c: TodayCapacityState): string {
  if (c.plannedMinutes === 0) return c.windowOver ? "Day's done" : "Nothing estimated";
  if (!c.fits) return `Over by ${formatEstimate(-c.slackMinutes)}`;
  return c.slackMinutes === 0 ? "Just fits" : `Fits · ${formatEstimate(c.slackMinutes)} spare`;
}

/** Planned as a share of free time, and how far past it, both 0–100. */
function fillWidths(c: TodayCapacityState): { planned: number; overflow: number } {
  if (c.plannedMinutes === 0) return { planned: 0, overflow: 0 };
  if (c.freeMinutes === 0) return { planned: 0, overflow: 100 };
  if (c.fits) return { planned: (c.plannedMinutes / c.freeMinutes) * 100, overflow: 0 };
  // Over: the whole track is the planned work, the free part of it in colour
  // and the part that does not fit striped.
  const free = (c.freeMinutes / c.plannedMinutes) * 100;
  return { planned: free, overflow: 100 - free };
}

function Track({ capacity, thin }: { capacity: TodayCapacityState; thin?: boolean }) {
  const tone = toneOf(capacity);
  const { planned, overflow } = fillWidths(capacity);
  return (
    <div
      role="meter"
      aria-label="Planned work against free time today"
      aria-valuemin={0}
      aria-valuemax={capacity.freeMinutes}
      aria-valuenow={Math.min(capacity.plannedMinutes, capacity.freeMinutes)}
      aria-valuetext={`${formatEstimate(capacity.plannedMinutes)} planned, ${formatEstimate(capacity.freeMinutes)} free`}
      className={`flex w-full overflow-hidden rounded-full bg-white/10 ${thin ? "h-1.5" : "h-2.5"}`}
    >
      <div className={`h-full transition-[width] duration-500 ${FILL[tone]}`} style={{ width: `${planned}%` }} />
      {overflow > 0 && (
        <div
          className="h-full bg-red-500/60 transition-[width] duration-500"
          style={{
            width: `${overflow}%`,
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.18) 4px 8px)",
          }}
        />
      )}
    </div>
  );
}

function unestimatedNote(n: number): string {
  return `${n} task${n === 1 ? "" : "s"} without an estimate`;
}

/** The full bar, at the top of The Engine. */
export function CapacityCard() {
  const capacity = useTodayCapacity();
  const settings = useCapacitySettings();
  const tone = toneOf(capacity);
  const windowLabel = `${formatClock(settings.dayStart)}–${formatClock(settings.dayEnd)}`;

  return (
    <section aria-labelledby="capacity-heading" className="glass-card p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 id="capacity-heading" className="text-xs uppercase tracking-widest text-muted-foreground">
          Fits today?
        </h2>
        <span className={`ml-auto text-xs font-semibold ${TEXT[tone]}`} aria-live="polite">
          {verdict(capacity)}
        </span>
      </div>
      <Track capacity={capacity} />
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>
          <span className="text-foreground tabular-nums">{formatEstimate(capacity.plannedMinutes)}</span> planned
        </span>
        <span>
          <span className="text-foreground tabular-nums">{formatEstimate(capacity.freeMinutes)}</span> free
          {capacity.windowOver
            ? ` · work window (${windowLabel}) is over`
            : ` of ${formatEstimate(capacity.remainingWindowMinutes)} left in ${windowLabel}`}
        </span>
        {capacity.busyMinutes > 0 && (
          <span>
            <span className="text-foreground tabular-nums">{formatEstimate(capacity.busyMinutes)}</span> in events
          </span>
        )}
      </div>
      {(capacity.unestimated > 0 || (!capacity.calendarConnected && !capacity.loadingEvents)) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80">
          {capacity.unestimated > 0 && <span className="text-amber-300/90">{unestimatedNote(capacity.unestimated)}</span>}
          {!capacity.calendarConnected && !capacity.loadingEvents && (
            <span>Calendar not connected: free time is the work window only</span>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Free time on Home's Engine card. The track is what is left of the work
 * window; the pale fill is the free part of it (events take the rest), and
 * the planned work sits over it in the verdict's colour, capped at the free
 * time (the text says how far over).
 */
function FreeTimeTrack({ capacity }: { capacity: TodayCapacityState }) {
  const tone = toneOf(capacity);
  const left = Math.max(1, capacity.remainingWindowMinutes);
  const free = capacity.windowOver ? 0 : (capacity.freeMinutes / left) * 100;
  const planned = (Math.min(capacity.plannedMinutes, capacity.freeMinutes) / left) * 100;
  return (
    <div
      role="meter"
      aria-label="Free time left today"
      aria-valuemin={0}
      aria-valuemax={capacity.remainingWindowMinutes}
      aria-valuenow={capacity.freeMinutes}
      aria-valuetext={`${formatEstimate(capacity.freeMinutes)} free of ${formatEstimate(capacity.remainingWindowMinutes)} left, ${formatEstimate(capacity.plannedMinutes)} planned`}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10"
    >
      <div className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-500" style={{ width: `${free}%` }} />
      <div
        className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${FILL[tone]}`}
        style={{ width: `${planned}%` }}
      />
    </div>
  );
}

/**
 * The compact bar on Home's Engine card: free time left today, the planned
 * work against it, and a nudge toward the next task. `openTasks` are the
 * card's open tasks, most pressing first.
 */
export function CapacityStrip({ openTasks }: { openTasks: Task[] }) {
  const capacity = useTodayCapacity();
  const tone = toneOf(capacity);
  const suggestion = suggestNextTask(openTasks, capacity.freeMinutes, capacity.hourKey);
  return (
    <div className="mb-3 space-y-1">
      <FreeTimeTrack capacity={capacity} />
      <p className="text-[11px] text-muted-foreground">
        {capacity.windowOver ? (
          "Work day's over"
        ) : (
          <>
            <span className="tabular-nums text-foreground/90">{formatEstimate(capacity.freeMinutes)}</span> free
          </>
        )}
        {capacity.plannedMinutes > 0 && (
          <>
            {" · "}
            <span className="tabular-nums">{formatEstimate(capacity.plannedMinutes)}</span> planned ·{" "}
            <span className={TEXT[tone]}>{verdict(capacity)}</span>
          </>
        )}
        {capacity.unestimated > 0 && <> · {capacity.unestimated} unestimated</>}
      </p>
      {suggestion && <p className="text-[11px] italic text-primary/90 truncate">{suggestion.text}</p>}
    </div>
  );
}
