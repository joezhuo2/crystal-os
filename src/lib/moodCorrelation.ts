import { MOODS, type Mood } from "@/lib/dailyNote";

export const MIN_PAIRED_DAYS = 5;

export interface DayPair {
  day: string;
  mood: number;
  value: number;
}

export interface Correlation {
  paired: number;
  r: number | null;
  label: string;
  lowMood: number | null;
  highMood: number | null;
}

export const moodScore = (mood: Mood): number => MOODS.indexOf(mood) + 1;

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

export function describeCorrelation(r: number | null): string {
  if (r === null) return "none";
  const a = Math.abs(r);
  if (a < 0.2) return "none";
  const strength = a < 0.4 ? "weak" : a < 0.7 ? "moderate" : "strong";
  return `${strength} ${r > 0 ? "positive" : "negative"}`;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function pairDays(moods: Map<string, number>, values: { day: string; value: number }[]): DayPair[] {
  return values.flatMap((v) => {
    const mood = moods.get(v.day);
    return mood === undefined ? [] : [{ day: v.day, mood, value: v.value }];
  });
}

export function correlate(pairs: DayPair[]): Correlation {
  if (pairs.length < MIN_PAIRED_DAYS) {
    return { paired: pairs.length, r: null, label: "not enough days", lowMood: null, highMood: null };
  }
  const sorted = pairs.map((p) => p.value).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const r = pearson(pairs.map((p) => p.value), pairs.map((p) => p.mood));
  return {
    paired: pairs.length,
    r,
    label: describeCorrelation(r),
    lowMood: mean(pairs.filter((p) => p.value <= median).map((p) => p.mood)),
    highMood: mean(pairs.filter((p) => p.value > median).map((p) => p.mood)),
  };
}
