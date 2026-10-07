import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useTaskCategories, type Priority } from "@/contexts/AppContext";
import { DateField, Popup, ThemedSelect, usePopupPosition } from "@/components/ui/field-controls";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { MAX_ESTIMATE } from "@/lib/capacity";
import {
  DUE_RANGES,
  ESTIMATE_OPS,
  SORT_KEYS,
  SORT_LABELS,
  STATUS_FLAGS,
  activeFilterCount,
  taskView,
  useTaskView,
  type DueRange,
  type EstimateOp,
  type StatusFlag,
} from "@/lib/taskView";
import { cn } from "@/lib/utils";

const PRIORITIES: { value: Priority; label: string; cls: string }[] = [
  { value: "urgent", label: "Urgent", cls: "priority-urgent" },
  { value: "high", label: "High", cls: "priority-high" },
  { value: "medium", label: "Med", cls: "priority-medium" },
  { value: "low", label: "Low", cls: "priority-low" },
];

const STATUS_LABELS: Record<StatusFlag, string> = {
  hideCompleted: "Hide done",
  hasChecklist: "Has checklist",
  hasNotes: "Has notes",
  hasSubtasks: "Has subtasks",
};

const DUE_LABELS: Record<DueRange, string> = {
  any: "Any",
  today: "Today",
  week: "This week",
  overdue: "Overdue",
  custom: "Custom",
};

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Chip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        on ? "bg-primary/20 text-foreground ring-1 ring-primary/50" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

/** The panel's contents; mounted only while open. */
function TaskViewPanel() {
  const { sort, filters } = useTaskView();
  const categories = useTaskCategories();
  const [minutes, setMinutes] = useState(filters.estimate ? String(filters.estimate.minutes) : "");
  const [op, setOp] = useState<EstimateOp>(filters.estimate?.op ?? "<=");

  const commitEstimate = (nextOp: EstimateOp, raw: string) => {
    const n = Number.parseInt(raw, 10);
    taskView.setFilters({
      estimate: raw.trim() && Number.isFinite(n) && n >= 0 ? { op: nextOp, minutes: Math.min(n, MAX_ESTIMATE) } : null,
    });
  };

  const active = activeFilterCount(filters);

  return (
    <div className="w-[320px] max-h-[min(72vh,600px)] overflow-y-auto p-3 space-y-3.5">
      <Section title="Sort by">
        <div className="flex gap-2">
          <ThemedSelect
            aria-label="Sort by"
            className="flex-1"
            value={sort.key}
            onChange={(v) => taskView.setSort({ key: v as typeof sort.key })}
            options={SORT_KEYS.map((k) => ({ value: k, label: SORT_LABELS[k] }))}
          />
          <button
            type="button"
            onClick={() => taskView.setSort({ dir: sort.dir === "asc" ? "desc" : "asc" })}
            aria-label={sort.dir === "asc" ? "Ascending, switch to descending" : "Descending, switch to ascending"}
            title={sort.dir === "asc" ? "Ascending" : "Descending"}
            className="flex items-center gap-1 rounded-lg bg-secondary/50 px-2.5 text-xs text-foreground transition-colors hover:bg-secondary/70"
          >
            {sort.dir === "asc" ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
            {sort.dir === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
      </Section>

      <div className="h-px bg-border/50" />

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Filter</p>
        {active > 0 && (
          <button
            type="button"
            onClick={() => {
              taskView.resetFilters();
              setMinutes("");
              setOp("<=");
            }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      <Section title="Name">
        <label className="flex items-center gap-2 rounded-lg bg-secondary/50 px-2.5 py-2 focus-within:ring-1 focus-within:ring-primary/50">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={filters.name}
            onChange={(e) => taskView.setFilters({ name: e.target.value })}
            placeholder="Contains…"
            aria-label="Name contains"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </label>
      </Section>

      {categories.length > 0 && (
        <Section title="Category">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <Chip key={c.id} on={filters.categories.includes(c.id)} onClick={() => taskView.setFilters({ categories: toggle(filters.categories, c.id) })}>
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                {c.name}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <Section title="Priority">
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map((p) => (
            <Chip key={p.value} on={filters.priorities.includes(p.value)} onClick={() => taskView.setFilters({ priorities: toggle(filters.priorities, p.value) })}>
              <span className={cn("rounded px-1 text-[10px]", p.cls)}>{p.label}</span>
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Estimate (minutes)">
        <div className="flex gap-2">
          <ThemedSelect
            aria-label="Estimate comparison"
            className="w-20"
            value={op}
            onChange={(v) => {
              setOp(v as EstimateOp);
              commitEstimate(v as EstimateOp, minutes);
            }}
            options={ESTIMATE_OPS.map((o) => ({ value: o, label: o === "==" ? "=" : o === "<=" ? "≤" : "≥" }))}
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_ESTIMATE}
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              commitEstimate(op, e.target.value);
            }}
            placeholder="Any"
            aria-label="Estimate minutes"
            className="flex-1 rounded-lg bg-secondary/50 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/50"
          />
        </div>
      </Section>

      <Section title="Due">
        <div className="flex flex-wrap gap-1.5">
          {DUE_RANGES.map((r) => (
            <Chip key={r} on={filters.due.range === r} onClick={() => taskView.setFilters({ due: { ...filters.due, range: r } })}>
              {DUE_LABELS[r]}
            </Chip>
          ))}
        </div>
        {filters.due.range === "custom" && (
          <div className="flex gap-2 pt-1">
            <DateField
              aria-label="Due from"
              placeholder="From"
              clearable
              value={filters.due.from}
              onChange={(v) => taskView.setFilters({ due: { ...filters.due, from: v } })}
            />
            <DateField
              aria-label="Due to"
              placeholder="To"
              clearable
              min={filters.due.from || undefined}
              value={filters.due.to}
              onChange={(v) => taskView.setFilters({ due: { ...filters.due, to: v } })}
            />
          </div>
        )}
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FLAGS.map((k) => (
            <Chip key={k} on={filters.status[k]} onClick={() => taskView.setFilters({ status: { ...filters.status, [k]: !filters.status[k] } })}>
              {STATUS_LABELS[k]}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
}

/** "Sort & Filter" for the Engine task list: a button and its popover. */
export function TaskViewMenu() {
  const [open, setOpen] = useState(false);
  const { sort, filters } = useTaskView();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopupPosition(open, triggerRef, panelRef, false, filters.due.range === "custom");
  const close = useCallback(() => setOpen(false), []);
  // Escape goes through the overlay stack, so it closes an open select inside
  // the panel first and the panel on the next press.
  useEscapeKey(close, open);

  // Outside click closes, except on the panel's own portalled select and date
  // popups (every themed popup carries data-popup).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || target.closest?.("[data-popup]")) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  const count = activeFilterCount(filters);
  const sorted = sort.key !== "default" || sort.dir !== "asc";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
          open || count || sorted ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Sort &amp; Filter
        {sorted && (
          <span className="text-[10px] text-muted-foreground" title={`${SORT_LABELS[sort.key]}, ${sort.dir === "asc" ? "ascending" : "descending"}`}>
            · {SORT_LABELS[sort.key]} {sort.dir === "asc" ? "↑" : "↓"}
          </span>
        )}
        {count > 0 && (
          <span aria-label={`${count} filter${count === 1 ? "" : "s"} active`} className="ml-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 text-center">
            {count}
          </span>
        )}
      </button>
      <Popup open={open} pos={pos} panelRef={panelRef} role="dialog">
        <TaskViewPanel />
      </Popup>
    </>
  );
}
