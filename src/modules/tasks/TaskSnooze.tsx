/**
 * Snooze controls on Engine task cards (v0.9.4): the snooze button and its
 * menu, and the "Until …" chip and Unsnooze button a snoozed card shows
 * instead. The rules live in src/lib/snooze.ts.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AlarmClock, CalendarDays, ChevronLeft, Infinity as InfinityIcon, Sunrise } from "lucide-react";
import { useAppActions, type Task } from "@/contexts/AppContext";
import { Calendar } from "@/components/ui/calendar";
import { Popup, useDismiss, usePopupPosition } from "@/components/ui/field-controls";
import { addDays, cn, toLocalDateStr } from "@/lib/utils";
import { formatSnoozeDate, snoozeLabel, snoozePresets, snoozeTitle, snoozeUpdates, UNSNOOZE } from "@/lib/snooze";

const ROW = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10 focus-visible:bg-primary/10 outline-none";

/** The menu's rows: the quick picks, a date picker and Someday. */
function SnoozeMenu({
  today,
  picking,
  setPicking,
  onPick,
}: {
  today: string;
  picking: boolean;
  setPicking: (on: boolean) => void;
  onPick: (until: string | "someday") => void;
}) {
  const tomorrow = addDays(today, 1);
  if (picking) {
    return (
      <div>
        <button type="button" onClick={() => setPicking(false)} className={cn(ROW, "text-xs text-muted-foreground border-b border-border/50")}>
          <ChevronLeft className="h-3.5 w-3.5" /> Snooze until…
        </button>
        <Calendar
          mode="single"
          defaultMonth={new Date(`${tomorrow}T00:00:00`)}
          disabled={{ before: new Date(`${tomorrow}T00:00:00`) }}
          onSelect={(date) => date && onPick(toLocalDateStr(date))}
          initialFocus
        />
      </div>
    );
  }
  return (
    <div role="menu" aria-label="Snooze until" className="w-56 py-1">
      <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Snooze until</p>
      {snoozePresets(today).map((preset) => (
        <button key={preset.id} type="button" role="menuitem" onClick={() => onPick(preset.date)} className={ROW}>
          <span className="flex-1">{preset.label}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{formatSnoozeDate(preset.date, today)}</span>
        </button>
      ))}
      <button type="button" role="menuitem" onClick={() => setPicking(true)} className={ROW}>
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1">Pick a date…</span>
      </button>
      <div className="my-1 border-t border-border/50" />
      <button type="button" role="menuitem" onClick={() => onPick("someday")} className={ROW}>
        <InfinityIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1">Someday</span>
        <span className="text-[11px] text-muted-foreground">No date</span>
      </button>
    </div>
  );
}

/**
 * A trigger and the snooze menu under it. `trigger` gets the ref and props for
 * the button that opens it.
 */
function SnoozePopover({
  task,
  today,
  children,
}: {
  task: Task;
  today: string;
  children: (props: {
    ref: React.RefObject<HTMLButtonElement>;
    open: boolean;
    toggle: (e: React.MouseEvent) => void;
  }) => ReactNode;
}) {
  const { rescheduleTasks } = useAppActions();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Opened with a mouse (not Enter or Space): closing then drops the trigger's
  // focus, or the Escape key would switch the browser to keyboard focus and
  // leave the hover-only button lit with a focus ring.
  const byPointer = useRef(false);
  const pos = usePopupPosition(open, triggerRef, panelRef, false, picking);
  const close = useCallback(() => {
    setOpen(false);
    setPicking(false);
    if (byPointer.current) triggerRef.current?.blur();
  }, []);
  const dismissRefs = useMemo(() => [triggerRef, panelRef], []);
  useDismiss(open, close, dismissRefs);

  const pick = (until: string | "someday") => {
    rescheduleTasks([{ id: task.id, updates: snoozeUpdates(until) }], snoozeTitle(task.name, until, today));
    close();
  };

  return (
    <>
      {children({
        ref: triggerRef,
        open,
        toggle: (e) => {
          if (open) return close();
          // A keyboard click has no pointer position or click count.
          byPointer.current = e.detail > 0;
          setOpen(true);
        },
      })}
      <Popup open={open} pos={pos} panelRef={panelRef}>
        <SnoozeMenu today={today} picking={picking} setPicking={setPicking} onPick={pick} />
      </Popup>
    </>
  );
}

/** The snooze button on an open, top-level card: left of edit and delete. */
export function SnoozeButton({ task, today }: { task: Task; today: string }) {
  return (
    <SnoozePopover task={task} today={today}>
      {({ ref, open, toggle }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Snooze ${task.name}`}
          title="Snooze"
          className={cn(
            "transition-opacity text-muted-foreground hover:text-primary",
            open ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <AlarmClock className="w-4 h-4" />
        </button>
      )}
    </SnoozePopover>
  );
}

/** A snoozed card's "Until …" chip, which re-opens the menu to move the snooze. */
export function SnoozeChip({ task, today }: { task: Task; today: string }) {
  return (
    <SnoozePopover task={task} today={today}>
      {({ ref, open, toggle }) => (
        <button
          ref={ref}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle(e);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Change snooze of ${task.name}`}
          title="Change snooze"
          className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-0.5"
        >
          {task.someday ? <InfinityIcon className="w-2.5 h-2.5" /> : <AlarmClock className="w-2.5 h-2.5" />}
          {snoozeLabel(task, today)}
        </button>
      )}
    </SnoozePopover>
  );
}

/** The Unsnooze button a snoozed card shows in the snooze button's place. */
export function UnsnoozeButton({ task }: { task: Task }) {
  const { rescheduleTasks } = useAppActions();
  return (
    <button
      type="button"
      onClick={() => rescheduleTasks([{ id: task.id, updates: UNSNOOZE }], `${task.name} is back`)}
      aria-label={`Unsnooze ${task.name}`}
      title="Bring it back now"
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors shrink-0"
    >
      <Sunrise className="w-3.5 h-3.5" />
      Unsnooze
    </button>
  );
}
