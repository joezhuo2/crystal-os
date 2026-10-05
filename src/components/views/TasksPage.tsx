import { memo, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useAppActions, useTaskCategories, useTasks, type Task, type Priority } from "@/contexts/AppContext";
import { appUi } from "@/lib/appUi";
import { m, AnimatePresence } from "framer-motion";
import { Plus, Check, Trash2, LayoutList, Columns, X, Pencil, Repeat, AlertTriangle, CalendarClock, Clock, ChevronDown, StickyNote } from "lucide-react";
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
import { useAppActivity } from "@/lib/appActivity";
import PomodoroTimer from "./PomodoroTimer";
import { CategoryManagerButton } from "./CategoryManager";
import { CapacityCard } from "./CapacityBar";
import { clampEstimate, ESTIMATE_PRESETS, formatEstimate, MAX_ESTIMATE } from "@/lib/capacity";
import { canNest, MAX_NOTES, nestTargets, splitByParent, subtaskProgress, taskDrag, type ChecklistItem } from "@/lib/subtasks";
import { ChecklistEditor, ChildTaskRow, SubtaskChip } from "./TaskSubtasks";

const NO_CHILDREN: Task[] = [];

/** Expanding or collapsing a task card: a short ease, no spring, so nothing bounces. */
const EXPAND_TRANSITION = { type: "tween", duration: 0.2, ease: [0.4, 0, 0.2, 1] } as const;

/** Nesting by drag, shared by every card: whether a drop would nest, and doing it. */
type NestHandlers = {
  canNestInto: (childId: string, parentId: string) => boolean;
  nest: (childId: string, parentId: string) => void;
};

const priorityLabel: Record<Priority, string> = { low: "Low", medium: "Med", high: "High", urgent: "Urgent" };
const priorityClass: Record<Priority, string> = { low: "priority-low", medium: "priority-medium", high: "priority-high", urgent: "priority-urgent" };

