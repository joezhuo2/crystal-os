import { useState, useMemo } from "react";
import { useApp, type Task, type Priority } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Check, Calendar, Columns } from "lucide-react";
import { taskFallsOnDate, toLocalDateStr } from "@/lib/utils";

const priorityColor: Record<Priority, string> = {
  low: "hsl(160 84% 39%)",
  medium: "hsl(45 93% 47%)",
  high: "hsl(25 95% 53%)",
  urgent: "hsl(0 72% 51%)",
};
const priorityRank: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

function HabitStreak() {
  const { tasks } = useApp();
  // Build a simple 7x7 grid of recent days
  const grid = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 48; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = toLocalDateStr(d);
      const count = tasks.filter((t) => taskFallsOnDate(t, dateStr) && t.completed).length;
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
  const dayTasks = tasks.filter((t) => taskFallsOnDate(t, date)).sort((a, b) => a.startTime.localeCompare(b.startTime));
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
                    <p className="text-[10px] text-muted-foreground">{task.startDate} {task.startTime} – {task.endDate === task.startDate ? "" : `${task.endDate} `}{task.endTime}</p>
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

/* ── Weekly Board with drag-and-drop ── */

function BoardTaskCard({ task, dateStr }: { task: Task; dateStr: string }) {
  const { taskCategories, updateTask } = useApp();
  const cat = taskCategories.find((c) => c.id === task.categoryId);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={(e: any) => {
        e.dataTransfer?.setData("application/task-id", task.id);
        e.dataTransfer?.setData("application/source-date", dateStr);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`glass-card-hover p-3 flex items-start gap-2 group cursor-grab active:cursor-grabbing ${
        task.completed ? "opacity-50" : ""
      }`}
    >
      <button
        onClick={() => updateTask(task.id, { completed: !task.completed })}
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
          task.completed ? "bg-accent border-accent" : "border-muted-foreground/40 hover:border-primary"
        }`}
      >
        {task.completed && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${task.completed ? "line-through" : ""}`}>
          {task.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground">{task.startTime}–{task.endTime}</span>
          <span
            className="text-[10px] font-semibold"
            style={{
              color: priorityColor[task.priority],
            }}
          >
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </span>
          {cat && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: `${cat.color}22`, color: cat.color }}
            >
              {cat.name}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function WeeklyBoard() {
  const { tasks, updateTask } = useApp();
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const weekDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return {
        dateStr: toLocalDateStr(d),
        dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: d.getDate(),
        monthName: d.toLocaleDateString("en-US", { month: "short" }),
        isToday: i === 0,
      };
    });
  }, []);

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const day of weekDays) {
      map[day.dateStr] = tasks
        .filter((t) => taskFallsOnDate(t, day.dateStr))
        .sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return a.startTime.localeCompare(b.startTime);
        });
    }
    return map;
  }, [tasks, weekDays]);

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  };

  const handleDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("application/task-id");
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Calculate the day offset and shift both start and end dates
    const oldStart = new Date(task.startDate + "T12:00:00");
    const newStart = new Date(targetDate + "T12:00:00");
    const diffMs = newStart.getTime() - oldStart.getTime();
    const diffDays = Math.round(diffMs / 86400000);

    if (diffDays === 0) {
      setDragOverDate(null);
      return;
    }

    const oldEnd = new Date(task.endDate + "T12:00:00");
    const newEnd = new Date(oldEnd.getTime() + diffDays * 86400000);

    updateTask(taskId, {
      startDate: toLocalDateStr(newStart),
      endDate: toLocalDateStr(newEnd),
    });

    setDragOverDate(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the column (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverDate(null);
  };

  return (
    <div className="glass-card p-5 col-span-full">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">
        Weekly Board
      </p>
      <div className="grid grid-cols-7 gap-2 min-h-[200px]">
        {weekDays.map((day) => {
          const dayTasks = tasksByDay[day.dateStr] || [];
          const isOver = dragOverDate === day.dateStr;

          return (
            <div
              key={day.dateStr}
              onDragOver={(e) => handleDragOver(e, day.dateStr)}
              onDrop={(e) => handleDrop(e, day.dateStr)}
              onDragLeave={handleDragLeave}
              className={`rounded-xl p-2 transition-all min-h-[180px] ${
                isOver
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : "bg-secondary/20"
              }`}
            >
              {/* Day header */}
              <div
                className={`text-center mb-2 pb-2 border-b border-border/30 ${
                  day.isToday ? "text-primary" : ""
                }`}
              >
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {day.dayName}
                </p>
                <p
                  className={`text-sm font-semibold ${
                    day.isToday
                      ? "bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center mx-auto"
                      : ""
                  }`}
                >
                  {day.dayNum}
                </p>
                <p className="text-[10px] text-muted-foreground">{day.monthName}</p>
              </div>

              {/* Tasks */}
              <div className="space-y-1.5">
                <AnimatePresence>
                  {dayTasks.map((task) => (
                    <BoardTaskCard
                      key={task.id}
                      task={task}
                      dateStr={day.dateStr}
                    />
                  ))}
                </AnimatePresence>
                {dayTasks.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/40 text-center py-6">
                    No tasks
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthlyCalendar() {
  const { tasks } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toLocalDateStr();

  const days = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [firstDay, daysInMonth]);

  const getDateStr = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const getTaskCount = (day: number) => { const d = getDateStr(day); return tasks.filter((t) => taskFallsOnDate(t, d)).length; };
  const getDayTasks = (day: number) => { const d = getDateStr(day); return tasks.filter((t) => taskFallsOnDate(t, d)); };
  const getHighestPriority = (dayTasks: typeof tasks): Priority | null => {
    if (dayTasks.length === 0) return null;
    return dayTasks.reduce<Priority>((best, t) => priorityRank[t.priority] > priorityRank[best] ? t.priority : best, dayTasks[0].priority);
  };

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
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
                  {count > 0 && (() => {
                    const dayTasks = getDayTasks(day);
                    const highest = getHighestPriority(dayTasks);
                    const dotColor = highest ? priorityColor[highest] : "hsl(239 84% 67%)";
                    return (
                      <div className="flex gap-1 mt-0.5">
                        {Array.from({ length: Math.min(count, 3) }).map((_, j) => {
                          const taskPrio = dayTasks[j]?.priority;
                          const c = taskPrio ? priorityColor[taskPrio] : dotColor;
                          return (
                            <div
                              key={j}
                              className="w-2 h-2 rounded-full"
                              style={{ background: c, boxShadow: `0 0 4px ${c}` }}
                            />
                          );
                        })}
                      </div>
                    );
                  })()}
                </button>
              );
            })}
          </div>
        </div>

        <HabitStreak />
      </div>

      <AnimatePresence>
        {selectedDay && <DayModal date={selectedDay} onClose={() => setSelectedDay(null)} />}
      </AnimatePresence>
    </>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<"calendar" | "board">("calendar");

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex glass-card p-0.5 rounded-lg">
          <button
            onClick={() => setView("calendar")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 inline mr-1" />Calendar
          </button>
          <button
            onClick={() => setView("board")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Columns className="w-3.5 h-3.5 inline mr-1" />Board
          </button>
        </div>
      </div>

      {view === "calendar" ? <MonthlyCalendar /> : <WeeklyBoard />}
    </motion.div>
  );
}
