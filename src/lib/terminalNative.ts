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

/** Shells that can run at once. Mirrors `MAX_SESSIONS` in terminal.rs. */
export const MAX_TERMINALS = 5;

/** Mirrors `TerminalSummary` in src-tauri/src/terminal.rs. */
export interface TerminalSummary {
  id: number;
  shell: string;
  exited: boolean;
}

/** The running shells in tab order. */
export function listTerminals() {
  return invoke<TerminalSummary[]>("terminal_list");
}

/** Starts a new shell. Fails when `MAX_TERMINALS` are already running. */
export function openTerminal(cols: number, rows: number) {
  return invoke<TerminalInfo>("terminal_open", { cols, rows });
}

/** Resizes shell `id` to the view and returns it with its scrollback. */
export function attachTerminal(id: number, cols: number, rows: number) {
  return invoke<TerminalInfo>("terminal_attach", { id, cols, rows });
}

/** Replaces shell `id` with a new one (new id) with PATH read again from the registry. */
export function restartTerminal(id: number, cols: number, rows: number) {
  return invoke<TerminalInfo>("terminal_restart", { id, cols, rows });
}

export function closeTerminal(id: number) {
  return invoke<void>("terminal_close", { id });
}

export function writeTerminal(id: number, data: string) {
  return invoke<void>("terminal_write", { id, data });
}

export function resizeTerminal(id: number, cols: number, rows: number) {
  return invoke<void>("terminal_resize", { id, cols, rows });
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

/** Upper bound on events held for sessions no view has attached yet. */
const MAX_PENDING = 2000;

interface TerminalSink {
  write(data: string): void;
  exit(code: number | null): void;
}

/**
 * Orders events for one session's view. Output at or before the replayed
 * scrollback's offset is skipped, and an exit is reported once.
 */
export class TerminalStream {
  private id: number | null = null;
  private end = 0;
  private exited = false;

  constructor(private sink: TerminalSink) {}

  get sessionId() {
    return this.id;
  }

  /** Shows session `info`: replays its scrollback, then `held` events for it. */
  attach(info: TerminalInfo, held: TerminalEvent[] = []) {
    this.id = info.id;
    this.end = info.scrollbackEnd;
    this.exited = false;
    if (info.scrollback) this.sink.write(info.scrollback);
    held.forEach((event) => this.push(event));
    if (info.exited) this.showExit(null);
  }

  push(event: TerminalEvent) {
    if (event.id !== this.id) return;
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

/**
 * Routes events from every session to the stream showing it. Events can arrive
 * before the view attaches (a new shell prints its banner right away), so
 * events for a session no stream shows yet are held until one attaches.
 * Events from closed or replaced sessions are dropped.
 */
export class TerminalHub {
  private streams = new Map<number, TerminalStream>();
  private pending: TerminalEvent[] = [];
  private gone = new Set<number>();

  push(event: TerminalEvent) {
    if (this.gone.has(event.id)) return;
    const stream = this.streams.get(event.id);
    if (stream) {
      stream.push(event);
      return;
    }
    this.pending.push(event);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  /** Shows session `info` in `stream`, forgetting the session it showed before. */
  attach(stream: TerminalStream, info: TerminalInfo) {
    const previous = stream.sessionId;
    if (previous !== null && previous !== info.id) this.forget(previous);
    this.streams.set(info.id, stream);
    const held = this.pending.filter((event) => event.id === info.id);
    this.pending = this.pending.filter((event) => event.id !== info.id);
    stream.attach(info, held);
  }

  /** Stops routing a session that was closed or replaced by Refresh. */
  forget(id: number) {
    this.gone.add(id);
    this.streams.delete(id);
    this.pending = this.pending.filter((event) => event.id !== id);
  }

  /** Stops routing to `stream` without closing its session (the view unmounted). */
  release(stream: TerminalStream) {
    const id = stream.sessionId;
    if (id !== null && this.streams.get(id) === stream) this.streams.delete(id);
  }
}
