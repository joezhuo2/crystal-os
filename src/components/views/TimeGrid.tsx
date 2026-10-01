import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { toLocalDateStr } from "@/lib/utils";
import { MINUTES_PER_DAY, fromMinutes, layoutDay, snapMinutes } from "@/lib/timeGrid";

/** Height of one hour, in px. */
const HOUR_PX = 48;
const PX_PER_MIN = HOUR_PX / 60;
/** Where the grid opens scrolled to when today isn't on screen. */
const DEFAULT_SCROLL_HOUR = 7;

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(hour: number): string {
  if (hour === 0) return "";
  return new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" });
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
  color,
  onCreateAt,
  onEdit,
  onSelectDate,
  header,
}: {
  /** Title and paging controls, drawn at the top of the card. */
  header?: ReactNode;
  dates: string[];
  events: CalendarEvent[];
  color: string;
  onCreateAt: (date: string, time: string) => void;
  onEdit: (event: CalendarEvent) => void;
  /** Clicking a day's heading, e.g. to open it in the day view. */
  onSelectDate?: (date: string) => void;
}) {
  const today = toLocalDateStr();
  const now = useNowMinutes();
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () => dates.map((date) => ({ date, ...layoutDay(events, date) })),
    [dates, events],
  );
  const hasAllDay = days.some((d) => d.allDay.length > 0);
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
          {days.map(({ date, allDay }) => (
            <div key={date} className="space-y-0.5 px-0.5 min-w-0">
              {allDay.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onEdit(event)}
                  title={event.summary}
                  className="w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate"
                  style={{ background: `color-mix(in srgb, ${color} 30%, transparent)` }}
                >
                  {event.summary}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hour grid */}
      <div ref={scrollRef} className="overflow-y-auto scrollbar-thin h-[60vh] lg:h-[calc(100vh-17rem)] min-h-[320px]">
        <div className="grid relative" style={{ gridTemplateColumns: columns, height: 24 * HOUR_PX }}>
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

          {days.map(({ date, timed }) => (
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

              {timed.map(({ event, startMin, endMin, column, columns: lanes }) => {
                const height = (endMin - startMin) * PX_PER_MIN;
                return (
                  <button
                    key={event.id}
                    type="button"
                    title={event.summary}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(event);
                    }}
                    className="absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden text-[11px] leading-tight border hover:brightness-125 transition-[filter]"
                    style={{
                      top: startMin * PX_PER_MIN,
                      height: Math.max(height - 1, 14),
                      left: `calc(${(column / lanes) * 100}% + 1px)`,
                      width: `calc(${100 / lanes}% - 2px)`,
                      background: `color-mix(in srgb, ${color} 28%, transparent)`,
                      borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
                    }}
                  >
                    <span className="font-medium block truncate">{event.summary}</span>
                    {height >= 30 && event.startTime && (
                      <span className="text-muted-foreground block truncate">
                        {shortTime(event.startTime)}
                        {event.endTime && ` – ${shortTime(event.endTime)}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
