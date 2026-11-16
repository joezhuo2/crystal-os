import type { Progress } from "./model";
import { focusEntries } from "./focusLog";
import { logEntries, readCard } from "./srs";
import { MASTERY_DAYS, dayKey, studyStats } from "./stats";

export interface StudyCourseInput { code: string; name: string; progress: Progress }
export interface StudyRange { days: string[]; today: string }
export interface StudyOrbitStats {
  reviewsPerDay: { day: string; count: number }[];
  totalReviews: number;
  streak: number;
  goalDays: number;
  goalHitRate: number;
  mastered: number;
  minutesByCourse: { code: string; name: string; minutes: number }[];
}

export function orbitStudyStats(
  courses: StudyCourseInput[],
  range: StudyRange,
  goal: number,
): StudyOrbitStats {
  const progresses = courses.map((c) => c.progress);
  const entries = progresses.flatMap(logEntries);
  const reviews = new Map<string, number>(range.days.map((d) => [d, 0]));
  const observed = new Map<string, number>();
  for (const e of entries) {
    const day = dayKey(e.at);
    if (e.kind === "review") {
      if (reviews.has(day)) reviews.set(day, reviews.get(day)! + 1);
    } else observed.set(day, (observed.get(day) ?? 0) + 1);
  }
  const elapsed = range.days.filter((d) => d <= range.today);
  const goalDays = elapsed.filter((d) => (observed.get(d) ?? 0) >= goal).length;
  const reviewsPerDay = range.days.map((day) => ({ day, count: reviews.get(day) ?? 0 }));
  const mastered = progresses.reduce(
    (n, p) => n + Object.keys(p.cards).filter((k) => (readCard(p, k)?.stability ?? 0) >= MASTERY_DAYS).length,
    0,
  );
  return {
    reviewsPerDay,
    totalReviews: reviewsPerDay.reduce((n, d) => n + d.count, 0),
    streak: studyStats(progresses, goal, new Date(`${range.today}T12:00:00`)).streak,
    goalDays,
    goalHitRate: elapsed.length ? goalDays / elapsed.length : 0,
    mastered,
    minutesByCourse: courses
      .map((c) => ({
        code: c.code,
        name: c.name,
        minutes: Math.round(focusEntries(c.progress).reduce((n, e) => (reviews.has(dayKey(e.at)) ? n + e.seconds : n), 0) / 60),
      }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export function studyMarkdown(s: StudyOrbitStats, unit: string): string {
  const lines = [
    "## Study",
    "",
    `- Reviews: ${s.totalReviews} this ${unit}`,
    `- Study streak: ${s.streak} day${s.streak === 1 ? "" : "s"}`,
    `- Daily goal hit: ${s.goalDays} day${s.goalDays === 1 ? "" : "s"} (${Math.round(s.goalHitRate * 100)}%)`,
    `- Cards mastered: ${s.mastered}`,
  ];
  for (const c of s.minutesByCourse) if (c.minutes > 0) lines.push(`- ${c.code} ${c.name}: ${c.minutes} min`);
  return lines.join("\n");
}
