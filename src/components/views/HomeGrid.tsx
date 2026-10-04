import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { m } from "framer-motion";
import { ChevronLeft, ChevronRight, Eye, EyeOff, LayoutGrid, RotateCcw } from "lucide-react";
import {
  clearLayout,
  loadLayout,
  normalizeLayout,
  nudge,
  saveLayout,
  setHidden,
  setSize,
  swap,
  type HomeLayout,
  type WidgetSize,
} from "@/lib/homeLayout";

export interface HomeWidget {
  id: string;
  label: string;
  /** Columns spanned until the user picks otherwise. */
  defaultSize?: WidgetSize;
  render: () => ReactNode;
}

/** How far the pointer must travel before a press becomes a drag, so clicks still open pages. */
const DRAG_THRESHOLD_PX = 6;

/** Pressing on any of these uses the control; only the box itself starts a drag. */
const NO_DRAG =
  'a, button, input, textarea, select, label, summary, [role="button"], [role="link"], [role="slider"], [contenteditable="true"], [data-no-drag]';

const SPAN_CLASS: Record<WidgetSize, string> = {
  1: "",
  2: "md:col-span-2",
  3: "md:col-span-2 lg:col-span-3",
};

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Pointer position inside the tile when it was grabbed. */
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  active: boolean;
  /** Tile the pointer was already over, so resting on it doesn't swap again. */
  lastTarget: string | null;
  /** Frame loop keeping the dragged tile glued to the pointer while the grid animates. */
  raf: number;
}

/** How long a released tile takes to settle into its cell. */
const DROP_MS = 180;

/**
 * Where a tile sits in the grid, from its offsets. Unlike getBoundingClientRect
 * this ignores the transform of a layout animation in flight, so tiles sliding
 * past don't count as being under the pointer.
 */
function slotRect(el: HTMLElement, grid: DOMRect) {
  const left = grid.left + el.offsetLeft;
  const top = grid.top + el.offsetTop;
  return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
}

/**
 * The Home tab's widgets in a grid the user can rearrange: drag a widget by
 * its box to move it, and use "Edit layout" to resize, hide or reset. The
 * arrangement is kept per device (src/lib/homeLayout.ts).
 */
