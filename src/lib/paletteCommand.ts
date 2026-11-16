import { fuzzyRank } from "./fuzzy";
import { snoozePresets } from "./snooze";

interface TaskLike {
  id: string;
  name: string;
  completed: boolean;
}

export type PaletteCommand<T extends TaskLike> =
  | { kind: "add"; name: string }
  | { kind: "log"; amount: number; name: string }
  | { kind: "complete"; task: T }
  | { kind: "snooze"; task: T; until: string | "someday" | null }
  | { kind: "focus"; task: T };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseSnoozeTarget(raw: string, today: string): string | "someday" | null {
  const text = raw.trim().toLowerCase();
  if (text === "someday") return "someday";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text > today ? text : null;
  const preset = snoozePresets(today).find((p) => p.id === text.replace(/\s+/g, "-") || p.label.toLowerCase() === text);
  if (preset) return preset.date;
  const weekday = WEEKDAYS.findIndex((day) => text.length >= 3 && day.startsWith(text));
  if (weekday < 0) return null;
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() + (((weekday - date.getDay() + 7) % 7) || 7));
  return toDateStr(date);
}

export function parsePaletteCommand<T extends TaskLike>(input: string, tasks: readonly T[], today: string): PaletteCommand<T> | null {
  const text = input.trim();
  const open = (query: string) => fuzzyRank(query, tasks.filter((t) => !t.completed), (t) => t.name)[0];

  const log = /^log\s+\$?(\d+(?:\.\d{1,2})?)\s+(?:for|on)\s+(.+)$/i.exec(text);
  if (log) return { kind: "log", amount: Number(log[1]), name: log[2].trim() };

  const add = /^add\s+(.+)$/i.exec(text);
  if (add) return { kind: "add", name: add[1].trim() };

  const complete = /^(?:complete|finish|done)\s+(.{2,})$/i.exec(text);
  if (complete) {
    const task = open(complete[1]);
    return task ? { kind: "complete", task } : null;
  }

  const focus = /^(?:start\s+)?focus(?:\s+on)?\s+(.{2,})$/i.exec(text);
  if (focus) {
    const task = open(focus[1]);
    return task ? { kind: "focus", task } : null;
  }

  const snooze = /^snooze\s+(.{2,})$/i.exec(text);
  if (snooze) {
    const split = /^(.+?)\s+(?:to|until|till)\s+(.+)$/i.exec(snooze[1]);
    const until = split ? parseSnoozeTarget(split[2], today) : null;
    const task = open(split && until ? split[1] : snooze[1]) ?? (split ? open(split[1]) : undefined);
    return task ? { kind: "snooze", task, until } : null;
  }

  return null;
}

export const RECENT_COMMANDS_KEY = "crystal-os-recent-commands";
export const MAX_RECENT_COMMANDS = 5;

export function readRecentCommands(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string").slice(0, MAX_RECENT_COMMANDS) : [];
  } catch {
    return [];
  }
}

export function recordRecentCommand(command: string) {
  const text = command.trim();
  if (!text) return;
  const next = [text, ...readRecentCommands().filter((c) => c.toLowerCase() !== text.toLowerCase())].slice(0, MAX_RECENT_COMMANDS);
  try {
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}
