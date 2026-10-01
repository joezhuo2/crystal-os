import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Minimize2, Plus, RotateCw, SquareTerminal, X } from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isDesktop } from "@/lib/platform";
import {
  MAX_TERMINALS,
  TerminalHub,
  TerminalStream,
  attachTerminal,
  closeTerminal,
  listTerminals,
  onTerminalEvent,
  openTerminal,
  resizeTerminal,
  restartTerminal,
  writeTerminal,
} from "@/lib/terminalNative";
import {
  type DropZone,
  EMPTY_LAYOUT,
  type Layout,
  type LayoutNode,
  type Rect,
  dropOnPane,
  effectiveZone,
  mapPanes,
  measure,
  paneKeys,
  removePane,
  selectPane,
  setRatio,
  zoneAt,
  zoneRect,
} from "@/lib/terminalLayout";

const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/** Size a shell starts at before its view has measured itself. */
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/** Windows Terminal's defaults: Cascadia Mono at 12pt (16px). */
const FONT_FAMILY = '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace';
const FONT_SIZE = 16;

/**
 * Cascadia Mono is bundled as a webfont (src/main.tsx), so it is not
 * guaranteed to be ready the moment a pane mounts. xterm measures the
 * character cell once, inside `open()`, and keeps those metrics for the life
 * of the terminal: opening early measures the fallback face and the whole grid
 * stays in it. Under `dev:desktop` the font is already warm by the time anyone
 * reaches the tab, which is why only packaged builds showed the wrong
 * typeface. Awaiting the face removes the race in both.
 *
 * Shared across panes, and never rejects — a font that will not load should
 * leave the terminal usable in the fallback rather than blank.
 */
