/**
 * The Orbit's Today card: a focus line, a mood, and an end-of-day reflection,
 * kept in the vault's daily note (`YYYY-MM-DD.md`, tagged `daily`).
 *
 * The card owns one block between HTML comments and never touches anything
 * else in the note, so text written in Obsidian survives every save.
 */

import { upsertFrontmatterTags } from "@/lib/vaultCore";

export const MOODS = ["rough", "low", "okay", "good", "great"] as const;
export type Mood = (typeof MOODS)[number];

export interface TodayEntry {
  focus: string;
  mood: Mood | null;
  reflection: string;
}

export const DAILY_TAG = "daily";
const FALLBACK_FOLDER = "Daily";
const OPEN = "<!-- crystal-os:today -->";
const CLOSE = "<!-- /crystal-os:today -->";
const BLOCK_RE = /<!-- crystal-os:today -->[\s\S]*?<!-- \/crystal-os:today -->/;
const DAY_FILE_RE = /^(?:(.*)\/)?(\d{4}-\d{2}-\d{2})\.md$/i;

export const EMPTY_ENTRY: TodayEntry = { focus: "", mood: null, reflection: "" };

/**
 * Where daily notes live: the folder of the newest `YYYY-MM-DD.md` already in
 * the vault ("" for the root), or `Daily` when there are none yet.
 */
export function pickDailyFolder(paths: string[]): string {
  let newest: { day: string; folder: string } | null = null;
  for (const path of paths) {
    const m = path.match(DAY_FILE_RE);
    if (m && (!newest || m[2] > newest.day)) newest = { day: m[2], folder: m[1] ?? "" };
  }
  return newest ? newest.folder : FALLBACK_FOLDER;
}

export function dailyNotePath(folder: string, day: string): string {
  return folder ? `${folder}/${day}.md` : `${day}.md`;
}

/** One line per field, so the block stays readable and parseable. */
const oneLine = (text: string) => text.replace(/\s*\r?\n\s*/g, " ").trim();

function renderBlock({ focus, mood, reflection }: TodayEntry): string {
  const lines = [OPEN];
  if (oneLine(focus)) lines.push(`**Focus:** ${oneLine(focus)}`);
  if (mood) lines.push(`**Mood:** ${mood}`);
  if (oneLine(reflection)) lines.push(`**Reflection:** ${oneLine(reflection)}`);
  lines.push(CLOSE);
  return lines.join("\n");
}

/** The note with the Today block written in (replaced, or appended) and the daily tag added. */
export function mergeToday(raw: string | null, entry: TodayEntry): string {
  const block = renderBlock(entry);
  const tagged = upsertFrontmatterTags(raw ?? "", [DAILY_TAG]).content;
  if (BLOCK_RE.test(tagged)) return tagged.replace(BLOCK_RE, () => block);
  const body = tagged.replace(/\s*$/, "");
  return `${body}\n\n${block}\n`;
}

/** The Today block's fields, or an empty entry when the note has none. */
export function parseToday(raw: string): TodayEntry {
  const block = raw.match(BLOCK_RE)?.[0];
  if (!block) return { ...EMPTY_ENTRY };
  const field = (name: string) => block.match(new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, "m"))?.[1].trim() ?? "";
  const mood = field("Mood") as Mood;
  return {
    focus: field("Focus"),
    mood: MOODS.includes(mood) ? mood : null,
    reflection: field("Reflection"),
  };
}