// Memoised: an edit replaces only that task's object (and its parent's
// children list), so the other rows skip the re-render.
const TaskItem = memo(function TaskItem({
  task,
  subtasks = NO_CHILDREN,
  nesting,
  draggable,
  overdue,
}: {
  task: Task;
  subtasks?: Task[];
  nesting: NestHandlers;
  draggable?: boolean;
  overdue?: boolean;
}) {
  const { updateTask, completeTask, deleteTask } = useAppActions();
  const taskCategories = useTaskCategories();
  const { setEditingTask, setShowTaskForm } = appUi;
  const [expanded, setExpanded] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const cat = taskCategories.find((c) => c.id === task.categoryId);
  const repeatLabel = describeRepeat(task.repeat, task.startDate);
  const progress = subtaskProgress(task, subtasks);
  const toggle = (t: Task) => (t.completed ? updateTask(t.id, { completed: false }) : completeTask(t));
  const edit = (t: Task) => {
    setEditingTask(t);
    setShowTaskForm(true);
  };
  return (
    <m.div
      // Position only, on a short tween: a size layout animation springs
      // (and overshoots) and stretches the card's content while it scales.
      // The details panel below grows its own height instead.
      layout="position"
      transition={{ layout: EXPAND_TRANSITION }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      draggable={draggable}
      onDragStart={(e: Event) => {
        (e as DragEvent).dataTransfer?.setData("text/plain", task.id);
        taskDrag.id = task.id;
      }}
      onDragEnd={() => {
        taskDrag.id = null;
      }}
      // Dropping another task on this card nests it here, when that is
      // allowed; otherwise the drag carries on to the column or list behind.
      onDragOver={(e: React.DragEvent) => {
        if (!taskDrag.id || !nesting.canNestInto(taskDrag.id, task.id)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "link";
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e: React.DragEvent) => {
        setDropTarget(false);
        const childId = taskDrag.id;
        if (!childId || !nesting.canNestInto(childId, task.id)) return;
        e.preventDefault();
        e.stopPropagation();
        nesting.nest(childId, task.id);
        taskDrag.id = null;
      }}
      className={`glass-card-hover p-4 group ${task.completed ? "opacity-50" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${
        dropTarget ? "ring-1 ring-primary/60 bg-primary/10" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggle(task)}
          aria-label={task.completed ? `Reopen ${task.name}` : `Complete ${task.name}`}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            task.completed ? "bg-accent border-accent" : "border-muted-foreground/40 hover:border-primary"
          }`}
        >
          {task.completed && <Check className="w-3 h-3 text-accent-foreground" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
          <p className={`text-sm font-medium truncate ${task.completed ? "line-through" : ""}`}>{task.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
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
            {task.estimateMinutes && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 tabular-nums" title="Estimate">
                <Clock className="w-2.5 h-2.5" />{formatEstimate(task.estimateMinutes)}
              </span>
            )}
            <SubtaskChip {...progress} />
            {task.notes && (
              <span className="text-muted-foreground" title="Has notes">
                <StickyNote className="w-2.5 h-2.5" />
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
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? `Hide details of ${task.name}` : `Show details of ${task.name}`}
          className={`transition-[opacity,transform] text-muted-foreground hover:text-primary ${
            expanded || progress.total || task.notes ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } ${expanded ? "rotate-180" : ""}`}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button onClick={() => edit(task)} aria-label={`Edit ${task.name}`} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.name}`} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EXPAND_TRANSITION}
            className="overflow-hidden"
          >
            {/* Checklist rows and child tasks carry their own drags, which must
                not start a drag of the card around them. */}
            <div className="pt-3 ml-8 space-y-3 cursor-auto" onDragStart={(e) => e.stopPropagation()}>
              {task.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words select-text">{task.notes}</p>}
              <ChecklistEditor items={task.checklist ?? []} onChange={(checklist) => updateTask(task.id, { checklist })} />
              {subtasks.length > 0 && (
                <div className="space-y-0.5" role="group" aria-label="Subtasks">
                  {subtasks.map((child) => (
                    <ChildTaskRow
                      key={child.id}
                      task={child}
                      onToggle={() => toggle(child)}
                      onEdit={() => edit(child)}
                      onPromote={() => updateTask(child.id, { parentId: undefined })}
                    />
                  ))}
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
});

function KanbanBoard({
  tasks,
  childrenOf,
  nesting,
}: {
  tasks: Task[];
  childrenOf: Map<string, Task[]>;
  nesting: NestHandlers;
}) {
  const taskCategories = useTaskCategories();
  const { updateTask } = useAppActions();
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, catId: string) => {
    // Only task drags; a checklist item being reordered is not one.
    if (!taskDrag.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCat(catId);
  };

  const handleDrop = (e: React.DragEvent, targetCategoryId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      // A child task dragged out of its parent onto a column also moves back
      // to the top level. For a top-level task the parentId key changes nothing.
      updateTask(taskId, { categoryId: targetCategoryId, parentId: undefined });
    }
    taskDrag.id = null;
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
          <div data-fade-unit className="flex items-center gap-2 px-1 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
            <p className="text-xs text-muted-foreground uppercase tracking-widest">{col.label}</p>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">{col.tasks.length}</span>
          </div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {col.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  subtasks={childrenOf.get(task.id)}
                  nesting={nesting}
                  draggable={col.id !== "__done__"}
                />
              ))}
            </AnimatePresence>
            {col.tasks.length === 0 && (
              <p data-fade-unit className="text-xs text-muted-foreground/40 text-center py-6">Drop tasks here</p>
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

/** Quick picks for how long a task takes, plus a minutes box for anything else. Tapping the lit chip clears it. */
function EstimatePicker({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block" id="estimate-label">Estimate</label>
      <div className="flex items-center gap-1" role="group" aria-labelledby="estimate-label">
        {ESTIMATE_PRESETS.map((minutes) => {
          const on = value === minutes;
          return (
            <button key={minutes} type="button" aria-pressed={on}
              onClick={() => onChange(on ? undefined : minutes)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                on ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}>
              {formatEstimate(minutes)}
            </button>
          );
        })}
        <input type="number" min={1} max={MAX_ESTIMATE} inputMode="numeric" placeholder="min"
          aria-label="Estimate in minutes"
          value={value ?? ""}
          onChange={(e) => onChange(clampEstimate(e.target.value))}
          className="w-16 bg-secondary/50 rounded-lg px-2 py-1.5 text-sm outline-none" />
      </div>
    </div>
  );
}

/** "Subtask of" picker value for no parent. */
const NO_PARENT = "__none__";

export function TaskForm({ onClose, editingTask }: { onClose: () => void; editingTask?: Task | null }) {
  const { addTask, updateTask } = useAppActions();
  const taskCategories = useTaskCategories();
  const tasks = useTasks();
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
  const [estimate, setEstimate] = useState<number | undefined>(editingTask?.estimateMinutes);
  const [notes, setNotes] = useState(editingTask?.notes ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(editingTask?.checklist ?? []);
  const [parentId, setParentId] = useState(editingTask?.parentId ?? NO_PARENT);
  // A task with children of its own cannot be nested (one level deep).
  const hasChildren = !!editingTask && tasks.some((t) => t.parentId === editingTask.id);
  const parentOptions = useMemo(() => {
    const targets = nestTargets(editingTask?.id, tasks);
    // Keep the current parent listed even if it is now completed.
    const current = tasks.find((t) => t.id === editingTask?.parentId);
    if (current && !targets.includes(current)) targets.unshift(current);
    return [{ value: NO_PARENT, label: "None (top level)" }, ...targets.map((t) => ({ value: t.id, label: t.name }))];
  }, [editingTask, tasks]);

  const submit = () => {
    if (!form.name.trim()) return;
    const rule = buildRepeat(repeat);
    const details = {
      notes: notes.trim() ? notes : undefined,
      checklist: checklist.length ? checklist : undefined,
      parentId: parentId === NO_PARENT ? undefined : parentId,
    };
    if (editingTask) {
      // Always send repeat, undefined included: updateTask clears the repeat for it.
      // Same for estimateMinutes, notes, checklist and parentId: undefined clears them.
      updateTask(editingTask.id, { ...form, ...details, repeat: rule, estimateMinutes: estimate, completed: editingTask.completed });
    } else {
      addTask({ ...form, ...details, completed: false, repeat: rule, estimateMinutes: estimate });
    }
    onClose();
  };
  useEscapeKey(onClose);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        className="glass-card p-6 space-y-4 w-full max-w-md relative z-10 max-h-[calc(100vh-2rem)] overflow-y-auto"
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
        <EstimatePicker value={estimate} onChange={setEstimate} />
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
        <div>
          <label htmlFor="task-notes" className="text-xs text-muted-foreground mb-1 block">Notes</label>
          <textarea
            id="task-notes"
            value={notes}
            maxLength={MAX_NOTES}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details, links, anything to remember…"
            className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 resize-y"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Checklist</p>
          <ChecklistEditor items={checklist} onChange={setChecklist} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Subtask of</label>
          {hasChildren ? (
            <p className="text-[11px] text-muted-foreground">This task has subtasks of its own, so it stays at the top level.</p>
          ) : (
            <ThemedSelect value={parentId} aria-label="Subtask of" onChange={setParentId} options={parentOptions} />
          )}
        </div>
        <button onClick={submit} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors">
          {editingTask ? "Save Changes" : "Add Task"}
        </button>
      </m.div>
    </m.div>
  );
}

type View = "list" | "kanban";

/**
 * The drag-to-nest handlers. Stable across renders (they read the latest
 * tasks through a ref), so they never break TaskItem's memo.
 */
function useNesting(tasks: Task[]): NestHandlers {
  const { updateTask } = useAppActions();
  const latest = useRef(tasks);
  latest.current = tasks;
  const canNestInto = useCallback((childId: string, parentId: string) => canNest(childId, parentId, latest.current), []);
  const nest = useCallback((childId: string, parentId: string) => updateTask(childId, { parentId }), [updateTask]);
  return useMemo(() => ({ canNestInto, nest }), [canNestInto, nest]);
}

/**
 * Top-level tasks and each parent's children. A parent whose children are
 * the same task objects as last render keeps the same array, so its card
 * skips the re-render when some other task changes.
 */
function useSplitTasks(tasks: Task[]) {
  const previous = useRef(new Map<string, Task[]>());
  return useMemo(() => {
    const { top, children } = splitByParent(tasks);
    for (const [parentId, list] of children) {
      const old = previous.current.get(parentId);
      if (old && old.length === list.length && old.every((t, i) => t === list[i])) children.set(parentId, old);
    }
    previous.current = children;
    return { top, children };
  }, [tasks]);
}

/** Length of each half of the List/Board fade: out, then in. Matches .engine-view in index.css. */
const VIEW_FADE_MS = 150;

export default function TasksPage() {
  const tasks = useTasks();
  const { updateTask } = useAppActions();
  const { setShowTaskForm } = appUi;
  const nesting = useNesting(tasks);
  const { top, children: childrenOf } = useSplitTasks(tasks);
  const [unnestTarget, setUnnestTarget] = useState(false);
  // `selected` lights the toggle at once; `view` is what's on screen, which
  // trails it by the fade-out.
  const [selected, setSelected] = useState<View>("list");
  const [view, setView] = useState<View>("list");
  const [fade, setFade] = useState<"out" | "in" | null>(null);
  const fadeTimer = useRef<number>();
  const { still } = useAppActivity();
  useEffect(() => () => window.clearTimeout(fadeTimer.current), []);

  const switchView = (next: View) => {
    if (next === selected) return;
    setSelected(next);
    window.clearTimeout(fadeTimer.current);
    if (still) {
      setView(next);
      setFade(null);
      return;
    }
    setFade("out");
    fadeTimer.current = window.setTimeout(() => {
      setView(next);
      setFade("in");
      fadeTimer.current = window.setTimeout(() => setFade(null), VIEW_FADE_MS);
    }, VIEW_FADE_MS);
  };
  const today = toLocalDateStr();

  // Child tasks show inside their parent, not in the lists.
  const sortedTasks = [...top].sort((a, b) => {
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

  // Dropping a child task anywhere on the list (not on a card) moves it back
  // to the top level.
  const draggedChild = () => {
    const id = taskDrag.id;
    return id ? tasks.find((t) => t.id === id && t.parentId) : undefined;
  };
  const listDropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!draggedChild()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setUnnestTarget(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUnnestTarget(false);
    },
    onDrop: (e: React.DragEvent) => {
      setUnnestTarget(false);
      const child = draggedChild();
      if (!child) return;
      e.preventDefault();
      updateTask(child.id, { parentId: undefined });
      taskDrag.id = null;
    },
  };

  return (
    <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex glass-card p-0.5 rounded-lg">
          <button onClick={() => switchView("list")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selected === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <LayoutList className="w-3.5 h-3.5 inline mr-1" />List
          </button>
          <button onClick={() => switchView("kanban")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selected === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
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
          <CapacityCard />
          {/* Switching List/Board fades the old view out, then the new one in;
              reduced motion (OS setting or performance mode) swaps at once. The
              fade runs on each glass card and header (data-fade on .engine-view,
              see index.css), never on this wrapper: opacity on an ancestor of a
              backdrop-filter cuts the blur off, and it snapped back when the
              fade ended. Rows already there when a view mounts skip their own
              fade-in (initial={false} on each AnimatePresence). New tasks still
              fade in. */}
          <div className="engine-view" data-fade={fade ?? undefined}>
            {view === "list" ? (
              <div
                {...listDropProps}
                className={`space-y-4 min-h-[120px] rounded-xl transition-colors ${unnestTarget ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
              >
                {overdueTasks.length > 0 && (
                  <section aria-labelledby="overdue-heading" className="space-y-2">
                    <div data-fade-unit className="flex items-center gap-2 px-1">
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
                    <AnimatePresence initial={false}>
                      {overdueTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          subtasks={childrenOf.get(task.id)}
                          nesting={nesting}
                          draggable={!task.completed}
                          overdue
                        />
                      ))}
                    </AnimatePresence>
                  </section>
                )}
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {otherTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        subtasks={childrenOf.get(task.id)}
                        nesting={nesting}
                        draggable={!task.completed}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <KanbanBoard tasks={sortedTasks} childrenOf={childrenOf} nesting={nesting} />
            )}
          </div>
        </div>
        <div className="hidden lg:block">
          <PomodoroTimer />
        </div>
      </div>
    </m.div>
  );
}
