import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, SquareTerminal } from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isDesktop } from "@/lib/platform";
import {
  TerminalStream,
  attachTerminal,
  onTerminalEvent,
  resizeTerminal,
  restartTerminal,
  writeTerminal,
} from "@/lib/terminalNative";

const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export default function TerminalPage() {
  const desktop = isDesktop();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const streamRef = useRef<TerminalStream | null>(null);
  const [shell, setShell] = useState<string | null>(null);
  const [exited, setExited] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!desktop || !containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;
    const cleanups: (() => void)[] = [];

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
      fit.fit();
      termRef.current = term;
      cleanups.push(() => term.dispose());

      // Ctrl+C copies when text is selected (otherwise it interrupts the
      // command), and Ctrl+V pastes through the browser instead of sending ^V.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown" || !e.ctrlKey || e.altKey) return true;
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
          setExited(true);
          const detail = code === null ? "" : ` with code ${code}`;
          term.write(`\r\n${DIM}[shell exited${detail}. Press Refresh to start a new one.]${RESET}\r\n`);
        },
      });
      streamRef.current = stream;
      cleanups.push(onTerminalEvent((event) => stream.push(event)));

      const input = term.onData((data) => void writeTerminal(data).catch(() => {}));
      const resize = term.onResize(({ cols, rows }) => void resizeTerminal(cols, rows).catch(() => {}));
      cleanups.push(() => input.dispose(), () => resize.dispose());

      const observer = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
      });
      observer.observe(container);
      cleanups.push(() => observer.disconnect());

      try {
        const info = await attachTerminal(term.cols, term.rows);
        if (disposed) return;
        setShell(info.shell);
        setExited(info.exited);
        stream.attach(info);
        term.focus();
      } catch (err) {
        if (!disposed) term.write(`${RED}Could not start the shell: ${errorText(err)}${RESET}\r\n`);
      }
    })();

    return () => {
      disposed = true;
      cleanups.reverse().forEach((fn) => fn());
      termRef.current = null;
      streamRef.current = null;
    };
  }, [desktop]);

  const refresh = useCallback(async () => {
    const term = termRef.current;
    const stream = streamRef.current;
    if (!term || !stream) return;
    setRefreshing(true);
    stream.detach();
    term.reset();
    term.write(`${DIM}Restarting with a fresh PATH…${RESET}\r\n`);
    try {
      const info = await restartTerminal(term.cols, term.rows);
      if (streamRef.current !== stream) return;
      setShell(info.shell);
      setExited(false);
      stream.attach(info);
    } catch (err) {
      if (streamRef.current === stream) term.write(`${RED}Could not start the shell: ${errorText(err)}${RESET}\r\n`);
    } finally {
      setRefreshing(false);
      if (streamRef.current === stream) term.focus();
    }
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

  // The search bar is hidden on this tab (see Index), so the page takes its space.
  return (
    <div className="flex flex-col gap-5 min-h-[20rem] h-[calc(100vh-7.5rem)] md:h-[calc(100vh-4.5rem)]">
      <header className="flex items-center gap-3 px-1">
        <SquareTerminal className="w-6 h-6 text-neutral-100" />
        <div className="min-w-0 flex-1 terminal-font">
          <h2 className="text-2xl font-bold uppercase tracking-[0.12em]">
            <span className="terminal-glitch-text" data-text="Terminal">Terminal</span>
          </h2>
          <p className="text-xs uppercase tracking-[0.14em] text-neutral-400 truncate">
            <span className="text-neutral-600" aria-hidden="true">&gt;_ </span>
            {shell ?? "Starting…"}
            {exited && " · exited"}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="terminal-btn" onClick={refresh} disabled={refreshing}>
              <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </TooltipTrigger>
          <TooltipContent>Restart the shell with an updated PATH, so newly installed programs are found</TooltipContent>
        </Tooltip>
      </header>
      <div className="terminal-glitch-frame flex-1 min-h-0 mx-2 mb-2 p-3">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
