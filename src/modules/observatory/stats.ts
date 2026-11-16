import type { Progress } from "./model";
import { cardKey, logEntries, readCard } from "./srs";

export const ROLLOVER_HOUR = 4;
export const MASTERY_DAYS = 21;

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dayKey(at: Date | string): string {
  const d = new Date(at);
  d.setHours(d.getHours() - ROLLOVER_HOUR);
  return key(d);
}

const previousDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return key(new Date(y!, m! - 1, d! - 1));
};

export const observationDays = (progresses: Progress[]): string[] =>
  progresses.flatMap((p) => logEntries(p).flatMap((e) => (e.kind === "observation" ? [dayKey(e.at)] : [])));

export interface StudyStats { streak: number; today: number; goal: number; met: boolean }

export function studyStats(progresses: Progress[], goal: number, now = new Date()): StudyStats {
  const days = observationDays(progresses);
  const done = new Set(days);
  const today = dayKey(now);
  let day = done.has(today) ? today : previousDay(today);
  let streak = 0;
  for (; done.has(day); day = previousDay(day)) streak++;
  const count = days.filter((d) => d === today).length;
  return { streak, today: count, goal, met: count >= goal };
}

export const cardMastery = (stability: number) => Math.min(1, Math.max(0, stability) / MASTERY_DAYS);

export function topicMastery(progress: Progress, topic: string, questionIds: string[]): number {
  if (!questionIds.length) return 0;
  const total = questionIds.reduce((sum, id) => sum + cardMastery(readCard(progress, cardKey(topic, id))?.stability ?? 0), 0);
  return total / questionIds.length;
}
