import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { m } from "framer-motion";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { parseRecurrence, type CalendarEvent } from "@/hooks/useGoogleCalendar";
import type { Task } from "@/contexts/AppContext";
import { taskColor, tasksForDate } from "@/lib/horizonDots";
import { toLocalDateStr } from "@/lib/utils";
import { usePerfSettings } from "@/lib/perfSettings";
import { MINUTES_PER_DAY, draggedStart, fromMinutes, layoutDay, snapMinutes } from "@/lib/timeGrid";

/** Height of one hour, in px. */
const HOUR_PX = 48;
const PX_PER_MIN = HOUR_PX / 60;
/** Where the grid opens scrolled to when today isn't on screen. */
const DEFAULT_SCROLL_HOUR = 7;

/** Pointer travel, in px, before a press on an event becomes a drag. */
const DRAG_THRESHOLD_PX = 4;
/** How far a paged view slides in from, in px. */
const SLIDE_PX = 48;

interface DragState {
  id: string;
  originX: number;
  originY: number;
  originDate: string;
  startMin: number;
  durationMin: number;
  dx: number;
  dy: number;
  moved: boolean;
  date: string;
  minutes: number;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(hour: number): string {
  if (hour === 0) return "";
  return new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" });
}

function timeRange(event: CalendarEvent): string {
  if (!event.startTime) return "";
  return event.endTime ? `${shortTime(event.startTime)} – ${shortTime(event.endTime)}` : shortTime(event.startTime);
}

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const REPEAT_LABEL = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly" } as const;

function repeatLabel(event: CalendarEvent): string {
  const { freq, until } = parseRecurrence(event.recurrence);
  if (freq === "NONE") return event.recurringEventId ? "Repeats" : "";
  return until ? `${REPEAT_LABEL[freq]} until ${dayLabel(until)}` : REPEAT_LABEL[freq];
}

/** Date, location, repeat and description, skipping whichever the event leaves empty. */
function EventDetail({ event }: { event: CalendarEvent }) {
  const date =
    event.endDate && event.endDate !== event.startDate
      ? `${dayLabel(event.startDate)} – ${dayLabel(event.endDate)}`
      : dayLabel(event.startDate);
  const rows = [date, event.location, repeatLabel(event)].filter(Boolean);
  return (
    <>
      {rows.map((row) => (
        <span key={row}>{row}</span>
      ))}
      {event.description && (
        <span className="max-w-64 line-clamp-4 whitespace-pre-line break-words">{event.description}</span>
      )}
    </>
  );
}

function shortTime(time: string): string {
  return new Date(`2000-01-01T${time}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Minutes since local midnight, ticking once a minute, for the "now" line. */
function useNowMinutes(): number {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(read()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * Hour-by-hour columns for the Horizon's week (seven dates) and day (one)
 * views. All-day events sit in a strip above the grid. Clicking an empty slot
 * creates an event at that half hour; clicking an event edits it.
 */
export default function TimeGrid({
  dates,
  events,
  tasks = [],
  color,
  tipColors,
  onCreateAt,
  onEdit,
  onSelectDate,
  onMoveEvent,
  header,
}: {
  /** Title and paging controls, drawn at the top of the card. */
  header?: ReactNode;
  dates: string[];
  events: CalendarEvent[];
  tasks?: Task[];
  color: string;
  /** Gradient stops for the hover card; defaults to the event colour. */
  tipColors?: [string, string];
  onCreateAt: (date: string, time: string) => void;
  onEdit: (event: CalendarEvent) => void;
  /** Clicking a day's heading, e.g. to open it in the day view. */
  onSelectDate?: (date: string) => void;
  /** Dragging a single-day timed event to another time or day. */
  onMoveEvent?: (event: CalendarEvent, date: string, startTime: string, endTime: string) => void;
}) {
  const today = toLocalDateStr();
  const now = useNowMinutes();
  const scrollRef = useRef<HTMLDivElement>(null);
  const tip = tipColors ?? [color, color];
  const { reduceTransitions } = usePerfSettings();
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  const firstDate = dates[0];
  const prevFirst = useRef(firstDate);
  const slide = useRef(0);
  if (prevFirst.current !== firstDate) {
    slide.current = firstDate > prevFirst.current ? 1 : -1;
    prevFirst.current = firstDate;
  }
  const slideFrom = reduceTransitions ? 0 : slide.current * SLIDE_PX;

  const updateDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const columnAt = (clientX: number, fallback: string): string => {
    const cols = Array.from(gridRef.current?.querySelectorAll<HTMLElement>("[data-date]") ?? []);
    for (const col of cols) {
      const r = col.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return col.dataset.date ?? fallback;
    }
    return fallback;
  };

  const startDrag = (
    e: ReactPointerEvent<HTMLElement>,
    event: CalendarEvent,
    date: string,
    startMin: number,
    endMin: number,
  ) => {
    if (!onMoveEvent || e.button !== 0 || e.pointerType === "touch") return;
    if (event.allDay || event.startDate !== event.endDate || event.startDate !== date) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateDrag({
      id: event.id,
      originX: e.clientX,
      originY: e.clientY,
      originDate: date,
      startMin,
      durationMin: Math.max(endMin - startMin, 0),
      dx: 0,
      dy: 0,
      moved: false,
      date,
      minutes: startMin,
    });
  };

  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.originX;
    const dy = e.clientY - d.originY;
    const moved = d.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
    if (!moved) return;
    updateDrag({
      ...d,
      dx,
      dy,
      moved,
      date: columnAt(e.clientX, d.originDate),
      minutes: draggedStart(d.startMin, d.durationMin, dy / PX_PER_MIN),
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLElement>, event: CalendarEvent, commit: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    updateDrag(null);
    if (!d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (!commit) return;
    if (d.date === d.originDate && d.minutes === d.startMin) return;
    onMoveEvent?.(event, d.date, fromMinutes(d.minutes), fromMinutes(d.minutes + d.durationMin));
  };

  const days = useMemo(
    () =>
      dates.map((date) => {
        const dayTasks = tasksForDate(tasks, date);
        const untimed = (t: Task) => t.startDate < date || !t.startTime;
        return {
          date,
          ...layoutDay(events, date),
          allDayTasks: dayTasks.filter(untimed),
          timedTasks: dayTasks.filter((t) => !untimed(t)),
        };
      }),
    [dates, events, tasks],
  );
  const hasAllDay = days.some((d) => d.allDay.length > 0 || d.allDayTasks.length > 0);
  const showsToday = dates.includes(today);

  // Open on the working day, or an hour before now when today is in view.
  // Keyed on the first date so paging re-runs it but new events don't.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour = showsToday ? Math.max(0, Math.floor(now / 60) - 1) : DEFAULT_SCROLL_HOUR;
    el.scrollTop = hour * HOUR_PX;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates[0], showsToday]);

  const columns = `3.5rem repeat(${dates.length}, minmax(0, 1fr))`;

  return (
    <div className="glass-card p-4 flex flex-col">
      {header}
      <m.div
        key={firstDate}
        initial={slideFrom ? { opacity: 0, x: slideFrom } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
      {/* Day headings */}
      <div className="grid" style={{ gridTemplateColumns: columns }}>
        <div />
        {dates.map((date) => {
          const d = new Date(`${date}T12:00:00`);
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate?.(date)}
              disabled={!onSelectDate}
              className="flex flex-col items-center py-1.5 rounded-lg enabled:hover:bg-secondary/50 transition-colors"
            >
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span
                className={`text-sm w-7 h-7 flex items-center justify-center rounded-full ${
                  isToday ? "bg-primary text-primary-foreground font-semibold" : ""
                }`}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* All-day strip */}
      {hasAllDay && (
        <div className="grid border-b border-white/5 pb-1 mb-1" style={{ gridTemplateColumns: columns }}>
          <span className="text-[10px] text-muted-foreground self-center pr-2 text-right">all day</span>
          {days.map(({ date, allDay, allDayTasks }) => (
            <div key={date} className="space-y-0.5 px-0.5 min-w-0">
              {allDay.map((event) => (
                <GlassTip key={event.id} label={event.summary} hint="All day" detail={<EventDetail event={event} />} colors={tip}>
                  <button
                    type="button"
                    onClick={() => onEdit(event)}
                    className="w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate"
                    style={{ background: `color-mix(in srgb, ${color} 30%, transparent)` }}
                  >
                    {event.summary}
                  </button>
                </GlassTip>
              ))}
              {allDayTasks.map((task) => (
                <div
                  key={`t-${task.id}`}
                  title={`Task: ${task.name}`}
                  className="w-full text-[11px] px-1.5 py-0.5 rounded truncate border-l-2"
                  style={{
                    borderColor: taskColor(task),
                    background: `color-mix(in srgb, ${taskColor(task)} 18%, transparent)`,
                  }}
                >
                  {task.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hour grid */}
      <div ref={scrollRef} className="overflow-y-auto scrollbar-thin h-[60vh] lg:h-[calc(100vh-12.5rem)] min-h-[320px]">
        <div ref={gridRef} className="grid relative" style={{ gridTemplateColumns: columns, height: 24 * HOUR_PX }}>
          {/* Hour labels */}
          <div className="relative">
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: h * HOUR_PX }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>

          {days.map(({ date, timed, timedTasks }) => (
            <div
              key={date}
              data-date={date}
              role="presentation"
              className="relative border-l border-white/5 cursor-pointer"
              onClick={(e) => {
                // Only empty space creates; event blocks stop the click.
                const rect = e.currentTarget.getBoundingClientRect();
                const minutes = snapMinutes((e.clientY - rect.top) / PX_PER_MIN);
                onCreateAt(date, fromMinutes(minutes));
              }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-white/5"
                  style={{ top: h * HOUR_PX }}
                />
              ))}

              {date === today && (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 z-10 pointer-events-none"
                  style={{ top: Math.min(now, MINUTES_PER_DAY) * PX_PER_MIN }}
                >
                  <div className="h-px bg-rose-400" />
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-rose-400" />
                </div>
              )}

              {timedTasks.map((task) => {
                const [h, m] = task.startTime.split(":").map(Number);
                return (
                  <div
                    key={`t-${task.id}`}
                    title={`Task: ${task.name} · ${shortTime(task.startTime)}`}
                    className="absolute right-0.5 z-[5] w-[45%] h-5 px-1.5 rounded text-[11px] leading-5 truncate border-l-2 pointer-events-none"
                    style={{
                      top: (h * 60 + m) * PX_PER_MIN,
                      borderColor: taskColor(task),
                      background: `color-mix(in srgb, ${taskColor(task)} 30%, hsl(var(--background)))`,
                    }}
                  >
                    {task.name}
                  </div>
                );
              })}

              {timed.map(({ event, startMin, endMin, column, columns: lanes }) => {
                const height = (endMin - startMin) * PX_PER_MIN;
                const dragging = drag?.id === event.id && drag.moved;
                const label = dragging
                  ? `${shortTime(fromMinutes(drag.minutes))}${drag.date === date ? "" : ` · ${dayLabel(drag.date)}`}`
                  : timeRange(event);
                return (
                  <GlassTip
                    key={event.id}
                    label={event.summary}
                    hint={timeRange(event)}
                    detail={<EventDetail event={event} />}
                    colors={tip}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (suppressClick.current) return;
                        onEdit(event);
                      }}
                      onPointerDown={(e) => startDrag(e, event, date, startMin, endMin)}
                      onPointerMove={moveDrag}
                      onPointerUp={(e) => endDrag(e, event, true)}
                      onPointerCancel={(e) => endDrag(e, event, false)}
                      className={`absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden text-[11px] leading-tight border hover:brightness-125 transition-[filter] ${
                        dragging ? "z-30 cursor-grabbing shadow-lg brightness-125 select-none" : ""
                      }`}
                      style={{
                        transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                        top: startMin * PX_PER_MIN,
                        height: Math.max(height - 1, 14),
                        left: `calc(${(column / lanes) * 100}% + 1px)`,
                        width: `calc(${100 / lanes}% - 2px)`,
                        background: `color-mix(in srgb, ${color} 28%, transparent)`,
                        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
                      }}
                    >
                      <span className="font-medium block truncate">{event.summary}</span>
                      {(dragging || (height >= 30 && event.startTime)) && (
                        <span className="text-muted-foreground block truncate">{label}</span>
                      )}
                    </button>
                  </GlassTip>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      </m.div>
    </div>
  );
}
