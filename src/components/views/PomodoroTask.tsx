/**
 * The Pomodoro's task field (v0.9.5), under Start and Reset: a searchable
 * themed picker of open tasks, which also takes a task card dragged onto it.
 * Focus logged while a task is linked counts toward it in The Orbit. The
 * link itself lives in the Pomodoro store (src/lib/pomodoro.ts).
 */
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { useTasks } from "@/contexts/AppContext";
import { ThemedCombobox, type ComboboxOption } from "@/components/ui/field-controls";
import { usePomodoro } from "@/hooks/usePomodoro";
import { focusTaskOptions } from "@/lib/focusTask";
import { pomodoro } from "@/lib/pomodoro";
import { taskDrag } from "@/lib/subtasks";
import { cn, toLocalDateStr } from "@/lib/utils";

/** The picker's value for unlinked focus. */
const NONE = "";
const NO_TASK: ComboboxOption = { value: NONE, label: "No task" };

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function PomodoroTask() {
  const tasks = useTasks();
  const { task: linked } = usePomodoro();
  const [dropping, setDropping] = useState(false);
  const today = toLocalDateStr();

  const open = useMemo(() => focusTaskOptions(tasks, today), [tasks, today]);
  const options = useMemo<ComboboxOption[]>(
    () => [
      NO_TASK,
      ...open.map((t) => ({
        value: t.id,
        label: t.name,
        hint: t.startDate < today ? "Overdue" : t.startDate === today ? "Today" : shortDate(t.startDate),
      })),
    ],
    [open, today],
  );

  const link = (id: string) => {
    if (id === NONE) return pomodoro.setTask(null);
    const task = open.find((t) => t.id === id);
    if (task) pomodoro.setTask({ id: task.id, title: task.name });
  };

  /** The task being dragged, when it is one the field can take. */
  const dragged = () => (taskDrag.id ? open.find((t) => t.id === taskDrag.id) : undefined);

  return (
    <div
      data-testid="pomodoro-task-drop"
      data-drop={dropping}
      onDragOver={(e) => {
        if (!dragged()) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "link";
        setDropping(true);
      }}
      onDragLeave={(e) => {
        // Moving between the field's own children is not leaving it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        const task = dragged();
        if (!task) return;
        e.preventDefault();
        pomodoro.setTask({ id: task.id, title: task.name });
        taskDrag.id = null;
      }}
      className={cn(
        "mt-4 w-full rounded-xl transition-[box-shadow,background-color] duration-150",
        dropping && "ring-1 ring-primary/60 bg-primary/10",
      )}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Target className="h-3 w-3" />
        Focusing on
      </p>
      <ThemedCombobox
        aria-label="Focus task"
        value={linked?.id ?? NONE}
        // A linked task that dropped out of the list (snoozed, say) still shows.
        valueLabel={linked?.title}
        onChange={link}
        options={options}
        placeholder="No task"
        searchPlaceholder="Search tasks…"
        emptyText="No open tasks match"
        className={cn("text-xs", !linked && "text-muted-foreground")}
      />
      <p className="mt-1 text-center text-[10px] text-muted-foreground/70">
        {dropping ? "Drop to focus on this task" : "or drag a task here"}
      </p>
    </div>
  );
}
