/**
 * The Pomodoro timer as a module-level store, so it keeps running when the
 * Tasks page unmounts and the desktop tray can drive it from anywhere.
 *
 * Time left is derived from a wall-clock deadline rather than decremented once
 * per interval, so a throttled background webview does not drift.
 */

export const DEFAULT_WORK = 25 * 60;
export const DEFAULT_BREAK = 5 * 60;

export type PomodoroPhase = "focus" | "break";

export interface PomodoroState {
  phase: PomodoroPhase;
  running: boolean;
  /** Whole seconds left in the current phase. */
  remaining: number;
  workDuration: number;
  breakDuration: number;
}

const INITIAL: PomodoroState = {
  phase: "focus",
  running: false,
  remaining: DEFAULT_WORK,
  workDuration: DEFAULT_WORK,
  breakDuration: DEFAULT_BREAK,
};

let state: PomodoroState = INITIAL;
let endsAt: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function set(next: PomodoroState) {
  state = next;
  listeners.forEach((l) => l());
}

function durationOf(phase: PomodoroPhase) {
  return phase === "focus" ? state.workDuration : state.breakDuration;
}

function stopTimer() {
  if (timer !== null) clearInterval(timer);
  timer = null;
  endsAt = null;
}

function secondsLeft() {
  return endsAt === null ? state.remaining : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function tick() {
  if (!state.running) return;
  const left = secondsLeft();
  if (left > 0) {
    if (left !== state.remaining) set({ ...state, remaining: left });
    return;
  }
  // Phase over: flip to the other phase and wait for the user to start it.
  stopTimer();
  const phase = state.phase === "focus" ? "break" : "focus";
  set({ ...state, running: false, phase, remaining: durationOf(phase) });
}

export const pomodoro = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  start() {
    if (state.running || state.remaining <= 0) return;
    endsAt = Date.now() + state.remaining * 1000;
    // Sub-second polling so the display never skips a second.
    timer = setInterval(tick, 250);
    set({ ...state, running: true });
  },

  pause() {
    if (!state.running) return;
    const remaining = secondsLeft();
    stopTimer();
    set({ ...state, running: false, remaining });
  },

  toggle() {
    if (state.running) pomodoro.pause();
    else pomodoro.start();
  },

  reset() {
    stopTimer();
    set({ ...state, running: false, remaining: durationOf(state.phase) });
  },

  /** Change the current phase's length. Ignored while running. */
  setDuration(seconds: number) {
    if (state.running || seconds <= 0) return;
    const key = state.phase === "focus" ? "workDuration" : "breakDuration";
    set({ ...state, [key]: seconds, remaining: seconds });
  },

  /** Test hook: back to a fresh 25-minute focus phase. */
  _reset() {
    stopTimer();
    set(INITIAL);
  },
};

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
