import { useState, useRef } from "react";
import { useApp, type Task, type Priority } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Trash2, LayoutList, Columns, X, Pencil } from "lucide-react";
import { toLocalDateStr } from "@/lib/utils";
import PomodoroTimer from "./PomodoroTimer";
import { CategoryManagerButton } from "./CategoryManager";

const priorityLabel: Record<Priority, string> = { low: "Low", medium: "Med", high: "High", urgent: "Urgent" };
const priorityClass: Record<Priority, string> = { low: "priority-low", medium: "priority-medium", high: "priority-high", urgent: "priority-urgent" };

function TaskItem({ task, draggable }: { task: Task; draggable?: boolean }) {
  const { updateTask, deleteTask, taskCategories, setEditingTask, setShowTaskForm } = useApp();
  const cat = taskCategories.find((c) => c.id === task.categoryId);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      draggable={draggable}
      onDragStart={(e: any) => {
        e.dataTransfer?.setData("text/plain", task.id);
      }}
      className={`glass-card-hover p-4 flex items-center gap-3 group ${task.completed ? "opacity-50" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
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
          <span className="text-[10px] text-muted-foreground">{task.startDate} {task.startTime} – {task.endDate === task.startDate ? "" : `${task.endDate} `}{task.endTime}</span>
          <span className={`text-[10px] font-semibold ${priorityClass[task.priority]}`}>{priorityLabel[task.priority]}</span>
          {cat && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${cat.color}22`, color: cat.color }}>
              {cat.name}
            </span>
          )}
        </div>
      </div>
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

export function TaskForm({ onClose, editingTask }: { onClose: () => void; editingTask?: Task | null }) {
  const { addTask, updateTask, taskCategories } = useApp();
  const today = toLocalDateStr();
  const [form, setForm] = useState({
    name: editingTask?.name || "",
    startDate: editingTask?.startDate || today,
    startTime: editingTask?.startTime || "09:00",
    endDate: editingTask?.endDate || today,
    endTime: editingTask?.endTime || "10:00",
    priority: (editingTask?.priority || "medium") as Priority,
    categoryId: editingTask?.categoryId || taskCategories[0]?.id || "",
    repeatDays: editingTask?.repeatDays || 0,
  });

  const submit = () => {
    if (!form.name.trim()) return;
    if (editingTask) {
      updateTask(editingTask.id, { ...form, completed: editingTask.completed, repeatDays: form.repeatDays || undefined });
    } else {
      addTask({ ...form, completed: false, repeatDays: form.repeatDays || undefined });
    }
    onClose();
  };

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
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))}
                className="flex-1 bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none" />
              <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="flex-1 bg-secondary/50 rounded-lg px-2 py-2.5 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">End</label>
            <div className="flex gap-1">
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="flex-1 bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none" min={form.startDate} />
              <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="flex-1 bg-secondary/50 rounded-lg px-2 py-2.5 text-sm outline-none" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
            className="flex-1 bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="flex-1 bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none">
            {taskCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Repeat every</label>
          <input type="number" min={0} value={form.repeatDays} onChange={(e) => setForm((f) => ({ ...f, repeatDays: parseInt(e.target.value) || 0 }))}
            className="w-16 bg-secondary/50 rounded-lg px-2 py-1.5 text-sm outline-none" />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
        <button onClick={submit} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors">
          {editingTask ? "Save Changes" : "Add Task"}
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function TasksPage() {
  const { tasks, showTaskForm, setShowTaskForm } = useApp();
  const [view, setView] = useState<"list" | "kanban">("list");

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
        <button onClick={() => setShowTaskForm(true)} className="ml-auto glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary-foreground hover:bg-primary transition-colors flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Task
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <div className="space-y-4">
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
