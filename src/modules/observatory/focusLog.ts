import type { Progress } from "./model";
import { progressSummary } from "./srs";
import { updateProgress } from "./store";

export interface FocusEntry { kind: "focus"; topic: string; seconds: number; at: string }

export const focusEntries = (p: Progress): FocusEntry[] =>
  p.log.filter((e): e is FocusEntry => {
    const x = e as Partial<FocusEntry> | null;
    return !!x && x.kind === "focus" && typeof x.topic === "string" && typeof x.seconds === "number" && x.seconds > 0 && typeof x.at === "string";
  });

/** Whole focus minutes per topic slug, optionally only entries at or after `since`. */
export function focusMinutesByTopic(p: Progress, since?: Date): Record<string, number> {
  const seconds: Record<string, number> = {};
  for (const e of focusEntries(p)) if (!since || Date.parse(e.at) >= since.getTime()) seconds[e.topic] = (seconds[e.topic] ?? 0) + e.seconds;
  return Object.fromEntries(Object.entries(seconds).map(([topic, s]) => [topic, Math.round(s / 60)]));
}

export const focusMinutes = (p: Progress, since?: Date): number => Object.values(focusMinutesByTopic(p, since)).reduce((a, b) => a + b, 0);

export const appendFocus = (folder: string, code: string, entry: Omit<FocusEntry, "kind">) =>
  updateProgress(folder, code, (p) => ({ ...p, log: [...p.log, { kind: "focus", ...entry }] }), progressSummary);
