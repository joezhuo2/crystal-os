import { useState, useEffect } from "react";
import { Cloud, Sun, Moon, CloudRain } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { motion } from "framer-motion";
import { taskFallsOnDate, toLocalDateStr } from "@/lib/utils";

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

function WeatherWidget() {
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour > 20;
  const Icon = isNight ? Moon : Sun;
  return (
    <div className="glass-card-hover p-6 flex items-center gap-4">
      <div className="p-3 rounded-xl" style={{ background: "hsl(239 84% 67% / 0.12)" }}>
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-semibold">72°F</p>
        <p className="text-xs text-muted-foreground">{isNight ? "Clear Night" : "Partly Cloudy"} · San Francisco</p>
      </div>
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

export default function HomePage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <Clock />
      <WeatherWidget />
      <SmartSummary />
      <DailyFocus />
    </motion.div>
  );
}