let fontReady: Promise<unknown> | null = null;
function loadTerminalFont(): Promise<unknown> {
  if (!fontReady) {
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    fontReady = fonts
      ? Promise.all([fonts.load(`${FONT_SIZE}px ${FONT_FAMILY}`), fonts.load(`bold ${FONT_SIZE}px ${FONT_FAMILY}`)]).catch(() => undefined)
      : Promise.resolve(undefined);
  }
  return fontReady;
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The panes on screen when the tab was last left, by session id (tab keys are
 * made fresh each visit), so a split survives visits to other tabs.
 */
let lastLayout: { root: LayoutNode | null; focused: string | null } = { root: null, focused: null };

interface Tab {
  /** Stable across Refresh, which gives the session a new id. */
  key: string;
  id: number;
  shell: string;
  exited: boolean;
}

interface PaneHandle {
  refresh(): Promise<void>;
  size(): { cols: number; rows: number };
}

type TabShortcut = "new" | "close" | "next" | "previous";

interface PaneProps {
  tab: Tab;
  /** Takes keyboard input. Panes off screen are hidden by the page. */
  focused: boolean;
  hub: TerminalHub;
  onChange(key: string, patch: Partial<Tab>): void;
  onShortcut(shortcut: TabShortcut): void;
  register(key: string, handle: PaneHandle | null): void;
}

let nextKey = 0;
const tabFor = (id: number, shell: string, exited: boolean): Tab => ({ key: `t${++nextKey}`, id, shell, exited });

function TerminalPane({ tab, focused, hub, onChange, onShortcut, register }: PaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const streamRef = useRef<TerminalStream | null>(null);
  // Read once on mount; Refresh changes the id afterwards through the stream.
  const initialId = useRef(tab.id);
  const activeRef = useRef(focused);
  const callbacks = useRef({ onChange, onShortcut });
  callbacks.current = { onChange, onShortcut };

  useEffect(() => {
    activeRef.current = focused;
    if (focused) termRef.current?.focus();
  }, [focused]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const key = tab.key;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const sessionId = () => streamRef.current?.sessionId ?? initialId.current;

    (async () => {
      // Loaded here so the web bundle and other views never pull in xterm.
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/xterm/css/xterm.css"),
      ]);
      if (disposed) return;

      await loadTerminalFont();
      if (disposed) return;

      const term = new Terminal({
        allowTransparency: true,
        cursorBlink: true,
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        fontWeight: "normal",
        scrollback: 5000,
        theme: {
          background: "#00000000",
          foreground: "#e5e5e5",
          cursor: "#fafafa",
          selectionBackground: "#ffffff40",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
      termRef.current = term;
      cleanups.push(() => term.dispose());

      // Ctrl+C copies when text is selected (otherwise it interrupts the
      // command), Ctrl+V pastes through the browser instead of sending ^V, and
      // Ctrl+Shift+T / Ctrl+Shift+W / Ctrl+(Shift+)Tab manage tabs.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown" || !e.ctrlKey || e.altKey) return true;
        if (e.code === "Tab") {
          e.preventDefault();
          callbacks.current.onShortcut(e.shiftKey ? "previous" : "next");
          return false;
        }
        if (e.shiftKey && (e.code === "KeyT" || e.code === "KeyW")) {
          e.preventDefault();
          callbacks.current.onShortcut(e.code === "KeyT" ? "new" : "close");
          return false;
        }
        if (e.code === "KeyC" && (e.shiftKey || term.hasSelection())) {
          navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
          term.clearSelection();
          return false;
        }
        return e.code !== "KeyV";
      });

      const stream = new TerminalStream({
        write: (data) => term.write(data),
        exit: (code) => {
          callbacks.current.onChange(key, { exited: true });
          const detail = code === null ? "" : ` with code ${code}`;
          term.write(`\r\n${DIM}[shell exited${detail}. Press Refresh to start a new one.]${RESET}\r\n`);
        },
      });
      streamRef.current = stream;
      cleanups.push(() => hub.release(stream));

      const input = term.onData((data) => void writeTerminal(sessionId(), data).catch(() => {}));
      const resize = term.onResize(({ cols, rows }) => void resizeTerminal(sessionId(), cols, rows).catch(() => {}));
      cleanups.push(() => input.dispose(), () => resize.dispose());

      // Hidden panes measure 0×0; they fit again when shown.
      const observer = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
      });
      observer.observe(container);
      cleanups.push(() => observer.disconnect());

      register(key, {
        size: () => ({ cols: term.cols, rows: term.rows }),
        refresh: async () => {
          const oldId = sessionId();
          hub.forget(oldId);
          term.reset();
          term.write(`${DIM}Restarting with a fresh PATH…${RESET}\r\n`);
          try {
            const info = await restartTerminal(oldId, term.cols, term.rows);
            if (disposed) return;
            hub.attach(stream, info);
            callbacks.current.onChange(key, { id: info.id, shell: info.shell, exited: info.exited });
          } catch (err) {
            if (!disposed) term.write(`${RED}Could not start the shell: ${errorText(err)}${RESET}\r\n`);
          } finally {
            if (!disposed && activeRef.current) term.focus();
          }
        },
      });
      cleanups.push(() => register(key, null));

      try {
        const info = await attachTerminal(initialId.current, term.cols, term.rows);
        if (disposed) return;
        hub.attach(stream, info);
        callbacks.current.onChange(key, { shell: info.shell, exited: info.exited });
        if (activeRef.current) term.focus();
      } catch (err) {
        if (!disposed) term.write(`${RED}Could not attach to the shell: ${errorText(err)}${RESET}\r\n`);
      }
    })();

    return () => {
      disposed = true;
      cleanups.reverse().forEach((fn) => fn());
      termRef.current = null;
      streamRef.current = null;
    };
  }, [hub, register, tab.key]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Where a dragged tab would land, shown as an outline over the panes. */
interface DragState {
  key: string;
  label: string;
  x: number;
  y: number;
  target: { key: string; zone: DropZone } | null;
}

/** Percent offsets for an absolutely placed box inside the pane area. */
function rectStyle(rect: Rect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
}

/** Pointer travel before a press on a tab counts as a drag, not a click. */
const DRAG_THRESHOLD = 5;

