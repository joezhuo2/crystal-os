import type { PortalPreset } from "@/lib/portalApps";
import { toLocalDateStr } from "@/lib/utils";

export const GAME_PRESETS: PortalPreset[] = [
  { id: "wordle", name: "Wordle", url: "https://www.nytimes.com/games/wordle/index.html", color: "#6AAA64" },
  { id: "connections", name: "Connections", url: "https://www.nytimes.com/games/connections", color: "#B4A8FF" },
  { id: "contexto", name: "Contexto", url: "https://contexto.me/", color: "#22C55E" },
];

export interface FunResult {
  game: string;
  date: string;
  score: number | null;
  max: number | null;
  text: string;
}

const MAX_TEXT = 500;

export function parseShare(text: string): { score: number | null; max: number | null } {
  const outOf = /(?<![\w/])(\d{1,3}|X)\/(\d{1,3})(?![\d/])/i.exec(text);
  if (outOf) {
    const max = Number(outOf[2]);
    return { score: /x/i.test(outOf[1]) ? max + 1 : Number(outOf[1]), max };
  }
  const counted = /(\d+)\s+(?:guess|tries|try|attempt|move|mistake)/i.exec(text);
  return { score: counted ? Number(counted[1]) : null, max: null };
}

export function makeResult(game: string, text: string, date: string): FunResult {
  return { game, date, ...parseShare(text), text: text.slice(0, MAX_TEXT) };
}

export function upsertResult(results: FunResult[], next: FunResult): FunResult[] {
  const index = results.findIndex((r) => r.game === next.game && r.date === next.date);
  if (index === -1) return [...results, next];
  if (next.score === null && results[index].score !== null) return results;
  return results.map((r, i) => (i === index ? next : r));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return toLocalDateStr(new Date(y, m - 1, d + days));
}

export function streak(results: FunResult[], game: string, today: string): number {
  const days = new Set(results.filter((r) => r.game === game).map((r) => r.date));
  let day = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

export function recentDays(
  results: FunResult[],
  game: string,
  today: string,
  count = 7,
): { date: string; result: FunResult | null }[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i - count + 1);
    return { date, result: results.find((r) => r.game === game && r.date === date) ?? null };
  });
}

export function averageScore(results: (FunResult | null)[]): number | null {
  const scores = results.flatMap((r) => (r && r.score !== null ? [r.score] : []));
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

export function scoreLabel(result: FunResult | null): string {
  if (!result) return "–";
  if (result.score === null) return "✓";
  if (result.max === null) return String(result.score);
  return `${result.score > result.max ? "X" : result.score}/${result.max}`;
}

export function parseStoredResults(raw: string | null): FunResult[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const results: FunResult[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const { game, date, score, max, text } = item as Record<string, unknown>;
    if (typeof game !== "string" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    results.push({
      game,
      date,
      score: typeof score === "number" ? score : null,
      max: typeof max === "number" ? max : null,
      text: typeof text === "string" ? text.slice(0, MAX_TEXT) : "",
    });
  }
  return results;
}
