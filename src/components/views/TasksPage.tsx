import { useState } from "react";
import { useApp, type Task, type Priority } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Trash2, LayoutList, Columns, X } from "lucide-react";
import PomodoroTimer from "./PomodoroTimer";
import { CategoryManagerButton } from "./CategoryManager";

const priorityLabel: Record<Priority, string> = { low: "Low", medium: "Med", high: "High", urgent: "Urgent" };
const priorityClass: Record<Priority, string> = { low: "priority-low", medium: "priority-medium", high: "priority-high", urgent: "priority-urgent" };

function TaskItem({ task }: { task: Task }) {
  const { updateTask, deleteTask, taskCategories } = useApp();
  const cat = taskCategories.find((c) => c.id === task.categoryId);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`glass-card-hover p-4 flex items-center gap-3 group ${task.completed ? "opacity-50" : ""}`}
    >
      <button
        onClick={() => updateTask(task.id, { completed: !task.completed })}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          task.completed ? "bg-accent border-accent" : "border-muted-foreground/40 hover:border-primary"
        }`}
      >
        {task.completed && <Check className="w-3 h-3 text-accent-foreground" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.completed ? "line-through" : ""}`}>{task.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">{task.startTime}–{task.endTime}</span>
          <span className={`text-[10px] font-semibold ${priorityClass[task.priority]}`}>{priorityLabel[task.priority]}</span>
          {cat && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${cat.color}22`, color: cat.color }}>
              {cat.name}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const columns = [
    { label: "To Do", filter: (t: Task) => !t.completed && t.priority !== "urgent" },
    { label: "Urgent", filter: (t: Task) => !t.completed && t.priority === "urgent" },
    { label: "Done", filter: (t: Task) => t.completed },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((col) => (
        <div key={col.label} className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest px-1 mb-2">{col.label}</p>
          <AnimatePresence>
            {tasks.filter(col.filter).map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function TaskForm({ onClose }: { onClose: () => void }) {
  const { addTask, taskCategories } = useApp();
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    name: "", date: today, startTime: "09:00", endTime: "10:00",
    priority: "medium" as Priority, categoryId: taskCategories[0]?.id || "",
    repeatDays: 0,
  });

  const submit = () => {
    if (!form.name.trim()) return;
    addTask({ ...form, completed: false, repeatDays: form.repeatDays || undefined });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-card p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">New Task</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <input
        autoFocus
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Task name..."
        className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          className="bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none" />
        <div className="flex gap-1">
          <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            className="flex-1 bg-secondary/50 rounded-lg px-2 py-2 text-sm outline-none" />
          <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            className="flex-1 bg-secondary/50 rounded-lg px-2 py-2 text-sm outline-none" />
        </div>
      </div>
      <div className="flex gap-2">
        <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
          className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
          className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none">
          {taskCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Repeat every</label>
        <input type="number" min={0} value={form.repeatDays} onChange={(e) => setForm((f) => ({ ...f, repeatDays: parseInt(e.target.value) || 0 }))}
          className="w-16 bg-secondary/50 rounded-lg px-2 py-1 text-sm outline-none" />
        <span className="text-xs text-muted-foreground">days</span>
      </div>
      <button onClick={submit} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2 text-sm font-medium transition-colors">
        Add Task
      </button>
    </motion.div>
  );
}

export default function TasksPage() {
  const { tasks } = useApp();
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showForm, setShowForm] = useState(false);

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const prio = { urgent: 0, high: 1, medium: 2, low: 3 };
    return prio[a.priority] - prio[b.priority];
  });

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
        <button onClick={() => setShowForm(!showForm)} className="ml-auto glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary-foreground hover:bg-primary transition-colors flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Task
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <div className="space-y-4">
          <AnimatePresence>{showForm && <TaskForm onClose={() => setShowForm(false)} />}</AnimatePresence>
          {view === "list" ? (
            <div className="space-y-2">
              <AnimatePresence>
                {sortedTasks.map((task) => <TaskItem key={task.id} task={task} />)}
              </AnimatePresence>
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
