import { CalendarPlus, Gauge } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { toast } from "sonner";
import { useTasks, type Task } from "@/contexts/AppContext";
import { localTimeZone, useCreateEvent } from "@/hooks/useGoogleCalendar";
import { formatEstimate, suggestNextTask, suggestUpcomingTask, todaysOpenTasks } from "@/lib/capacity";
import { capacityWindow, useCapacitySettings } from "@/lib/capacitySettings";
import { planToday } from "@/lib/freeSlot";
import { fromMinutes } from "@/lib/timeGrid";
import { toLocalDateStr } from "@/lib/utils";
import { pickedCalendarId, useTodayCapacity, type TodayCapacityState } from "@/hooks/useTodayCapacity";

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
  const tasks = useTasks();
  const createEvent = useCreateEvent();

  const scheduleToday = async () => {
    const now = new Date();
    const today = toLocalDateStr(now);
    const blocks = planToday({
      tasks: todaysOpenTasks(tasks, today),
      events: capacity.events,
      now,
      window: capacityWindow(settings),
    });
    if (!blocks.length) {
      toast("Nothing to schedule", { description: "No estimated task for today fits a free slot, or they are already blocked." });
      return;
    }
    const results = await Promise.allSettled(
      blocks.map(({ task, start, end }) =>
        createEvent.mutateAsync({
          calendarId: pickedCalendarId(),
          input: {
            summary: task.name,
            allDay: false,
            startDate: today,
            endDate: today,
            startTime: fromMinutes(start),
            endTime: fromMinutes(end),
            timeZone: localTimeZone(),
          },
        }),
      ),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    const done = results.filter((r) => r.status === "fulfilled").length;
    if (done) toast.success(`Blocked time for ${done} task${done === 1 ? "" : "s"}`, { description: "See them in The Horizon." });
    if (failed) toast.error("Could not block the time", { description: String(failed.reason?.message ?? failed.reason) });
  };

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
          <span className="text-foreground tabular-nums"><AnimatedNumber value={capacity.plannedMinutes} format={formatEstimate} /></span> planned
        </span>
        <span>
          <span className="text-foreground tabular-nums"><AnimatedNumber value={capacity.freeMinutes} format={formatEstimate} /></span> free
          {capacity.windowOver
            ? ` · work window (${windowLabel}) is over`
            : ` of ${formatEstimate(capacity.remainingWindowMinutes)} left in ${windowLabel}`}
        </span>
        {capacity.busyMinutes > 0 && (
          <span>
            <span className="text-foreground tabular-nums"><AnimatedNumber value={capacity.busyMinutes} format={formatEstimate} /></span> in events
          </span>
        )}
      </div>
      {settings.autoSchedule && capacity.calendarConnected && !capacity.windowOver && (
        <button
          type="button"
          onClick={() => void scheduleToday()}
          disabled={createEvent.isPending}
          className="flex items-center gap-1 rounded-md px-2 py-1 -ml-2 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          Schedule today
        </button>
      )}
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
 * card's open tasks, most pressing first. Once they are all done, the nudge
 * offers one of `upcoming` instead (highest priority first, then earliest
 * date), with `when` its day as the card labels it.
 */
export function CapacityStrip({
  openTasks,
  upcoming = [],
}: {
  openTasks: Task[];
  upcoming?: { task: Task; when: string }[];
}) {
  const capacity = useTodayCapacity();
  const tone = toneOf(capacity);
  const suggestion =
    openTasks.length > 0
      ? suggestNextTask(openTasks, capacity.freeMinutes, capacity.hourKey)
      : suggestUpcomingTask(upcoming, capacity.freeMinutes, capacity.hourKey);
  return (
    <div className="mb-3 space-y-1">
      <FreeTimeTrack capacity={capacity} />
      <p className="text-[11px] text-muted-foreground">
        {capacity.windowOver ? (
          "Work day's over"
        ) : (
          <>
            <span className="tabular-nums text-foreground/90"><AnimatedNumber value={capacity.freeMinutes} format={formatEstimate} /></span> free
          </>
        )}
        {capacity.plannedMinutes > 0 && (
          <>
            {" · "}
            <span className="tabular-nums"><AnimatedNumber value={capacity.plannedMinutes} format={formatEstimate} /></span> planned ·{" "}
            <span className={TEXT[tone]}>{verdict(capacity)}</span>
          </>
        )}
        {capacity.unestimated > 0 && <> · {capacity.unestimated} unestimated</>}
      </p>
      {suggestion && <p data-private className="text-[11px] italic text-primary/90 truncate">{suggestion.text}</p>}
    </div>
  );
}
