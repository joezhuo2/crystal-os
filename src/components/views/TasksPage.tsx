import { useState, useRef } from "react";
import { useApp, type Task, type Priority } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Trash2, LayoutList, Columns, X, Pencil, Repeat, AlertTriangle, CalendarClock } from "lucide-react";
import {
  cleanRepeat,
  describeRepeat,
  isTaskOverdue,
  ordinal,
  rescheduleToToday,
  toLocalDateStr,
  WEEKDAY_SHORT,
  type RepeatKind,
  type RepeatRule,
} from "@/lib/utils";
import { DateField, ThemedSelect, TimeField } from "@/components/ui/field-controls";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import PomodoroTimer from "./PomodoroTimer";
import { CategoryManagerButton } from "./CategoryManager";

const priorityLabel: Record<Priority, string> = { low: "Low", medium: "Med", high: "High", urgent: "Urgent" };
const priorityClass: Record<Priority, string> = { low: "priority-low", medium: "priority-medium", high: "priority-high", urgent: "priority-urgent" };

function TaskItem({ task, draggable, overdue }: { task: Task; draggable?: boolean; overdue?: boolean }) {
  const { updateTask, completeTask, deleteTask, taskCategories, setEditingTask, setShowTaskForm } = useApp();
  const cat = taskCategories.find((c) => c.id === task.categoryId);
  const repeatLabel = describeRepeat(task.repeat, task.startDate);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      draggable={draggable}
      onDragStart={(e: Event) => {
        (e as DragEvent).dataTransfer?.setData("text/plain", task.id);
      }}
      className={`glass-card-hover p-4 flex items-center gap-3 group ${task.completed ? "opacity-50" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <button
        onClick={() => (task.completed ? updateTask(task.id, { completed: false }) : completeTask(task))}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          task.completed ? "bg-accent border-accent" : "border-muted-foreground/40 hover:border-primary"
        }`}
      >
        {task.completed && <Check className="w-3 h-3 text-accent-foreground" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.completed ? "line-through" : ""}`}>{task.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">{task.startDate} {task.startTime} – {task.endDate === task.startDate ? "" : `${task.endDate} `}{task.endTime}</span>
          <span className={`text-[10px] font-semibold ${priorityClass[task.priority]}`}>{priorityLabel[task.priority]}</span>
          {repeatLabel && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title="Repeats">
              <Repeat className="w-2.5 h-2.5" />{repeatLabel}
            </span>
          )}
          {cat && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${cat.color}22`, color: cat.color }}>
              {cat.name}
            </span>
          )}
        </div>
      </div>
      {overdue && (
        <button
          onClick={() => updateTask(task.id, rescheduleToToday(task, toLocalDateStr()))}
          title="Reschedule to today"
          aria-label={`Reschedule ${task.name} to today`}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-amber-300 hover:bg-amber-400/10 transition-colors shrink-0"
        >
          <CalendarClock className="w-3.5 h-3.5" />
          Today
        </button>
      )}
      <button onClick={() => { setEditingTask(task); setShowTaskForm(true); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const { taskCategories, updateTask } = useApp();
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, catId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCat(catId);
  };

  const handleDrop = (e: React.DragEvent, targetCategoryId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      updateTask(taskId, { categoryId: targetCategoryId });
    }
    setDragOverCat(null);
  };

  const handleDragLeave = () => setDragOverCat(null);

  // Group by category + a "Done" column
  const categoryColumns = taskCategories.map((cat) => ({
    id: cat.id,
    label: cat.name,
    color: cat.color,
    tasks: tasks.filter((t) => t.categoryId === cat.id && !t.completed),
  }));
  const doneColumn = {
    id: "__done__",
    label: "Done",
    color: "hsl(160 84% 39%)",
    tasks: tasks.filter((t) => t.completed),
  };
  const allColumns = [...categoryColumns, doneColumn].filter((col) => col.tasks.length > 0);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${allColumns.length}, minmax(180px, 1fr))` }}>
      {allColumns.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => handleDragOver(e, col.id)}
          onDrop={(e) => handleDrop(e, col.id)}
          onDragLeave={handleDragLeave}
          className={`min-h-[200px] rounded-xl p-2 transition-colors ${
            dragOverCat === col.id ? "bg-primary/10 ring-1 ring-primary/30" : ""
          }`}
        >
          <div className="flex items-center gap-2 px-1 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
            <p className="text-xs text-muted-foreground uppercase tracking-widest">{col.label}</p>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">{col.tasks.length}</span>
          </div>
          <div className="space-y-2">
            <AnimatePresence>
              {col.tasks.map((task) => (
                <TaskItem key={task.id} task={task} draggable={col.id !== "__done__"} />
              ))}
            </AnimatePresence>
            {col.tasks.length === 0 && (
              <p className="text-xs text-muted-foreground/40 text-center py-6">Drop tasks here</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type RepeatChoice = "none" | RepeatKind;

const repeatOptions: { value: RepeatChoice; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "days", label: "Every N days" },
  { value: "weekly", label: "Weekly on…" },
  { value: "monthly", label: "Monthly" },
  { value: "after", label: "N days after done" },
];

const weekdayOf = (dateStr: string) => new Date(`${dateStr}T12:00:00`).getDay();

/** Repeat editor state. Every field is kept, so switching kinds doesn't lose what was typed. */
function initialRepeat(rule: RepeatRule | undefined, startDate: string) {
  return {
    kind: (rule?.kind ?? "none") as RepeatChoice,
    every: rule && "every" in rule ? rule.every : 1,
    weekdays: rule?.kind === "weekly" ? rule.weekdays : [weekdayOf(startDate)],
  };
}

function buildRepeat(r: ReturnType<typeof initialRepeat>): RepeatRule | undefined {
  switch (r.kind) {
    case "none":
      return undefined;
    case "days":
    case "after":
      return cleanRepeat({ kind: r.kind, every: r.every });
    case "weekly":
      return cleanRepeat({ kind: "weekly", weekdays: r.weekdays });
    case "monthly":
      return { kind: "monthly" };
  }
}

export function TaskForm({ onClose, editingTask }: { onClose: () => void; editingTask?: Task | null }) {
  const { addTask, updateTask, taskCategories } = useApp();
  const today = toLocalDateStr();
  const [repeat, setRepeat] = useState(() => initialRepeat(editingTask?.repeat, editingTask?.startDate || today));
  const [form, setForm] = useState({
    name: editingTask?.name || "",
    startDate: editingTask?.startDate || today,
    startTime: editingTask?.startTime || "09:00",
    endDate: editingTask?.endDate || today,
    endTime: editingTask?.endTime || "10:00",
    priority: (editingTask?.priority || "medium") as Priority,
    categoryId: editingTask?.categoryId || taskCategories[0]?.id || "",
  });

  const submit = () => {
    if (!form.name.trim()) return;
    const rule = buildRepeat(repeat);
    if (editingTask) {
      // Always send repeat, undefined included: updateTask clears the repeat for it.
      updateTask(editingTask.id, { ...form, repeat: rule, completed: editingTask.completed });
    } else {
      addTask({ ...form, completed: false, repeat: rule });
    }
    onClose();
  };
  useEscapeKey(onClose);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        className="glass-card p-6 space-y-4 w-full max-w-md relative z-10"
      >
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">{editingTask ? "Edit Task" : "New Task"}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <input
          autoFocus
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Task name..."
          className="w-full bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Start</label>
            <div className="flex gap-1">
              <DateField value={form.startDate} aria-label="Start date"
                onChange={(v) => setForm((f) => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate }))}
                className="flex-1" />
              <TimeField value={form.startTime} aria-label="Start time"
                onChange={(v) => setForm((f) => ({ ...f, startTime: v }))}
                className="flex-1 px-2" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">End</label>
            <div className="flex gap-1">
              <DateField value={form.endDate} aria-label="End date" min={form.startDate}
                onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
                className="flex-1" />
              <TimeField value={form.endTime} aria-label="End time"
                onChange={(v) => setForm((f) => ({ ...f, endTime: v }))}
                className="flex-1 px-2" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <ThemedSelect value={form.priority} aria-label="Priority"
            onChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "urgent", label: "Urgent" },
            ]}
            className="flex-1" />
          <ThemedSelect value={form.categoryId} aria-label="Category"
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            options={taskCategories.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
            className="flex-1" />
        </div>
        <div className="space-y-2">
          <ThemedSelect value={repeat.kind} aria-label="Repeat"
            onChange={(v) => setRepeat((r) => ({ ...r, kind: v as RepeatChoice }))}
            options={repeatOptions} />
          {(repeat.kind === "days" || repeat.kind === "after") && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">{repeat.kind === "days" ? "Every" : "Due"}</label>
              <input type="number" min={1} value={repeat.every} aria-label="Days"
                onChange={(e) => setRepeat((r) => ({ ...r, every: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-16 bg-secondary/50 rounded-lg px-2 py-1.5 text-sm outline-none" />
              <span className="text-xs text-muted-foreground">
                {`day${repeat.every === 1 ? "" : "s"}`}{repeat.kind === "after" && " after it's done"}
              </span>
            </div>
          )}
          {repeat.kind === "weekly" && (
            <div className="flex gap-1" role="group" aria-label="Weekdays">
              {WEEKDAY_SHORT.map((label, day) => {
                const on = repeat.weekdays.includes(day);
                return (
                  <button key={label} type="button" aria-pressed={on} aria-label={label}
                    onClick={() => setRepeat((r) => ({
                      ...r,
                      weekdays: on ? r.weekdays.filter((d) => d !== day) : [...r.weekdays, day].sort((a, b) => a - b),
                    }))}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                      on ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    {label.slice(0, 2)}
                  </button>
                );
              })}
            </div>
          )}
          {repeat.kind === "weekly" && repeat.weekdays.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Pick at least one day, or the task won't repeat.</p>
          )}
          {repeat.kind === "monthly" && (
            <p className="text-[11px] text-muted-foreground">
              On the {ordinal(Number(form.startDate.slice(8, 10)))} of each month
              {Number(form.startDate.slice(8, 10)) > 28 ? ", or the last day in shorter months" : ""}.
            </p>
          )}
          {repeat.kind === "after" && (
            <p className="text-[11px] text-muted-foreground">Completing it moves the task forward instead of closing it.</p>
          )}
        </div>
        <button onClick={submit} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors">
          {editingTask ? "Save Changes" : "Add Task"}
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function TasksPage() {
  const { tasks, showTaskForm, setShowTaskForm, updateTask } = useApp();
  const [view, setView] = useState<"list" | "kanban">("list");
  const today = toLocalDateStr();

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const prio = { urgent: 0, high: 1, medium: 2, low: 3 };
    return prio[a.priority] - prio[b.priority];
  });
  // Overdue work gets its own group at the top of the list, oldest first.
  const overdueTasks = sortedTasks
    .filter((t) => isTaskOverdue(t, today))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  const otherTasks = sortedTasks.filter((t) => !isTaskOverdue(t, today));

  const rescheduleAll = () => {
    for (const task of overdueTasks) updateTask(task.id, rescheduleToToday(task, today));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex glass-card p-0.5 rounded-lg">
          <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <LayoutList className="w-3.5 h-3.5 inline mr-1" />List
          </button>
          <button onClick={() => setView("kanban")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Columns className="w-3.5 h-3.5 inline mr-1" />Board
          </button>
        </div>
        <CategoryManagerButton mode="task" />
        <button onClick={() => setShowTaskForm(true)} className="ml-auto glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary-foreground hover:bg-primary transition-colors flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Task
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <div className="space-y-4">
          {view === "list" ? (
            <div className="space-y-4">
              {overdueTasks.length > 0 && (
                <section aria-labelledby="overdue-heading" className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <h2 id="overdue-heading" className="text-xs uppercase tracking-widest text-amber-300">
                      Overdue
                    </h2>
                    <span className="text-[10px] text-muted-foreground">{overdueTasks.length}</span>
                    {overdueTasks.length > 1 && (
                      <button
                        onClick={rescheduleAll}
                        className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-amber-300 hover:bg-amber-400/10 transition-colors"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Move all to today
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {overdueTasks.map((task) => <TaskItem key={task.id} task={task} overdue />)}
                  </AnimatePresence>
                </section>
              )}
              <div className="space-y-2">
                <AnimatePresence>
                  {otherTasks.map((task) => <TaskItem key={task.id} task={task} />)}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <KanbanBoard tasks={sortedTasks} />
          )}
        </div>
        <div className="hidden lg:block">
          <PomodoroTimer />
        </div>
      </div>
    </motion.div>
  );
}
