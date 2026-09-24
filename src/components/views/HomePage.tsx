import { useState, useEffect, useMemo } from "react";
import { Cloud, Sun, Moon, CloudRain, CloudSun, CloudSnow, CloudLightning, CloudDrizzle, MoonStar } from "lucide-react";
import { useApp, type Priority, type Task } from "@/contexts/AppContext";
import { motion } from "framer-motion";
import { normalizeRepeatDays, taskFallsOnDate, toLocalDateStr } from "@/lib/utils";
import { AVAILABLE_CITIES } from "@/hooks/useWeather";
import { useSkyScene } from "@/hooks/useSkyScene";
import { useAtmosphere } from "@/lib/atmosphereStore";
import { auroraStrength, pineRidge } from "@/lib/atmosphereScene";
import { useVaultNotes } from "@/hooks/useVault";
import {
  useCalendarEvents,
  useCalendarStatus,
  type CalendarEvent,
} from "@/hooks/useGoogleCalendar";
import { BookOpen, NotebookPen, CalendarClock, ChevronRight, Gem, Plus, Check, Wallet } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  TodayHorizonContentSkeleton,
  VaultContentSkeleton,
  VaultStickerSkeleton,
  WeatherWidgetSkeleton,
} from "@/components/ui/dashboard-skeletons";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { PRIORITY_RANK, upcomingTasks } from "@/lib/homeTasks";
import { NebulaSpace, PortalSpace, TerminalSpace } from "./HomeSpaces";

