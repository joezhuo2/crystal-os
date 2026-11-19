import { toast } from "sonner";
import { pomodoro, type FocusTask } from "@/lib/pomodoro";
import { appendFocus } from "./focusLog";
import { readObservatorySettings } from "./settings";

export type FocusTrigger = "topic" | "resource" | "answer";
export interface FocusTarget { code: string; slug: string; title: string; taskId?: string }

const SETTING = { topic: "focusOnTopic", resource: "focusOnResource", answer: "focusOnAnswer" } as const;
const TOAST = "observatory-focus";

let owned: { task: FocusTask; target: FocusTarget; trigger: FocusTrigger } | null = null;
let lastActivity = Date.now();
const declined = new Set<string>();

const targets = new Map<string, FocusTarget>();

export const focusTask = (t: FocusTarget): FocusTask => ({ id: t.taskId ?? `topic:${t.code}/${t.slug}`, title: `${t.title} (${t.code})` });

/** Link the Pomodoro to a topic by hand (the "Focusing on" picker) so its minutes reach progress.md. */
export function focusTopic(target: FocusTarget) {
  const task = focusTask(target);
  targets.set(task.id, target);
  startFocusLogging();
  pomodoro.setTask(task);
}
export const studyActivity = () => void (lastActivity = Date.now());

function begin(target: FocusTarget, trigger: FocusTrigger) {
  const task = focusTask(target);
  focusTopic(target);
  if (pomodoro.getState().phase === "break") pomodoro.reset();
  pomodoro.start();
  owned = { task, target, trigger };
  studyActivity();
}

export function requestFocus(trigger: FocusTrigger, target: FocusTarget) {
  const s = readObservatorySettings();
  if (!s[SETTING[trigger]]) return;
  const task = focusTask(target);
  const p = pomodoro.getState();
  if (p.running && p.phase === "focus") {
    if (p.task?.id === task.id) return;
    if (owned && p.task?.id === owned.task.id) {
      focusTopic(target);
      owned = { task, target, trigger };
      return;
    }
    toast(`Focus is running${p.task ? ` on ${p.task.title}` : ""}`, { id: TOAST, action: { label: "Switch to this topic", onClick: () => focusTopic(target) } });
    return;
  }
  if (p.running) return;
  const key = `${trigger}:${task.id}`;
  if (declined.has(key)) return;
  if (s.focusAsk) {
    toast(`Start focus on ${target.title}?`, {
      id: TOAST,
      duration: 30_000,
      action: { label: "Start", onClick: () => begin(target, trigger) },
      cancel: { label: "Not now", onClick: () => declined.add(key) },
    });
    return;
  }
  const before = p.task;
  begin(target, trigger);
  toast(`Focus started on ${target.title}`, {
    id: TOAST,
    action: {
      label: "Undo",
      onClick: () => {
        pomodoro.reset();
        pomodoro.setTask(before);
        owned = null;
      },
    },
  });
}

/** Pause focus the Observatory started, optionally only when `trigger` started it. Hand-started focus is never touched. */
export function releaseFocus(trigger?: FocusTrigger) {
  if (!owned || (trigger && owned.trigger !== trigger)) return;
  const p = pomodoro.getState();
  if (readObservatorySettings().focusAutoStop && p.running && p.task?.id === owned.task.id) pomodoro.pause();
  owned = null;
}

export function checkIdle(now = Date.now()) {
  if (owned && now - lastActivity > readObservatorySettings().idleMinutes * 60_000) releaseFocus();
}

let logging = false;

/** Log each focus stretch on an Observatory topic to its course's progress.md. */
export function startFocusLogging() {
  if (logging) return;
  logging = true;
  pomodoro.onFocusLogged((session) => {
    const target = session.taskId ? targets.get(session.taskId) : undefined;
    if (!target || target.slug.startsWith("_")) return;
    void appendFocus(readObservatorySettings().folder, target.code, { topic: target.slug, seconds: session.seconds, at: session.endedAt.toISOString() }).catch(() => {});
  });
}

export const _resetFocus = () => {
  owned = null;
  targets.clear();
  declined.clear();
  lastActivity = Date.now();
};
