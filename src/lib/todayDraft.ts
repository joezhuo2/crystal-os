import type { TodayEntry } from "@/lib/dailyNote";

const KEY = "crystal-os-orbit-today-drafts";
const KEEP_DAYS = 14;

export interface TodayDraft {
  path: string;
  entry: TodayEntry;
}

export type TodayDrafts = Record<string, TodayDraft>;

export function readDrafts(): TodayDrafts {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Sets (or, with null, clears) the day's unsaved entry, dropping drafts older than two weeks. */
export function writeDraft(day: string, draft: TodayDraft | null, now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const drafts = Object.fromEntries(Object.entries(readDrafts()).filter(([d]) => d !== day && d >= cutoff));
  if (draft) drafts[day] = draft;
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    // Storage blocked: the entry lives only until the card closes.
  }
}

export const pastDrafts = (drafts: TodayDrafts, today: string) => Object.entries(drafts).filter(([day]) => day < today);
