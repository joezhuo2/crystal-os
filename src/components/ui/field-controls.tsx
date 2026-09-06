/**
 * Themed replacements for the native <select>, date and time controls.
 *
 * The browser-native widgets render their popup with OS chrome (a white sheet on
 * Windows/Chrome) which reads as a hole punched through the app's dark glass
 * theme. These are drop-in equivalents that render the popup ourselves, in a
 * portal so a dialog's overflow/stacking context can never clip it.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn, toLocalDateStr } from "@/lib/utils";

/* ── shared styling ── */

const TRIGGER_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-secondary/70 focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50";

const PANEL_CLASS =
  "overflow-hidden rounded-xl border border-border/60 bg-popover/95 text-popover-foreground shadow-2xl shadow-black/50 ring-1 ring-white/5 backdrop-blur-xl";

const ROW_CLASS =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors";

const MAX_PANEL_HEIGHT = 288;

/* ── positioning ── */

type Placement = "top" | "bottom";

interface PopupPos {
  top: number;
  left: number;
  width?: number;
  placement: Placement;
}

/**
 * Pin a portalled panel to its trigger using fixed coordinates, flipping above
 * the trigger when the viewport has no room below.
 */
function usePopupPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement>,
  panelRef: RefObject<HTMLElement>,
  matchTriggerWidth: boolean,
): PopupPos | null {
  const [pos, setPos] = useState<PopupPos | null>(null);

  const update = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = Math.min(
      panelRef.current?.offsetHeight || MAX_PANEL_HEIGHT,
      MAX_PANEL_HEIGHT,
    );
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const roomAbove = rect.top - 8;
    const placement: Placement =
      roomBelow < panelHeight && roomAbove > roomBelow ? "top" : "bottom";

    const width = matchTriggerWidth ? rect.width : undefined;
    const panelWidth = width ?? panelRef.current?.offsetWidth ?? rect.width;
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - panelWidth - 8),
    );
    const top =
      placement === "bottom"
        ? rect.bottom + 6
        : Math.max(8, rect.top - 6 - panelHeight);

    setPos({ top, left, width, placement });
  }, [matchTriggerWidth, panelRef, triggerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    update();
    // Re-measure once the panel has actually rendered, so the flip decision and
    // the "above" offset use its real height rather than the max estimate.
    const raf = requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, update]);

  return pos;
}

/** Close on outside pointer-down or Escape. */
function useDismiss(
  open: boolean,
  onClose: () => void,
  refs: RefObject<HTMLElement>[],
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Swallow it, otherwise the surrounding dialog closes too.
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose, refs]);
}

/** The portalled, animated panel shared by every control below. */
function Popup({
  open,
  pos,
  panelRef,
  role,
  children,
}: {
  open: boolean;
  pos: PopupPos | null;
  panelRef: RefObject<HTMLDivElement>;
  role?: string;
  children: ReactNode;
}) {
  const offset = pos?.placement === "top" ? 4 : -4;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role={role}
          initial={{ opacity: 0, scale: 0.97, y: offset }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: offset }}
          transition={{ duration: 0.13, ease: "easeOut" }}
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: pos?.width,
            visibility: pos ? "visible" : "hidden",
          }}
          className={cn("z-[120]", PANEL_CLASS)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── select ── */

export interface SelectOption {
  value: string;
  label: string;
  /** Optional swatch, e.g. a category colour. */
  color?: string;
}

export interface ThemedSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}

export function ThemedSelect({
  value,
  onChange,
  options,
  className,
  placeholder = "Select…",
  disabled,
  title,
  "aria-label": ariaLabel,
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const pos = usePopupPosition(open, triggerRef, panelRef, true);
  const close = useCallback(() => setOpen(false), []);
  const dismissRefs = useMemo(() => [triggerRef, panelRef], []);
  useDismiss(open, close, dismissRefs);

  useEffect(() => {
    if (open) setActive(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(TRIGGER_CLASS, className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: selected.color }}
            />
          )}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <Popup open={open} pos={pos} panelRef={panelRef} role="listbox">
        <div ref={listRef} className="scrollbar-thin max-h-72 overflow-y-auto p-1">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-index={index}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
                className={cn(
                  ROW_CLASS,
                  "rounded-lg",
                  index === active
                    ? "bg-primary/20 text-foreground"
                    : "text-foreground/80",
                )}
              >
                {option.color && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: option.color }}
                  />
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No options</p>
          )}
        </div>
      </Popup>
    </>
  );
}

/* ── date ── */

/** Parse "YYYY-MM-DD" at local noon, so DST never shifts the day. */
function parseDateStr(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export interface DateFieldProps {
  /** "YYYY-MM-DD", or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date, as "YYYY-MM-DD". */
  min?: string;
  className?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}

export function DateField({
  value,
  onChange,
  min,
  className,
  placeholder = "Pick a date",
  clearable,
  disabled,
  title,
  "aria-label": ariaLabel,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = parseDateStr(value);
  const minDate = min ? parseDateStr(min) : undefined;

  const pos = usePopupPosition(open, triggerRef, panelRef, false);
  const close = useCallback(() => setOpen(false), []);
  const dismissRefs = useMemo(() => [triggerRef, panelRef], []);
  useDismiss(open, close, dismissRefs);

  const commit = (date: string) => {
    onChange(date);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(TRIGGER_CLASS, className)}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? DATE_LABEL.format(selected) : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <Popup open={open} pos={pos} panelRef={panelRef} role="dialog">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(date) => date && commit(toLocalDateStr(date))}
          initialFocus
        />
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-2">
          <button
            type="button"
            onClick={() => commit(toLocalDateStr())}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Today
          </button>
          {clearable && (
            <button
              type="button"
              onClick={() => commit("")}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </Popup>
    </>
  );
}

/* ── time ── */

const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatTime(value: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return undefined;
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return Number.isNaN(date.getTime()) ? undefined : TIME_LABEL.format(date);
}

export interface TimeFieldProps {
  /** "HH:mm" (24-hour), or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}

export function TimeField({
  value,
  onChange,
  className,
  placeholder = "Pick a time",
  disabled,
  title,
  "aria-label": ariaLabel,
}: TimeFieldProps) {
  // Quarter-hour slots, plus the current value when it sits off the grid.
  const options = useMemo<SelectOption[]>(() => {
    const slots: string[] = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
      const h = String(Math.floor(minutes / 60)).padStart(2, "0");
      const m = String(minutes % 60).padStart(2, "0");
      slots.push(`${h}:${m}`);
    }
    if (value && !slots.includes(value)) {
      slots.push(value);
      slots.sort();
    }
    return slots.map((slot) => ({ value: slot, label: formatTime(slot) ?? slot }));
  }, [value]);

  return (
    <ThemedSelect
      value={value}
      onChange={onChange}
      options={options}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    />
  );
}
