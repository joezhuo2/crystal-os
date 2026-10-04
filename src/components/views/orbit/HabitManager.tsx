import { useEffect, useRef, useState } from "react";
import { Archive, GripVertical, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { useHabitActions, useHabitsData } from "@/hooks/useHabits";
import { HABIT_COLORS, HABIT_NAME_MAX, type Habit } from "@/lib/habits";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The Orbit presets, plus a hex field for anything else. */
function ColorPicker({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  const [hex, setHex] = useState(HEX.test(value) ? value : "");
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {HABIT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            onClick={() => {
              onChange(c);
              setHex("");
            }}
            className={`orbit-swatch-pick ${value === c ? "orbit-swatch-pick-on" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative shrink-0">
          <span className="sr-only">Pick any colour</span>
          <input
            type="color"
            value={HEX.test(value) ? value : "#a5e9fb"}
            onChange={(e) => {
              onChange(e.target.value);
              setHex(e.target.value);
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <span className="orbit-swatch-pick block" style={{ background: value }} aria-hidden="true" />
        </label>
        <input
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value);
          }}
          placeholder="#a5e9fb"
          aria-label="Hex colour"
          className="orbit-textarea py-1.5 font-mono text-xs"
        />
        <span className="text-[10px] text-muted-foreground shrink-0">Hex</span>
      </div>
    </div>
  );
}

function HabitRow({
  habit,
  dragging,
  onGrab,
  onMove,
  onArchive,
}: {
  habit: Habit;
  dragging: boolean;
  onGrab: (e: React.PointerEvent) => void;
  onMove: (delta: -1 | 1) => void;
  onArchive: () => void;
}) {
  const { updateHabit } = useHabitActions();
  const [name, setName] = useState(habit.name);
  const [picking, setPicking] = useState(false);
  useEffect(() => setName(habit.name), [habit.name]);

  const commitName = () => {
    if (name.trim() && name.trim() !== habit.name) void updateHabit(habit.id, { name });
    else setName(habit.name);
  };

  return (
    <li className={`orbit-habit-row ${dragging ? "orbit-habit-row-dragging" : ""}`} data-habit-id={habit.id}>
      <div className="flex items-center gap-2">
        <GlassTip label="Drag to reorder" hint="Or use the arrow keys" tone="orbit">
          <button
            type="button"
            className="orbit-habit-grip"
            aria-label={`Move ${habit.name}`}
            onPointerDown={onGrab}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                onMove(e.key === "ArrowUp" ? -1 : 1);
              }
            }}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        </GlassTip>
        <GlassTip label="Colour" hint={picking ? "Close" : "Change"} tone="orbit">
          <button
            type="button"
            className="orbit-habit-dot orbit-habit-dot-button"
            style={{ background: habit.color }}
            aria-label={`Colour of ${habit.name}`}
            aria-expanded={picking}
            onClick={() => setPicking((p) => !p)}
          />
        </GlassTip>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setName(habit.name);
            }
          }}
          maxLength={HABIT_NAME_MAX}
          aria-label="Habit name"
          className="orbit-habit-name"
        />
        <GlassTip label="Remove" hint="Its history stays in past reviews" tone="orbit">
          <button type="button" className="orbit-icon-button orbit-habit-archive" onClick={onArchive} aria-label={`Remove ${habit.name}`}>
            <Archive className="w-3.5 h-3.5" />
          </button>
        </GlassTip>
      </div>
      {picking && (
        <div className="mt-2.5 pl-7">
          <ColorPicker value={habit.color} onChange={(color) => void updateHabit(habit.id, { color })} label={`Colour of ${habit.name}`} />
        </div>
      )}
    </li>
  );
}

/**
 * Add, rename, recolour, reorder and remove habits. Removing archives: the
 * habit leaves the Today card, and its check-offs still count in reviews of
 * the periods it was active in.
 */
export function HabitManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data } = useHabitsData();
  const { addHabit, archiveHabit, reorderHabits } = useHabitActions();
  const active = (data?.habits ?? []).filter((h) => !h.archivedAt);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(HABIT_COLORS[0]);
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState<Habit | null>(null);

  // While dragging, the order lives here; it is saved on release.
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const ids = order ?? active.map((h) => h.id);
  const byId = new Map(active.map((h) => [h.id, h]));
  const rows = ids.map((id) => byId.get(id)).filter((h): h is Habit => !!h);

  const grab = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = active.map((h) => h.id);
    let current = start;
    setOrder(start);
    setDragId(id);
    document.body.classList.add("home-dragging");

    const move = (ev: PointerEvent) => {
      const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-habit-id]") ?? []);
      const others = items.filter((el) => el.dataset.habitId !== id);
      // The slot is how many of the other rows sit above the pointer.
      const slot = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < ev.clientY;
      }).length;
      const rest = current.filter((x) => x !== id);
      const next = [...rest.slice(0, slot), id, ...rest.slice(slot)];
      if (next.join() !== current.join()) {
        current = next;
        setOrder(next);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("home-dragging");
      setDragId(null);
      void reorderHabits(current).finally(() => setOrder(null));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const nudge = (id: string, delta: -1 | 1) => {
    const list = active.map((h) => h.id);
    const i = list.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void reorderHabits(list);
  };

  const add = async () => {
    if (!name.trim() || adding) return;
    setAdding(true);
    await addHabit(name, color);
    setAdding(false);
    setName("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="orbit-dialog max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="orbit-title text-lg">Habits</DialogTitle>
            <DialogDescription className="text-xs">
              Tick them off in the Today card. Removing a habit keeps its history in past reviews.
            </DialogDescription>
          </DialogHeader>

          {rows.length ? (
            <ol ref={listRef} className="grid gap-1.5" aria-label="Your habits">
              {rows.map((h) => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  dragging={dragId === h.id}
                  onGrab={grab(h.id)}
                  onMove={(d) => nudge(h.id, d)}
                  onArchive={() => setArchiving(h)}
                />
              ))}
            </ol>
          ) : (
            <p className="orbit-empty text-center py-3">No habits yet</p>
          )}

          <form
            className="grid gap-3 border-t border-[hsl(var(--orbit-ice)/0.12)] pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <p className="orbit-card-title">Add a habit</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={HABIT_NAME_MAX}
              placeholder="Read 20 pages"
              aria-label="New habit name"
              className="orbit-textarea"
            />
            <ColorPicker value={color} onChange={setColor} label="New habit colour" />
            <button type="submit" className="orbit-button" disabled={!name.trim() || adding}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add habit
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent className="orbit-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{archiving?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the Today card from today on. Its check-offs stay, and still count in reviews of the weeks and months it was
              tracked in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="orbit-button-ghost">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="orbit-button orbit-button-danger"
              onClick={() => {
                if (archiving) void archiveHabit(archiving.id);
                setArchiving(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
