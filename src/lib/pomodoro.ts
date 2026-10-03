/**
 * The Pomodoro timer as a module-level store, so it keeps running when the
 * Tasks page unmounts and the desktop tray can drive it from anywhere.
 *
 * Time left is derived from a wall-clock deadline rather than decremented once
 * per interval, so a throttled background webview does not drift.
 */

import { appActivity } from "@/lib/appActivity";

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

/** A finished stretch of focus, for The Orbit's focus totals. */
export interface FocusSession {
  startedAt: Date;
  endedAt: Date;
  seconds: number;
}

/** Focus shorter than this is not logged when a run is reset or resized. */
export const MIN_LOGGED_FOCUS = 60;

let state: PomodoroState = INITIAL;
let endsAt: number | null = null;
/** When the current focus phase was first started; null until it is. */
let focusStartedAt: number | null = null;
let recorder: ((session: FocusSession) => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

// Sub-second polling while visible so the display never skips a second. While
// hidden only the tray title shows the time, so once a second is enough.
const tickInterval = () => (appActivity.getState().visible ? 250 : 1000);

function startTicking() {
  if (timer !== null) clearInterval(timer);
  timer = setInterval(tick, tickInterval());
}

appActivity.subscribe(() => {
  if (timer !== null) startTicking();
});

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

/**
 * Hands the focus done so far in this phase to the recorder, if there is
 * enough of it. `whole` logs a finished phase whatever its length.
 */
function logFocus(remaining: number, whole = false) {
  if (state.phase !== "focus" || focusStartedAt === null) return;
  const seconds = state.workDuration - remaining;
  const startedAt = focusStartedAt;
  focusStartedAt = null;
  if (seconds <= 0 || (!whole && seconds < MIN_LOGGED_FOCUS)) return;
  try {
    recorder?.({ startedAt: new Date(startedAt), endedAt: new Date(), seconds });
  } catch {
    // A failing recorder must not stop the timer.
  }
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
  logFocus(0, true);
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
    if (state.phase === "focus" && focusStartedAt === null) focusStartedAt = Date.now();
    startTicking();
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
    const remaining = secondsLeft();
    stopTimer();
    logFocus(remaining);
    set({ ...state, running: false, remaining: durationOf(state.phase) });
  },

  /** Change the current phase's length. Ignored while running. */
  setDuration(seconds: number) {
    if (state.running || seconds <= 0) return;
    const key = state.phase === "focus" ? "workDuration" : "breakDuration";
    logFocus(state.remaining);
    set({ ...state, [key]: seconds, remaining: seconds });
  },

  /** Where finished focus goes (AppContext saves it to Supabase). Null to stop. */
  setRecorder(next: ((session: FocusSession) => void) | null) {
    recorder = next;
  },

  /** Test hook: back to a fresh 25-minute focus phase. */
  _reset() {
    stopTimer();
    focusStartedAt = null;
    set(INITIAL);
  },
};

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
