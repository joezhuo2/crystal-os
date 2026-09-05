import { useState, useEffect } from "react";
import { Cloud, Sun, Moon, CloudRain, CloudSun, CloudSnow, CloudLightning, CloudDrizzle, MoonStar } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { motion } from "framer-motion";
import { taskFallsOnDate, toLocalDateStr } from "@/lib/utils";
import { useWeather, AVAILABLE_CITIES } from "@/hooks/useWeather";
import { useVaultNotes } from "@/hooks/useVault";
import { BookOpen, NotebookPen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
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

const CITY_STORAGE_KEY = "crystal-os-weather-city";

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

function WeatherWidget({ onClick }: { onClick?: () => void }) {
  const cityId = (() => {
    try { return localStorage.getItem(CITY_STORAGE_KEY) ?? "on-85"; } catch { return "on-85"; }
  })();
  const { data, isLoading } = useWeather(cityId);
  const cityName = AVAILABLE_CITIES.find((c) => c.id === cityId)?.name ?? "Markham";

  // Find today's high/low from daily forecasts
  const todayHigh = data?.dailyForecasts?.[0]?.high ?? data?.dailyForecasts?.[1]?.high ?? null;
  const todayLow = data?.dailyForecasts?.[0]?.low ?? data?.dailyForecasts?.[1]?.low ?? null;

  if (isLoading || !data) {
    return (
      <div className="glass-card-hover p-6 flex items-center gap-4 cursor-pointer" onClick={onClick}>
        <div className="p-3 rounded-xl animate-pulse" style={{ background: "hsl(239 84% 67% / 0.12)" }}>
          <Cloud className="w-6 h-6 text-primary/30" />
        </div>
        <div className="space-y-1.5">
          <div className="w-16 h-7 rounded bg-primary/10 animate-pulse" />
          <div className="w-32 h-3 rounded bg-primary/5 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card-hover p-6 flex items-center gap-4 cursor-pointer" onClick={onClick}>
      <div className="p-3 rounded-xl" style={{ background: "hsl(239 84% 67% / 0.12)" }}>
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
  );
}

function VaultWidget({ onClick }: { onClick?: () => void }) {
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
    <div className="glass-card-hover p-6 col-span-full lg:col-span-1">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">The Archive</p>
        <button
          onClick={openQuickAdd}
          title="Quick add to vault"
          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <NotebookPen className="w-4 h-4" />
        </button>
      </div>

      {error && <p className="text-xs text-muted-foreground">Vault unavailable.</p>}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-full h-4 rounded bg-primary/5 animate-pulse" />
          ))}
        </div>
      )}

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
                  className="px-2 py-0.5 rounded-full text-[10px] transition-colors border"
                  style={{
                    background: active ? "hsl(239 84% 67% / 0.18)" : "hsl(0 0% 100% / 0.04)",
                    borderColor: active ? "hsl(239 84% 67% / 0.4)" : "hsl(0 0% 100% / 0.08)",
                  }}
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
                onClick={() => {
                  setSelectedNotePath(note.path);
                  onClick?.();
                }}
                className="w-full flex items-center gap-2 text-left group"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-400/60 shrink-0" />
                <span className="text-sm truncate group-hover:text-primary transition-colors">
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

          <button
            onClick={onClick}
            className="text-xs text-muted-foreground hover:text-primary transition-colors mt-3"
          >
            Browse all {data.total} notes →
          </button>
        </>
      )}
    </div>
  );
}

function DailyFocus() {
  const { dailyFocus, setDailyFocus } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dailyFocus);

  const save = () => {
    setDailyFocus(value);
    setEditing(false);
  };

  return (
    <div className="glass-card-hover p-6 col-span-full lg:col-span-2">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Daily Focus</p>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-full bg-transparent text-xl font-semibold outline-none border-b border-primary/30 pb-1"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-xl font-semibold text-left w-full hover:text-primary transition-colors"
        >
          {dailyFocus || "Click to set your focus..."}
        </button>
      )}
      <p className="text-xs text-muted-foreground mt-2">Click to edit your primary objective</p>
    </div>
  );
}

function SmartSummary() {
  const { tasks, transactions } = useApp();
  const today = toLocalDateStr();
  const todayTasks = tasks.filter((t) => taskFallsOnDate(t, today));
  const dueTasks = todayTasks.filter((t) => !t.completed);
  const completedTasks = todayTasks.filter((t) => t.completed);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const coffeeSpend = transactions
    .filter((t) => t.categoryId === "coffee" && t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const insights: string[] = [
    `You have ${dueTasks.length} task${dueTasks.length !== 1 ? "s" : ""} due today.`,
    completedTasks.length > 0 ? `${completedTasks.length} already completed — nice work!` : "",
    totalExpenses > 0 ? `Total spending tracked: $${totalExpenses.toFixed(2)}.` : "",
    coffeeSpend > 5 ? `You've spent $${coffeeSpend.toFixed(2)} on coffee recently.` : "",
  ].filter(Boolean);

  return (
    <div className="glass-card-hover glass-card-emerald p-6">
      <p className="text-xs uppercase tracking-widest mb-3 text-accent">AI Smart Summary</p>
      <div className="space-y-2">
        {insights.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="text-sm text-foreground/80"
          >
            {line}
          </motion.p>
        ))}
      </div>
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
      <SmartSummary />
      <DailyFocus />
      <VaultWidget onClick={() => onNavigate?.("archive")} />
    </motion.div>
  );
}
