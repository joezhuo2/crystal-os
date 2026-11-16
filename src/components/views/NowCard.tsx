import { useEffect, useMemo, useState } from "react";
import { AlarmClock, CalendarClock, ChevronRight, ListTodo, Navigation, Repeat, Telescope } from "lucide-react";
import { useTasks } from "@/contexts/AppContext";
import { calendarWasConnected, useCalendarEvents, useCalendarStatus } from "@/hooks/useGoogleCalendar";
import { useHabitsData } from "@/hooks/useHabits";
import { pickedCalendarId } from "@/hooks/useTodayCapacity";
import { isActiveOn } from "@/lib/habits";
import { pickNow, type NowPick } from "@/lib/nowCard";
import { usesSidecar } from "@/lib/platform";
import { awakeTasks } from "@/lib/snooze";
import { toLocalDateStr } from "@/lib/utils";
import { useStudySummary } from "@/modules/observatory/useStudySummary";

const ICONS: Record<NowPick["kind"], typeof AlarmClock> = {
  leave: Navigation,
  event: CalendarClock,
  overdue: AlarmClock,
  review: Telescope,
  habits: Repeat,
  today: ListTodo,
};

export default function NowCard({ installed, onNavigate }: { installed: (tab: string) => boolean; onNavigate?: (tab: string) => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = toLocalDateStr(now);

  const allTasks = useTasks();
  const tasks = useMemo(() => (installed("tasks") ? awakeTasks(allTasks, today) : []), [allTasks, today, installed]);

  const calendarOn = installed("calendar") && (!usesSidecar() || calendarWasConnected());
  const connected = useCalendarStatus(calendarOn).data?.connected === true;
  const range = useMemo(() => {
    const start = new Date(`${today}T00:00:00`);
    return { calendarId: pickedCalendarId(), timeMin: start.toISOString(), timeMax: new Date(start.getTime() + 86_400_000).toISOString() };
  }, [today]);
  const events = useCalendarEvents(range, calendarOn && connected).data?.events;

  const habits = useHabitsData().data;
  const habitsLeft = installed("orbit")
    ? (habits?.habits ?? []).filter((h) => isActiveOn(h, today) && !habits?.checks.some((c) => c.habitId === h.id && c.day === today)).length
    : 0;

  const study = useStudySummary();
  const reviewDue = installed("observatory") && !study.loading ? study.due : 0;

  const pick = pickNow({ now, today, events: events ?? [], tasks, reviewDue, habitsLeft });
  if (!pick) return null;
  const Icon = ICONS[pick.kind];

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(pick.tab)}
      className="glass-card-hover group mb-4 flex w-full items-center gap-3 px-4 py-3 text-left"
      aria-label={`Now: ${pick.text}`}
    >
      <span className="text-[10px] uppercase tracking-widest text-primary shrink-0">Now</span>
      <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden />
      <span data-private className="flex-1 min-w-0 truncate text-sm font-medium">{pick.text}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" aria-hidden />
    </button>
  );
}
