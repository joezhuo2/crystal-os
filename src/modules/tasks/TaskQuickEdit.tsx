import { useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { useAppActions, type Task } from "@/contexts/AppContext";
import { Calendar } from "@/components/ui/calendar";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clampEstimate, ESTIMATE_PRESETS, formatEstimate, MAX_ESTIMATE } from "@/lib/capacity";
import { PRIORITY_OPTIONS } from "@/lib/homeTasks";
import { rescheduleToToday, toLocalDateStr } from "@/lib/utils";

/** Quick picks for how long a task takes, plus a minutes box for anything else. Tapping the lit chip clears it. */
export function EstimatePicker({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
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
        <NumberInput unstyled min={1} max={MAX_ESTIMATE} inputMode="numeric" placeholder="min"
          aria-label="Estimate in minutes"
          value={value ?? ""}
          onChange={(e) => onChange(clampEstimate(e.target.value))}
          className="w-16 bg-secondary/50 rounded-lg px-2 py-1.5 text-sm outline-none" />
      </div>
    </div>
  );
}

function Chip({
  label,
  className,
  children,
  panel,
}: {
  label: string;
  className: string;
  children: ReactNode;
  panel: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
          className={`-mx-1 rounded px-1 text-left transition-colors hover:bg-secondary/60 ${className}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2" onClick={(e) => e.stopPropagation()}>
        {panel(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export function DateChip({ task }: { task: Task }) {
  const { rescheduleTasks } = useAppActions();
  const start = new Date(`${task.startDate}T00:00:00`);
  return (
    <Chip
      label={`Change the date of ${task.name}`}
      className="text-[10px] text-muted-foreground truncate"
      panel={(close) => (
        <Calendar
          mode="single"
          selected={start}
          defaultMonth={start}
          onSelect={(date) => {
            close();
            if (!date) return;
            const day = toLocalDateStr(date);
            if (day === task.startDate) return;
            const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            rescheduleTasks([{ id: task.id, updates: rescheduleToToday(task, day) }], `${task.name} moved to ${label}`);
          }}
          initialFocus
        />
      )}
    >
      {task.startDate} {task.startTime} – {task.endDate === task.startDate ? "" : `${task.endDate} `}{task.endTime}
    </Chip>
  );
}

export function PriorityChip({ task }: { task: Task }) {
  const { updateTask } = useAppActions();
  const current = PRIORITY_OPTIONS.find((o) => o.value === task.priority) ?? PRIORITY_OPTIONS[1];
  return (
    <Chip
      label={`Change the priority of ${task.name}`}
      className={`text-[10px] font-semibold shrink-0 ${current.className}`}
      panel={(close) => (
        <div role="menu" aria-label="Priority" className="flex flex-col">
          {PRIORITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === task.priority}
              onClick={() => {
                close();
                if (o.value !== task.priority) updateTask(task.id, { priority: o.value });
              }}
              className={`rounded px-3 py-1.5 text-left text-xs font-semibold transition-colors hover:bg-primary/10 ${o.className}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    >
      {current.short}
    </Chip>
  );
}

export function EstimateChip({ task }: { task: Task }) {
  const { updateTask } = useAppActions();
  if (!task.estimateMinutes) return null;
  return (
    <Chip
      label={`Change the estimate of ${task.name}`}
      className="text-[10px] text-muted-foreground flex items-center gap-0.5 tabular-nums shrink-0"
      panel={() => (
        <div className="w-64">
          <EstimatePicker value={task.estimateMinutes} onChange={(estimateMinutes) => updateTask(task.id, { estimateMinutes })} />
        </div>
      )}
    >
      <Clock className="w-2.5 h-2.5" />{formatEstimate(task.estimateMinutes)}
    </Chip>
  );
}
