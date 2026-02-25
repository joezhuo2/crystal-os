import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

function HabitStreak() {
  const { tasks } = useApp();
  // Build a simple 7x7 grid of recent days
  const grid = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 48; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const count = tasks.filter((t) => t.date === dateStr && t.completed).length;
      days.push({ date: dateStr, count });
    }
    return days;
  }, [tasks]);

  const getOpacity = (count: number) => {
    if (count === 0) return 0.08;
    if (count === 1) return 0.3;
    if (count === 2) return 0.55;
    return 0.85;
  };

  return (
    <div className="glass-card p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Habit Streaks</p>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${day.count} completed`}
            className="w-full aspect-square rounded-sm"
            style={{ background: `hsl(160 84% 39% / ${getOpacity(day.count)})` }}
          />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">Last 7 weeks · Completed tasks per day</p>
    </div>
  );
}

function DayModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { tasks, taskCategories } = useApp();
  const dayTasks = tasks.filter((t) => t.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dateObj = new Date(date + "T12:00:00");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "hsl(222 47% 11% / 0.8)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className="glass-card p-6 w-full max-w-md max-h-[80vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-lg font-semibold">{dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
            <p className="text-xs text-muted-foreground">{dayTasks.length} tasks</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        {dayTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No tasks scheduled</p>
        ) : (
          <div className="space-y-2">
            {dayTasks.map((task) => {
              const cat = taskCategories.find((c) => c.id === task.categoryId);
              return (
                <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                  <div className="w-1 h-8 rounded-full" style={{ background: cat?.color || "hsl(239 84% 67%)" }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${task.completed ? "line-through opacity-50" : ""}`}>{task.name}</p>
                    <p className="text-[10px] text-muted-foreground">{task.startTime} – {task.endTime}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function CalendarPage() {
  const { tasks } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const days = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [firstDay, daysInMonth]);

  const getDateStr = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const getTaskCount = (day: number) => tasks.filter((t) => t.date === getDateStr(day)).length;

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">
            {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
          <div className="flex gap-1">
            <button onClick={prev} className="p-2 rounded-lg hover:bg-secondary transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={next} className="p-2 rounded-lg hover:bg-secondary transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <p key={d} className="text-[10px] text-muted-foreground text-center py-1">{d}</p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const dateStr = getDateStr(day);
            const count = getTaskCount(day);
            const isToday = dateStr === today;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(dateStr)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-all hover:bg-secondary/50 ${
                  isToday ? "ring-1 ring-primary bg-primary/10 font-semibold" : ""
                }`}
                style={count > 3 ? { boxShadow: `0 0 12px hsl(239 84% 67% / ${Math.min(count * 0.1, 0.5)})` } : undefined}
              >
                {day}
                {count > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from({ length: Math.min(count, 4) }).map((_, j) => (
                      <div key={j} className="w-1 h-1 rounded-full bg-primary" />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <HabitStreak />

      <AnimatePresence>
        {selectedDay && <DayModal date={selectedDay} onClose={() => setSelectedDay(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}
