import { AlarmClock, Check, Trash2, X } from "lucide-react";
import { useAppActions, useTaskCategories, useTasks, type Priority, type Task } from "@/contexts/AppContext";
import { ThemedSelect } from "@/components/ui/field-controls";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { canSnooze } from "@/lib/snooze";
import { taskSelection, useSelectedTaskIds } from "@/lib/taskSelection";
import { PRIORITY_OPTIONS } from "./TaskQuickEdit";
import { SnoozePopover } from "./TaskSnooze";

const BUTTON =
  "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors";

export function TaskBulkBar({ today }: { today: string }) {
  const ids = useSelectedTaskIds();
  const tasks = useTasks();
  const categories = useTaskCategories();
  const { completeTask, deleteTask, rescheduleTasks } = useAppActions();
  const picked = tasks.filter((t) => ids.has(t.id));
  useEscapeKey(taskSelection.clear, picked.length > 0);
  if (!picked.length) return null;

  const label = `${picked.length} task${picked.length === 1 ? "" : "s"}`;
  const open = picked.filter((t) => !t.completed);
  const snoozable = picked.filter(canSnooze);
  const setAll = (updates: Partial<Task>, where: string) => {
    rescheduleTasks(picked.map((t) => ({ id: t.id, updates })), `${label} moved to ${where}`);
    taskSelection.clear();
  };

  return (
    <div role="toolbar" aria-label="Selected tasks" className="glass-card sticky top-2 z-20 flex items-center gap-1 flex-wrap rounded-xl px-3 py-2">
      <span className="mr-2 text-xs font-medium">{picked.length} selected</span>
      {open.length > 0 && (
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            completeTask(open);
            taskSelection.clear();
          }}
        >
          <Check className="w-3.5 h-3.5" /> Complete
        </button>
      )}
      {snoozable.length > 0 && (
        <SnoozePopover tasks={snoozable} today={today} onDone={taskSelection.clear}>
          {({ ref, open: menuOpen, toggle }) => (
            <button ref={ref} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={menuOpen} className={BUTTON}>
              <AlarmClock className="w-3.5 h-3.5" /> Snooze
            </button>
          )}
        </SnoozePopover>
      )}
      <ThemedSelect
        value=""
        placeholder="Category"
        aria-label="Category for the selected tasks"
        options={categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
        onChange={(id) => setAll({ categoryId: id }, categories.find((c) => c.id === id)?.name ?? "the category")}
        className="w-32 py-1 text-xs"
      />
      <ThemedSelect
        value=""
        placeholder="Priority"
        aria-label="Priority for the selected tasks"
        options={PRIORITY_OPTIONS}
        onChange={(p) => setAll({ priority: p as Priority }, PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? p)}
        className="w-28 py-1 text-xs"
      />
      <button
        type="button"
        className={`${BUTTON} hover:text-destructive`}
        onClick={() => {
          deleteTask(picked.map((t) => t.id));
          taskSelection.clear();
        }}
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
      <button type="button" onClick={taskSelection.clear} aria-label="Clear selection" className={`${BUTTON} ml-auto`}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
