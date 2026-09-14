/**
 * Webview side of the Terminal tab. The shell runs in Rust
 * (src-tauri/src/terminal.rs); this module only forwards keystrokes and
 * output. Desktop only: nothing from `@tauri-apps/*` loads until a function
 * here is called.
 */

/** Mirrors `TerminalInfo` in src-tauri/src/terminal.rs. */
export interface TerminalInfo {
  id: number;
  shell: string;
  /** Recent output, replayed when the view mounts again. */
  scrollback: string;
  /** Output offset the scrollback runs up to. */
  scrollbackEnd: number;
  exited: boolean;
}

export type TerminalEvent =
  | { type: "output"; id: number; data: string; end: number }
  | { type: "exit"; id: number; code: number | null };

export const TERMINAL_OUTPUT_EVENT = "terminal://output";
export const TERMINAL_EXIT_EVENT = "terminal://exit";

let tauriCore: Promise<typeof import("@tauri-apps/api/core")> | undefined;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  tauriCore ??= import("@tauri-apps/api/core");
  const core = await tauriCore;
  try {
    return await core.invoke<T>(cmd, args);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Returns the running shell, starting one if there is none. */
export function attachTerminal(cols: number, rows: number) {
  return invoke<TerminalInfo>("terminal_attach", { cols, rows });
}

/** Starts a new shell with PATH read again from the registry. */
export function restartTerminal(cols: number, rows: number) {
  return invoke<TerminalInfo>("terminal_restart", { cols, rows });
}

export function writeTerminal(data: string) {
  return invoke<void>("terminal_write", { data });
}

export function resizeTerminal(cols: number, rows: number) {
  return invoke<void>("terminal_resize", { cols, rows });
}

/** Subscribes to output and exit events from every session. */
export function onTerminalEvent(cb: (event: TerminalEvent) => void): () => void {
  let cancelled = false;
  const unlisteners: (() => void)[] = [];
  import("@tauri-apps/api/event").then(({ listen }) =>
    Promise.all([
      listen<{ id: number; data: string; end: number }>(TERMINAL_OUTPUT_EVENT, ({ payload }) =>
        cb({ type: "output", ...payload }),
      ),
      listen<{ id: number; code: number | null }>(TERMINAL_EXIT_EVENT, ({ payload }) => cb({ type: "exit", ...payload })),
    ]).then((fns) => {
      if (cancelled) fns.forEach((fn) => fn());
      else unlisteners.push(...fns);
    }),
  );
  return () => {
    cancelled = true;
    unlisteners.forEach((fn) => fn());
  };
}

/** Upper bound on events held while a session is being attached. */
const MAX_PENDING = 2000;

/**
 * Orders events for one view. Events can arrive before `attach` resolves (the
 * shell prints its banner right away) or repeat output already in the
 * replayed scrollback, so events for a session not attached yet are held, and
 * output at or before the scrollback's offset is skipped. Events from older
 * sessions (replaced by Refresh) are dropped.
 */
export class TerminalStream {
  private id: number | null = null;
  private end = 0;
  private exited = false;
  private pending: TerminalEvent[] = [];

  constructor(private sink: { write(data: string): void; exit(code: number | null): void }) {}

  /** Shows session `info`: replays its scrollback, then any held events. */
  attach(info: TerminalInfo) {
    this.id = info.id;
    this.end = info.scrollbackEnd;
    this.exited = false;
    if (info.scrollback) this.sink.write(info.scrollback);
    const held = this.pending;
    this.pending = [];
    held.forEach((event) => this.push(event));
    if (info.exited) this.showExit(null);
  }

  /** Stops showing the current session, e.g. while Refresh starts a new one. */
  detach() {
    this.id = null;
  }

  push(event: TerminalEvent) {
    if (this.id === null || event.id > this.id) {
      this.pending.push(event);
      if (this.pending.length > MAX_PENDING) this.pending.shift();
      return;
    }
    if (event.id < this.id) return;
    if (event.type === "exit") {
      this.showExit(event.code);
    } else if (event.end > this.end) {
      this.end = event.end;
      this.sink.write(event.data);
    }
  }

  private showExit(code: number | null) {
    if (this.exited) return;
    this.exited = true;
    this.sink.exit(code);
  }
}