export default function HomeGrid({ widgets }: { widgets: HomeWidget[] }) {
  const ids = widgets.map((w) => w.id);
  const idsKey = ids.join("|");
  const [layout, setLayoutState] = useState<HomeLayout>(() => loadLayout(ids));
  const [editing, setEditing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // A changed widget list (an update adding one) folds into the saved layout.
  useEffect(() => {
    setLayoutState((l) => normalizeLayout(l, idsKey.split("|")));
  }, [idsKey]);

  const update = useCallback((next: (l: HomeLayout) => HomeLayout) => {
    setLayoutState((l) => {
      const value = next(l);
      saveLayout(value);
      return value;
    });
  }, []);

  const gridRef = useRef<HTMLDivElement>(null);
  // Grid cells (measured and hit-tested) and, inside each, the layer the drag
  // moves. Kept apart so the drag's transform never fights the cell's layout
  // animation, which framer-motion also drives with a transform.
  const tiles = useRef(new Map<string, HTMLDivElement>());
  const layers = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<DragState | null>(null);

  /** Put the dragged tile under the pointer, wherever its cell currently is. */
  const positionDragged = useCallback(() => {
    const d = drag.current;
    const el = d && tiles.current.get(d.id);
    const layer = d && layers.current.get(d.id);
    if (!d?.active || !el || !layer) return;
    // The cell's live rect, including any layout animation moving it, so the
    // layer cancels that motion out and stays with the pointer.
    const r = el.getBoundingClientRect();
    const dx = d.x - d.grabX - r.left;
    const dy = d.y - d.grabY - r.top;
    layer.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
  }, []);

  /** The tile whose cell is under the pointer, other than the dragged one. */
  const tileAt = useCallback((x: number, y: number, exclude: string): string | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const g = grid.getBoundingClientRect();
    for (const [id, el] of tiles.current) {
      if (id === exclude) continue;
      const r = slotRect(el, g);
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return id;
    }
    return null;
  }, []);

  // After a swap the grid reflows, and with uneven tiles a different one can
  // land under a pointer that hasn't moved. Count it as already hovered, so
  // only moving onto a tile swaps, never the reflow itself.
  useLayoutEffect(() => {
    const d = drag.current;
    if (!d?.active) return;
    d.lastTarget = tileAt(d.x, d.y, d.id);
    positionDragged();
  }, [layout.order, tileAt, positionDragged]);

  const endDrag = useCallback((commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    const layer = layers.current.get(d.id);
    if (layer && layer.style.transform) {
      // Glide from the pointer into the tile's cell rather than jumping there.
      layer.style.transition = `transform ${DROP_MS}ms ease-out`;
      layer.style.transform = "";
      setTimeout(() => {
        if (drag.current?.id !== d.id) layer.style.transition = "";
      }, DROP_MS);
    }
    document.body.classList.remove("home-dragging");
    setDraggingId(null);
    if (d.active && commit) {
      // The release would otherwise land as a click and open the widget's page.
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    }
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.active) {
        if (Math.hypot(d.x - d.startX, d.y - d.startY) < DRAG_THRESHOLD_PX) return;
        d.active = true;
        // Pressing on text started a selection; a drag shouldn't leave one.
        window.getSelection()?.removeAllRanges();
        document.body.classList.add("home-dragging");
        const layer = layers.current.get(d.id);
        if (layer) layer.style.transition = "";
        setDraggingId(d.id);
        const tick = () => {
          if (drag.current !== d) return;
          positionDragged();
          d.raf = requestAnimationFrame(tick);
        };
        d.raf = requestAnimationFrame(tick);
      }
      e.preventDefault();

      const target = tileAt(d.x, d.y, d.id);
      if (target !== d.lastTarget) {
        d.lastTarget = target;
        if (target) update((l) => ({ ...l, order: swap(l.order, d.id, target) }));
      }
      positionDragged();
    };
    const onUp = (e: PointerEvent) => {
      if (drag.current && e.pointerId === drag.current.pointerId) endDrag(true);
    };
    const onCancel = () => endDrag(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDrag(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [update, positionDragged, tileAt, endDrag]);

  const onPointerDown = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    if ((e.target as HTMLElement).closest(NO_DRAG)) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      x: e.clientX,
      y: e.clientY,
      active: false,
      lastTarget: null,
      raf: 0,
    };
  };

  const byId = new Map(widgets.map((w) => [w.id, w]));
  const visible = layout.order.filter((id) => !layout.hidden.includes(id) && byId.has(id));
  const hidden = layout.order.filter((id) => layout.hidden.includes(id) && byId.has(id));

  return (
    <div className="space-y-3">
      <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative">
        {visible.map((id, index) => {
          const widget = byId.get(id)!;
          const size = layout.sizes[id] ?? widget.defaultSize ?? 1;
          const dragging = draggingId === id;
          return (
            <m.div
              key={id}
              // Always on: switching it off for the dragged tile left framer a stale
              // snapshot, and the dropped tile animated to the wrong place over its
              // neighbour. The drag layer cancels the cell's motion instead.
              layout="position"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              ref={(el: HTMLDivElement | null) => {
                if (el) tiles.current.set(id, el);
                else tiles.current.delete(id);
              }}
              data-home-tile={id}
              onPointerDown={onPointerDown(id)}
              className={`home-tile grid relative ${SPAN_CLASS[size]} ${
                dragging ? "z-30 cursor-grabbing opacity-90 drop-shadow-2xl" : ""
              } ${editing ? "home-tile-editing" : ""}`}
            >
              <div
                ref={(el) => {
                  if (el) layers.current.set(id, el);
                  else layers.current.delete(id);
                }}
                className="grid"
              >
                {widget.render()}
              </div>

              {editing && (
                <div
                  data-no-drag
                  className="absolute top-2 right-2 z-20 flex items-center gap-0.5 p-0.5 rounded-lg bg-background/80 backdrop-blur border border-white/10 shadow-lg"
                >
                  <button
                    type="button"
                    onClick={() => update((l) => ({ ...l, order: nudge(l.order, l.hidden, id, -1) }))}
                    disabled={index === 0}
                    aria-label={`Move ${widget.label} earlier`}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => update((l) => ({ ...l, order: nudge(l.order, l.hidden, id, 1) }))}
                    disabled={index === visible.length - 1}
                    aria-label={`Move ${widget.label} later`}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-px h-4 bg-white/10 mx-0.5" />
                  {([1, 2, 3] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update((l) => setSize(l, id, s, widget.defaultSize ?? 1))}
                      aria-pressed={size === s}
                      aria-label={`${widget.label} ${s} column${s > 1 ? "s" : ""} wide`}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        size === s ? "bg-primary text-primary-foreground" : "hover:bg-white/10 text-muted-foreground"
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                  <span className="w-px h-4 bg-white/10 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => update((l) => setHidden(l, id, true))}
                    aria-label={`Hide ${widget.label}`}
                    className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </m.div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-pressed={editing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            editing ? "bg-primary text-primary-foreground" : "glass-card-hover text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          {editing ? "Done" : "Edit layout"}
        </button>
        {!editing && <span className="text-[11px] text-muted-foreground/60">Drag a widget by its box to move it.</span>}
        {editing && (
          <>
            {hidden.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => update((l) => setHidden(l, id, false))}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs glass-card-hover text-muted-foreground hover:text-foreground"
              >
                <Eye className="w-3.5 h-3.5" />
                Show {byId.get(id)!.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                clearLayout();
                setLayoutState(normalizeLayout(null, ids));
              }}
              className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset layout
            </button>
          </>
        )}
      </div>
    </div>
  );
}
