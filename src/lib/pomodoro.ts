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

/** The task a focus run counts toward. The title is kept for the history row. */
export interface FocusTask {
  id: string;
  title: string;
}

export interface PomodoroState {
  phase: PomodoroPhase;
  running: boolean;
  /** Whole seconds left in the current phase. */
  remaining: number;
  workDuration: number;
  breakDuration: number;
  /** The task focus is linked to, or null for unlinked focus. Kept across phases. */
  task: FocusTask | null;
}

const INITIAL: PomodoroState = {
  phase: "focus",
  running: false,
  remaining: DEFAULT_WORK,
  workDuration: DEFAULT_WORK,
  breakDuration: DEFAULT_BREAK,
  task: null,
};

/** A finished stretch of focus, for The Orbit's focus totals. */
export interface FocusSession {
  startedAt: Date;
  endedAt: Date;
  seconds: number;
  taskId: string | null;
  taskTitle: string | null;
}

/** Focus shorter than this is not logged when a run is reset or resized. */
export const MIN_LOGGED_FOCUS = 60;

let state: PomodoroState = INITIAL;
let endsAt: number | null = null;
/** When the current focus phase was first started; null until it is. */
let focusStartedAt: number | null = null;
/** Focus seconds of this phase already handed over by an earlier task switch. */
let focusLogged = 0;
let recorder: ((session: FocusSession) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

// One wake-up per second, timed for the moment the shown second changes
// (when the time to the deadline crosses a whole second), so the display never
// lags or skips a second without polling faster than it changes.
function startTicking() {
  if (timer !== null) clearTimeout(timer);
  timer = endsAt === null ? null : setTimeout(tick, (endsAt - Date.now()) % 1000 || 1000);
}

function set(next: PomodoroState) {
  state = next;
  listeners.forEach((l) => l());
}

function durationOf(phase: PomodoroPhase) {
  return phase === "focus" ? state.workDuration : state.breakDuration;
}

function stopTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  endsAt = null;
}

/**
 * Hands the focus done since the last hand-over to the recorder, if there is
 * enough of it, against the linked task. `whole` logs the end of a finished
 * phase whatever its length. `split` keeps the phase going for the next task
 * instead of closing it.
 */
function logFocus(remaining: number, whole = false, split = false) {
  if (state.phase !== "focus" || focusStartedAt === null) {
    if (!split) focusLogged = 0;
    return;
  }
  const elapsed = state.workDuration - remaining;
  const seconds = elapsed - focusLogged;
  const startedAt = focusStartedAt;
  if (split) {
    focusLogged = elapsed;
    // A paused run picks up its new start time when it resumes.
    focusStartedAt = state.running ? Date.now() : null;
  } else {
    focusLogged = 0;
    focusStartedAt = null;
  }
  if (seconds <= 0 || (!whole && seconds < MIN_LOGGED_FOCUS)) return;
  try {
    recorder?.({
      startedAt: new Date(startedAt),
      endedAt: new Date(),
      seconds,
      taskId: state.task?.id ?? null,
      taskTitle: state.task?.title ?? null,
    });
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
    startTicking();
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

  /**
   * Link focus to a task, or null to unlink. Mid-run, the focus so far is
   * logged to the old task and the clock carries on for the new one.
   */
  setTask(task: FocusTask | null) {
    if ((state.task?.id ?? null) === (task?.id ?? null)) {
      if (task && state.task && task.title !== state.task.title) set({ ...state, task: { ...task } });
      return;
    }
    logFocus(secondsLeft(), false, true);
    set({ ...state, task: task ? { ...task } : null });
  },

  /** The linked task was completed or deleted: log its share and unlink. */
  unlinkTask(id: string) {
    if (state.task?.id === id) pomodoro.setTask(null);
  },

  /** The linked task was renamed: show and log the new name. */
  renameTask(id: string, title: string) {
    if (state.task?.id === id && state.task.title !== title) set({ ...state, task: { id, title } });
  },

  /** Where finished focus goes (AppContext saves it to Supabase). Null to stop. */
  setRecorder(next: ((session: FocusSession) => void) | null) {
    recorder = next;
  },

  /** Test hook: back to a fresh 25-minute focus phase. */
  _reset() {
    stopTimer();
    focusStartedAt = null;
    focusLogged = 0;
    set(INITIAL);
  },
};

/** Portal badges and notifications stay quiet while focus is running. */
export function selectFocusMuted(s: PomodoroState): boolean {
  return s.running && s.phase === "focus";
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