export default function TerminalPage() {
  const desktop = isDesktop();
  const [hub] = useState(() => new TerminalHub());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panes = useRef(new Map<string, PaneHandle>());
  const paneEls = useRef(new Map<string, HTMLDivElement>());
  const areaRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // Set for the click that follows a drag's pointerup, so a drop is not also a selection.
  const suppressClick = useRef(false);
  const cancelDrag = useRef<(() => void) | null>(null);

  const activeKey = layout.focused;
  const activeTab = tabs.find((t) => t.key === activeKey) ?? null;
  const { panes: paneRects, dividers } = useMemo(() => measure(layout.root), [layout.root]);

  useEffect(() => {
    if (!layout.root) return;
    const idOf = new Map(tabs.map((t) => [t.key, String(t.id)]));
    lastLayout = {
      root: mapPanes(layout.root, (key) => idOf.get(key) ?? null),
      focused: (layout.focused && idOf.get(layout.focused)) || null,
    };
  }, [layout, tabs]);

  useEffect(() => () => cancelDrag.current?.(), []);

  const register = useCallback((key: string, handle: PaneHandle | null) => {
    if (handle) panes.current.set(key, handle);
    else panes.current.delete(key);
  }, []);

  const updateTab = useCallback((key: string, patch: Partial<Tab>) => {
    setTabs((current) => current.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }, []);

  const select = useCallback((key: string) => setLayout((current) => selectPane(current, key)), []);

  const focusPane = useCallback((key: string) => {
    setLayout((current) => (current.focused === key ? current : { ...current, focused: key }));
  }, []);

  // Subscribed before listing, so a new shell's first output is held for its pane.
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const unlisten = onTerminalEvent((event) => hub.push(event));

    (async () => {
      try {
        let sessions = await listTerminals();
        if (sessions.length === 0) {
          const info = await openTerminal(DEFAULT_COLS, DEFAULT_ROWS);
          sessions = [{ id: info.id, shell: info.shell, exited: info.exited }];
        }
        if (disposed) return;
        const next = sessions.map((s) => tabFor(s.id, s.shell, s.exited));
        setTabs(next);
        // Bring back the last split, minus any shells that have since closed.
        const keyOf = new Map(next.map((t) => [String(t.id), t.key]));
        const root = mapPanes(lastLayout.root, (id) => keyOf.get(id) ?? null);
        const keys = paneKeys(root);
        const focused = lastLayout.focused ? keyOf.get(lastLayout.focused) : undefined;
        setLayout(
          root
            ? { root, focused: focused && keys.includes(focused) ? focused : keys[0] }
            : selectPane(EMPTY_LAYOUT, next[0].key),
        );
      } catch (err) {
        if (!disposed) setError(`Could not start the shell: ${errorText(err)}`);
      }
    })();

    return () => {
      disposed = true;
      unlisten();
    };
  }, [desktop, hub]);

  const newTab = useCallback(async () => {
    if (busy || tabsRef.current.length >= MAX_TERMINALS) return;
    setBusy(true);
    setError(null);
    const size = (activeKey && panes.current.get(activeKey)?.size()) || { cols: DEFAULT_COLS, rows: DEFAULT_ROWS };
    try {
      const info = await openTerminal(size.cols, size.rows);
      const tab = tabFor(info.id, info.shell, info.exited);
      setTabs((current) => [...current, tab]);
      select(tab.key);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [activeKey, busy, select]);

  const closeTab = useCallback(
    (key: string) => {
      const current = tabsRef.current;
      const index = current.findIndex((t) => t.key === key);
      // The last shell stays open; use Refresh to replace it.
      if (index === -1 || current.length <= 1) return;
      const tab = current[index];
      hub.forget(tab.id);
      void closeTerminal(tab.id).catch(() => {});
      const remaining = current.filter((t) => t.key !== key);
      setTabs(remaining);
      setLayout((layout) => removePane(layout, key, remaining[Math.min(index, remaining.length - 1)].key));
    },
    [hub],
  );

  const cycle = useCallback(
    (step: number) => {
      const current = tabsRef.current;
      const index = current.findIndex((t) => t.key === activeKey);
      if (index === -1 || current.length < 2) return;
      select(current[(index + step + current.length) % current.length].key);
    },
    [activeKey, select],
  );

  const onShortcut = useCallback(
    (shortcut: TabShortcut) => {
      if (shortcut === "new") void newTab();
      else if (shortcut === "close" && activeKey) closeTab(activeKey);
      else if (shortcut === "next") cycle(1);
      else if (shortcut === "previous") cycle(-1);
    },
    [activeKey, closeTab, cycle, newTab],
  );

  const refresh = useCallback(async () => {
    const pane = activeKey ? panes.current.get(activeKey) : undefined;
    if (!pane) return;
    setRefreshing(true);
    try {
      await pane.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [activeKey]);

  /**
   * Drags a tab (or a pane's title bar) over the panes: the pane under the
   * pointer shows an outline of where the shell would go — the half nearest
   * the pointer to split it, or the whole pane to take its place.
   */
  const startDrag = useCallback((e: ReactPointerEvent, key: string, label: string) => {
    if (e.button !== 0) return;
    cancelDrag.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let target: DragState["target"] = null;

    const hit = (x: number, y: number): DragState["target"] => {
      const current = layoutRef.current;
      for (const paneKey of paneKeys(current.root)) {
        const r = paneEls.current.get(paneKey)?.getBoundingClientRect();
        if (!r || r.width === 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const zone = effectiveZone(current, key, paneKey, zoneAt((x - r.left) / r.width, (y - r.top) / r.height));
        return zone ? { key: paneKey, zone } : null;
      }
      return null;
    };

    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        document.body.classList.add("terminal-dragging");
      }
      target = hit(ev.clientX, ev.clientY);
      setDrag({ key, label, x: ev.clientX, y: ev.clientY, target });
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape, true);
      cancelDrag.current = null;
      if (!dragging) return;
      document.body.classList.remove("terminal-dragging");
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      setDrag(null);
      const drop = target;
      if (commit && drop) setLayout((current) => dropOnPane(current, key, drop.key, drop.zone));
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const escape = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !dragging) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape, true);
    cancelDrag.current = cancel;
  }, []);

  /** Moves the divider of the split at `path`, measured against that split's area. */
  const resizeSplit = useCallback((e: ReactPointerEvent<HTMLDivElement>, path: string, dir: "row" | "col", rect: Rect) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const area = areaRef.current?.getBoundingClientRect();
    if (!area) return;
    const ratio =
      dir === "row"
        ? (e.clientX - (area.left + rect.x * area.width)) / (rect.w * area.width)
        : (e.clientY - (area.top + rect.y * area.height)) / (rect.h * area.height);
    setLayout((current) => ({ ...current, root: setRatio(current.root, path, ratio) }));
  }, []);

  if (!desktop) {
    return (
      <div className="max-w-3xl space-y-4">
        <header className="flex items-center gap-3 px-1">
          <SquareTerminal className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Terminal</h2>
            <p className="text-sm text-muted-foreground">The terminal is only available in the desktop app.</p>
          </div>
        </header>
      </div>
    );
  }

  const full = tabs.length >= MAX_TERMINALS;
  const split = paneRects.size > 1;
  const preview = drag?.target ? paneRects.get(drag.target.key) : undefined;

  // The search bar is hidden on this tab (see Index), so the page takes its space.
  return (
    <div className="flex flex-col gap-4 min-h-[20rem] h-[calc(100vh-7rem)] md:h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-3 px-1">
        <SquareTerminal className="w-6 h-6 text-neutral-100" />
        <div className="min-w-0 flex-1 terminal-font">
          <h2 className="text-2xl font-bold uppercase tracking-[0.12em]">
            <span className="terminal-glitch-text" data-text="Terminal">Terminal</span>
          </h2>
          <p className="text-xs uppercase tracking-[0.14em] text-neutral-400 truncate">
            <span className="text-neutral-600" aria-hidden="true">&gt;_ </span>
            {error ?? activeTab?.shell ?? "Starting…"}
            {!error && activeTab?.exited && " · exited"}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="terminal-btn" onClick={refresh} disabled={refreshing || !activeTab}>
              <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </TooltipTrigger>
          <TooltipContent>Restart this shell with an updated PATH, so newly installed programs are found</TooltipContent>
        </Tooltip>
      </header>

      <div className="flex items-center gap-1.5 mx-2 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Terminals">
        {tabs.map((tab, index) => {
          const selected = tab.key === activeKey;
          return (
            <div
              key={tab.key}
              className="terminal-tab"
              data-active={selected || undefined}
              data-visible={(split && !selected && paneRects.has(tab.key)) || undefined}
              data-exited={tab.exited || undefined}
              data-dragging={drag?.key === tab.key || undefined}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className="terminal-tab-label"
                title="Drag onto a terminal to split the view"
                onPointerDown={(e) => startDrag(e, tab.key, `${index + 1} ${tab.shell}`)}
                onClick={() => {
                  if (!suppressClick.current) select(tab.key);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) closeTab(tab.key);
                }}
              >
                <span className="text-neutral-500">{index + 1}</span>
                <span className="truncate">{tab.shell}</span>
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="terminal-tab-close"
                  aria-label={`Close terminal ${index + 1}`}
                  onClick={() => closeTab(tab.key)}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="terminal-btn h-8 px-2.5"
              onClick={newTab}
              disabled={busy || full || tabs.length === 0}
              aria-label="New terminal"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {full ? `${MAX_TERMINALS} terminals is the limit` : "New terminal (Ctrl+Shift+T)"}
          </TooltipContent>
        </Tooltip>
        <span className="ml-auto pl-2 shrink-0 text-[10px] uppercase tracking-[0.18em] text-neutral-500 terminal-font">
          {tabs.length}/{MAX_TERMINALS}
        </span>
      </div>

      <div className="terminal-glitch-frame flex-1 min-h-0 mx-2 mb-2 p-3">
        <div ref={areaRef} className="relative h-full w-full">
          {tabs.map((tab, index) => {
            const rect = paneRects.get(tab.key);
            const focused = tab.key === activeKey;
            return (
              <div
                key={tab.key}
                ref={(el) => {
                  if (el) paneEls.current.set(tab.key, el);
                  else paneEls.current.delete(tab.key);
                }}
                // `hidden` alone loses to `flex`, and an off-screen pane must measure 0×0 so it keeps its size.
                className={rect ? "absolute flex flex-col" : "hidden"}
                style={rect ? { ...rectStyle(rect), padding: split ? 4 : 0 } : undefined}
                hidden={!rect}
                onPointerDownCapture={() => focusPane(tab.key)}
                onFocus={() => focusPane(tab.key)}
              >
                {split && (
                  <div
                    className="terminal-pane-header"
                    data-focused={focused || undefined}
                    onPointerDown={(e) => startDrag(e, tab.key, `${index + 1} ${tab.shell}`)}
                  >
                    <span className="text-neutral-500">{index + 1}</span>
                    <span className="truncate flex-1">{tab.shell}</span>
                    <button
                      type="button"
                      className="terminal-tab-close m-0"
                      aria-label={`Remove terminal ${index + 1} from the split`}
                      title="Close pane (the shell keeps running in its tab)"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setLayout((current) => removePane(current, tab.key))}
                    >
                      <Minimize2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className={`flex-1 min-h-0 ${split ? "terminal-pane" : ""}`} data-focused={(split && focused) || undefined}>
                  <TerminalPane
                    tab={tab}
                    focused={focused}
                    hub={hub}
                    onChange={updateTab}
                    onShortcut={onShortcut}
                    register={register}
                  />
                </div>
              </div>
            );
          })}

          {dividers.map(({ path, dir, rect, ratio }) => (
            <div
              key={`d${path}`}
              role="separator"
              aria-orientation={dir === "row" ? "vertical" : "horizontal"}
              aria-valuenow={Math.round(ratio * 100)}
              className="terminal-divider"
              data-dir={dir}
              style={
                dir === "row"
                  ? { left: `${(rect.x + rect.w * ratio) * 100}%`, top: `${rect.y * 100}%`, height: `${rect.h * 100}%` }
                  : { top: `${(rect.y + rect.h * ratio) * 100}%`, left: `${rect.x * 100}%`, width: `${rect.w * 100}%` }
              }
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => resizeSplit(e, path, dir, rect)}
              onDoubleClick={() => setLayout((current) => ({ ...current, root: setRatio(current.root, path, 0.5) }))}
            />
          ))}

          {preview && drag?.target && (
            <div className="terminal-drop-preview" style={rectStyle(zoneRect(preview, drag.target.zone))} aria-hidden="true" />
          )}
        </div>
      </div>

      {drag && (
        <div className="terminal-tab terminal-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden="true">
          <span className="terminal-tab-label">{drag.label}</span>
        </div>
      )}
    </div>
  );
}