function Clock() {
  const [time, setTime] = useState(new Date());
  // The clock shows minutes, so wake once at the start of each minute.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      setTime(now);
      timeout = setTimeout(schedule, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  const hours = time.getHours();
  const greeting = hours < 12 ? "Good Morning" : hours < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="glass-card-hover p-6">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">{greeting}</p>
      <div className="text-4xl font-bold tracking-tight tabular-nums">
        {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {time.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      </p>
    </div>
  );
}

function HomeWeatherIcon({ code, className = "w-6 h-6" }: { code: number; className?: string }) {
  const props = { className };
  if (code === 0 || code === 1) return <Sun {...props} />;
  if (code === 2) return <CloudSun {...props} />;
  if (code >= 3 && code <= 4) return <Cloud {...props} />;
  if (code === 5 || code === 27) return <CloudDrizzle {...props} />;
  if (code === 6 || code === 11 || code === 12 || code === 36) return <CloudRain {...props} />;
  if (code === 7 || code === 8 || code === 28 || code === 37) return <CloudSnow {...props} />;
  if (code === 9 || code === 18 || code === 19 || code === 39) return <CloudLightning {...props} />;
  if (code === 10 || code === 33 || code === 34) return <Cloud {...props} />;
  if (code >= 13 && code <= 17) return <CloudSnow {...props} />;
  if (code === 30 || code === 31) return <MoonStar {...props} />;
  if (code === 32) return <Moon {...props} />;
  if (code === 38) return <CloudSnow {...props} />;
  return <Cloud {...props} />;
}

const HOME_RIDGE = pineRidge(5, 1000, 36);

/**
 * Current weather, wearing a small Living Sky like The Atmosphere page: the
 * sky for the time of day (or the custom background, blurred and tinted),
 * plus the aurora and weather effects when they are on in Settings. The
 * layers are CSS only (index.css, "Home spaces"), so Home stays light.
 */
function WeatherWidget({ onClick }: { onClick?: () => void }) {
  const { cityId, weatherEffects, aurora, backdropUrl } = useAtmosphere();
  const { data, phase, weather } = useSkyScene();
  const cityName = AVAILABLE_CITIES.find((c) => c.id === cityId)?.name ?? "Markham";

  // Find today's high/low from daily forecasts
  const todayHigh = data?.dailyForecasts?.[0]?.high ?? data?.dailyForecasts?.[1]?.high ?? null;
  const todayLow = data?.dailyForecasts?.[0]?.low ?? data?.dailyForecasts?.[1]?.low ?? null;

  if (!data) {
    return <WeatherWidgetSkeleton />;
  }

  const effects = weatherEffects;
  const rain = effects && (weather.precip === "rain" || weather.precip === "sleet");
  const snow = effects && (weather.precip === "snow" || weather.precip === "sleet");

  return (
    <div
      className="home-space home-space-atmosphere"
      data-phase={phase}
      style={{ "--aurora": auroraStrength(phase), "--cloud": effects ? weather.cloud : 0 } as React.CSSProperties}
    >
      <span aria-hidden="true" className="home-atmo-scene">
        {backdropUrl && (
          <>
            <span className="home-atmo-image" style={{ backgroundImage: `url("${backdropUrl}")` }} />
            <span className="home-atmo-tint" />
          </>
        )}
        {aurora && <span className="home-atmo-aurora" />}
        {effects && weather.cloud > 0 && <span className="home-atmo-clouds" />}
        {aurora && (
          <svg className="home-atmo-pines" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path d={HOME_RIDGE} />
          </svg>
        )}
        {effects && weather.fog && <span className="home-atmo-fog" />}
        {rain && <span className="home-atmo-precip" data-kind="rain" />}
        {snow && <span className="home-atmo-precip" data-kind="snow" />}
        {effects && weather.lightning && <span className="home-atmo-flash" />}
      </span>
      <div className="home-card-atmosphere h-full p-6 flex items-center gap-4 cursor-pointer" onClick={onClick}>
        <div className="p-3 rounded-xl bg-white/[0.08]">
          <HomeWeatherIcon code={data.current.iconCode} className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold">{Math.round(data.current.temperature)}°C</p>
            {todayHigh !== null && todayLow !== null && (
              <p className="text-xs text-muted-foreground">
                H:{todayHigh}° L:{todayLow}°
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{data.current.condition} · {cityName}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Notes from the Obsidian vault. The whole card opens The Archive, and wears
 * its amethyst cave look (index.css, "Home spaces").
 */
function ArchiveWidget({ onClick }: { onClick?: () => void }) {
  const { setSelectedNotePath, setShowQuickAdd, setQuickAddDraft } = useApp();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const { data, isLoading, error } = useVaultNotes({
    tag: activeTag ?? undefined,
    limit: 4,
  });

  const openQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickAddDraft("");
    setShowQuickAdd(true);
  };

  return (
    <div className="home-space home-space-archive">
      <div onClick={onClick} className="home-card-archive h-full p-6 cursor-pointer group">
        <div className="flex items-center justify-between mb-3">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest font-semibold">
            <Gem className="w-3.5 h-3.5 home-archive-gem" />
            <span className="obsidian-title">The Archive</span>
          </p>
          <GlassTip label="Quick add to vault" hint="Capture a note without leaving home" tone="amethyst">
            <button
              onClick={openQuickAdd}
              aria-label="Quick add to vault"
              className="p-1.5 rounded-lg text-purple-300 hover:bg-purple-500/15 transition-colors"
            >
              <NotebookPen className="w-4 h-4" />
            </button>
          </GlassTip>
        </div>

        {error && <p className="text-xs text-muted-foreground">Vault unavailable.</p>}

        {isLoading && <VaultContentSkeleton />}

        {!isLoading && !error && data && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {data.allTags.slice(0, 5).map((tag) => {
                const active = activeTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTag(active ? null : tag);
                    }}
                    data-active={active || undefined}
                    className="obsidian-chip px-2 py-0.5 rounded-full text-[10px] transition-colors border"
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              {data.notes.length === 0 && (
                <p className="text-xs text-muted-foreground">No notes for this tag.</p>
              )}
              {data.notes.map((note, i) => (
                <motion.button
                  key={note.path}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNotePath(note.path);
                    onClick?.();
                  }}
                  className="w-full flex items-center gap-2 text-left group/note"
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-300/60 shrink-0" />
                  <span className="text-sm truncate group-hover/note:text-primary transition-colors">
                    {note.title}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground/50 shrink-0">
                    {formatDistanceToNow(new Date(note.date ? Date.parse(note.date) : note.mtime), {
                      addSuffix: true,
                    })}
                  </span>
                </motion.button>
              ))}
            </div>

            <p className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors mt-3">
              Browse all {data.total} notes <ChevronRight className="w-3.5 h-3.5" />
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Format a "HH:MM" value as a friendly 12-hour time. */
function formatEventTime(time: string): string {
  if (!time) return "";
  return new Date(`2000-01-01T${time}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Matches CalendarPage's key so the widget follows the calendar you picked there. */
const CALENDAR_STORAGE_KEY = "crystal-os-google-calendar";

function TodayHorizon({ onClick }: { onClick?: () => void }) {
  const today = toLocalDateStr();

  const calendarId = (() => {
    try {
      return localStorage.getItem(CALENDAR_STORAGE_KEY) ?? "primary";
    } catch {
      return "primary";
    }
  })();

  const status = useCalendarStatus();
  const connected = status.data?.connected === true;

  // Local midnight today through local midnight tomorrow.
  const range = useMemo(() => {
    const startOfDay = new Date(`${today}T00:00:00`);
    return {
      timeMin: startOfDay.toISOString(),
      timeMax: new Date(startOfDay.getTime() + 86400000).toISOString(),
    };
  }, [today]);

  const eventsQuery = useCalendarEvents({ calendarId, ...range }, connected);

  // The query window can still return multi-day events that merely overlap today.
  const todayEvents = (eventsQuery.data?.events ?? [])
    .filter((e) => e.startDate <= today && e.endDate >= today)
    .slice()
    .sort((a, b) => {
      // All-day events float to the top, then earliest start, then earliest end.
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.endTime.localeCompare(b.endTime);
    });

  const loading = status.isLoading || (connected && eventsQuery.isLoading);

  const timeLabel = (e: CalendarEvent) => {
    if (e.allDay) return e.startDate === e.endDate ? "All day" : `All day · thru ${e.endDate}`;
    const span = `${formatEventTime(e.startTime)} – ${formatEventTime(e.endTime)}`;
    return e.startDate === e.endDate ? span : `${span} (${e.endDate})`;
  };

  return (
    <div
      onClick={onClick}
      className="glass-card-hover p-6 cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Today on the Horizon</p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">
          Open <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>

      {loading ? (
        <TodayHorizonContentSkeleton />
      ) : !connected ? (
        <p className="text-sm text-muted-foreground">
          Google Calendar is not connected. Open the Horizon to connect it.
        </p>
      ) : eventsQuery.error ? (
        <p className="text-sm text-muted-foreground">Could not load today's events.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold tabular-nums">{todayEvents.length}</span>
            <span className="text-sm text-muted-foreground">
              event{todayEvents.length !== 1 ? "s" : ""} today
            </span>
          </div>

          {todayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled. The horizon is clear.</p>
          ) : (
            <div className="space-y-1.5">
              {todayEvents.map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3"
                >
                  <CalendarClock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                  <span className="text-sm truncate">{event.summary || "(no title)"}</span>
                  {event.location && (
                    <span className="text-[10px] text-muted-foreground/60 truncate hidden sm:inline">
                      {event.location}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
                    {timeLabel(event)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const PRIORITY_CLASS: Record<Priority, string> = {
  low: "priority-low",
  medium: "priority-medium",
  high: "priority-high",
  urgent: "priority-urgent",
};

/** "Tomorrow", a weekday within the week, then a short date. */
function formatUpcomingDay(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86400000);
  const d = new Date(`${date}T12:00:00`);
  if (days === 1) return "Tomorrow";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type TaskRow = { task: Task; label: string };

function EngineWidget({ onClick }: { onClick?: () => void }) {
  const { tasks, updateTask, setEditingTask, setShowTaskForm, loading } = useApp();
  const today = toLocalDateStr();

  // Repeating tasks recur rather than lapse, so only one-off tasks count as overdue.
  const isOverdue = (t: Task) => !normalizeRepeatDays(t.repeatDays) && t.endDate < today;

  // Open work for today plus anything overdue, most pressing first.
  const openTasks = tasks
    .filter((t) => !t.completed && (taskFallsOnDate(t, today) || isOverdue(t)))
    .sort((a, b) => {
      if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      return a.startTime.localeCompare(b.startTime);
    });

  // Once today is clear, show what comes next: each open task's next date
  // within UPCOMING_DAYS, highest priority first, then soonest.
  const upcoming = useMemo(
    () => (openTasks.length > 0 ? [] : upcomingTasks(tasks, today)),
    [tasks, today, openTasks.length],
  );

  const showingUpcoming = openTasks.length === 0 && upcoming.length > 0;
  const rows: TaskRow[] = showingUpcoming
    ? upcoming.map(({ task, date }) => ({
        task,
        label: [formatUpcomingDay(date, today), task.startTime && formatEventTime(task.startTime)].filter(Boolean).join(" · "),
      }))
    : openTasks.map((task) => ({
        task,
        label: isOverdue(task) ? "Overdue" : task.startTime ? formatEventTime(task.startTime) : "",
      }));
  const topRows = rows.slice(0, 3);
  const remaining = rows.length - topRows.length;

  const openNewTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTask(null);
    setShowTaskForm(true);
  };

  return (
    <div onClick={onClick} className="glass-card-hover p-6 cursor-pointer group">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">The Engine</p>
        <GlassTip label="Add task" hint="New task in The Engine">
          <button
            onClick={openNewTask}
            aria-label="Add task"
            className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </GlassTip>
      </div>

      {loading ? (
        <TodayHorizonContentSkeleton />
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold tabular-nums">{showingUpcoming ? upcoming.length : openTasks.length}</span>
            <span className="text-sm text-muted-foreground">
              {showingUpcoming
                ? `upcoming task${upcoming.length !== 1 ? "s" : ""} · today is clear`
                : `open task${openTasks.length !== 1 ? "s" : ""} today`}
            </span>
          </div>

          {topRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">All clear. Nothing left to run.</p>
          ) : (
            <div className="space-y-1.5">
              {topRows.map(({ task, label }, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3"
                >
                  <GlassTip label="Complete task" tone="emerald" side="left">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTask(task.id, { completed: true });
                      }}
                      aria-label="Complete task"
                      className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 hover:border-accent hover:bg-accent/20 flex items-center justify-center shrink-0 transition-colors group/check"
                    >
                      <Check className="w-2.5 h-2.5 text-accent opacity-0 group-hover/check:opacity-100" />
                    </button>
                  </GlassTip>
                  <span className="text-sm truncate">{task.name}</span>
                  <span className={`ml-auto text-[10px] font-semibold shrink-0 ${PRIORITY_CLASS[task.priority]}`}>
                    {label}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {remaining > 0 && (
            <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors mt-3">
              +{remaining} more {showingUpcoming ? "upcoming " : ""}task{remaining !== 1 ? "s" : ""} →
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** This month at a glance from The Vault (financials). The whole card opens it. */
function VaultSticker({ onClick }: { onClick?: () => void }) {
  const { transactions, financialCategories, loading } = useApp();
  const month = toLocalDateStr().slice(0, 7);

  const summary = useMemo(() => {
    const monthTx = transactions.filter((t) => t.date.startsWith(month));
    const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const spent = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const byCategory = new Map<string, number>();
    for (const t of monthTx) {
      if (t.type === "expense") byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amount);
    }
    const [topId, topAmount] = [...byCategory].sort((a, b) => b[1] - a[1])[0] ?? [];
    const top = topId ? { name: financialCategories.find((c) => c.id === topId)?.name ?? "Other", amount: topAmount } : null;
    return { count: monthTx.length, income, spent, net: income - spent, top };
  }, [transactions, financialCategories, month]);

  if (loading) return <VaultStickerSkeleton />;

  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });
  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <div onClick={onClick} className="glass-card-hover glass-card-emerald p-6 cursor-pointer group">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-accent">The Vault</p>
        <span className="p-1.5 rounded-lg" style={{ background: "hsl(160 84% 39% / 0.12)" }}>
          <Wallet className="w-4 h-4 text-accent" />
        </span>
      </div>

      {summary.count === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions in {monthName} yet.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-3xl font-bold tabular-nums ${summary.net >= 0 ? "text-accent" : "text-red-400"}`}>
              {summary.net >= 0 ? "+" : "−"}
              {money(summary.net)}
            </span>
            <span className="text-sm text-muted-foreground">net in {monthName}</span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {money(summary.income)} in · {money(summary.spent)} out
          </p>
          {summary.top && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              Top spend: <span className="text-foreground/80">{summary.top.name}</span> {money(summary.top.amount)}
            </p>
          )}
        </>
      )}

      <p className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-accent transition-colors mt-3">
        Open the Vault <ChevronRight className="w-3.5 h-3.5" />
      </p>
    </div>
  );
}

export default function HomePage({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <Clock />
      <WeatherWidget onClick={() => onNavigate?.("weather")} />
      <VaultSticker onClick={() => onNavigate?.("financials")} />
      <EngineWidget onClick={() => onNavigate?.("tasks")} />
      <TodayHorizon onClick={() => onNavigate?.("calendar")} />
      <ArchiveWidget onClick={() => onNavigate?.("archive")} />
      <NebulaSpace onClick={() => onNavigate?.("nebula")} />
      <PortalSpace onClick={() => onNavigate?.("portal")} />
      <TerminalSpace onClick={() => onNavigate?.("terminal")} />
    </motion.div>
  );
}
