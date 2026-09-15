import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RotateCw, SquareTerminal, X } from "lucide-react";
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

const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/** Size a shell starts at before its view has measured itself. */
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** The session shown last, kept across visits to other tabs. */
let lastActiveId: number | null = null;

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
  active: boolean;
  hub: TerminalHub;
  onChange(key: string, patch: Partial<Tab>): void;
  onShortcut(shortcut: TabShortcut): void;
  register(key: string, handle: PaneHandle | null): void;
}

let nextKey = 0;
const tabFor = (id: number, shell: string, exited: boolean): Tab => ({ key: `t${++nextKey}`, id, shell, exited });

function TerminalPane({ tab, active, hub, onChange, onShortcut, register }: PaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const streamRef = useRef<TerminalStream | null>(null);
  // Read once on mount; Refresh changes the id afterwards through the stream.
  const initialId = useRef(tab.id);
  const activeRef = useRef(active);
  const callbacks = useRef({ onChange, onShortcut });
  callbacks.current = { onChange, onShortcut };

  useEffect(() => {
    activeRef.current = active;
    if (active) termRef.current?.focus();
  }, [active]);

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

      const term = new Terminal({
        allowTransparency: true,
        cursorBlink: true,
        fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace',
        fontSize: 13,
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

  return <div ref={containerRef} className="h-full w-full" hidden={!active} />;
}

export default function TerminalPage() {
  const desktop = isDesktop();
  const [hub] = useState(() => new TerminalHub());
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panes = useRef(new Map<string, PaneHandle>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const activeTab = tabs.find((t) => t.key === activeKey) ?? null;

  useEffect(() => {
    if (activeTab) lastActiveId = activeTab.id;
  }, [activeTab]);

  const register = useCallback((key: string, handle: PaneHandle | null) => {
    if (handle) panes.current.set(key, handle);
    else panes.current.delete(key);
  }, []);

  const updateTab = useCallback((key: string, patch: Partial<Tab>) => {
    setTabs((current) => current.map((t) => (t.key === key ? { ...t, ...patch } : t)));
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
        setActiveKey((next.find((t) => t.id === lastActiveId) ?? next[0]).key);
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
      setActiveKey(tab.key);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [activeKey, busy]);

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
      if (key === activeKey) setActiveKey(remaining[Math.min(index, remaining.length - 1)].key);
    },
    [activeKey, hub],
  );

  const cycle = useCallback(
    (step: number) => {
      const current = tabsRef.current;
      const index = current.findIndex((t) => t.key === activeKey);
      if (index === -1 || current.length < 2) return;
      setActiveKey(current[(index + step + current.length) % current.length].key);
    },
    [activeKey],
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

  // The search bar is hidden on this tab (see Index), so the page takes its space.
  return (
    <div className="flex flex-col gap-4 min-h-[20rem] h-[calc(100vh-7.5rem)] md:h-[calc(100vh-4.5rem)]">
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
            <div key={tab.key} className="terminal-tab" data-active={selected || undefined} data-exited={tab.exited || undefined}>
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className="terminal-tab-label"
                onClick={() => setActiveKey(tab.key)}
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
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.key}
            tab={tab}
            active={tab.key === activeKey}
            hub={hub}
            onChange={updateTab}
            onShortcut={onShortcut}
            register={register}
          />
        ))}
      </div>
    </div>
  );
}
