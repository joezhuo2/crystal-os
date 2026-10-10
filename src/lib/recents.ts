/**
 * Recently opened tasks, vault notes and calendar events, newest first, for
 * the command palette's empty state. Kept in localStorage per device and per
 * signed-in user (`crystal-os-recents:<userId>`), so the next account on the
 * same machine never sees the last one's titles.
 *
 * "Opened" means the task's edit form, the note in The Archive's reader, or
 * the event's edit form in The Horizon, from wherever it was opened.
 */

export const RECENTS_KEY_PREFIX = "crystal-os-recents:";
export const MAX_RECENTS = 8;

interface RecentBase {
  /** Task id, note path or event id. */
  id: string;
  title: string;
  /** When it was last opened, ms since the epoch. */
  at: number;
}

export type RecentItem =
  | (RecentBase & { kind: "task" })
  | (RecentBase & { kind: "note" })
  | (RecentBase & { kind: "event"; calendarId: string; date: string });

export type RecentKind = RecentItem["kind"];

/** A recent item before it is stamped with `at`. */
export type RecentInput = RecentItem extends infer T ? (T extends RecentItem ? Omit<T, "at"> : never) : never;

const KINDS: ReadonlySet<string> = new Set(["task", "note", "event"]);

function isRecent(value: unknown): value is RecentItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!KINDS.has(v.kind as string)) return false;
  if (typeof v.id !== "string" || !v.id || typeof v.title !== "string" || typeof v.at !== "number") return false;
  if (v.kind === "event") return typeof v.calendarId === "string" && typeof v.date === "string";
  return true;
}

/** Reads a stored list, dropping malformed entries and anything past the cap. */
export function parseRecents(raw: string | null): RecentItem[] {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!Array.isArray(data)) return [];
  return data.filter(isRecent).slice(0, MAX_RECENTS);
}

/** Puts `item` first, removing its older entry, and trims to the cap. */
export function pushRecent(list: RecentItem[], item: RecentItem): RecentItem[] {
  const rest = list.filter((r) => !(r.kind === item.kind && r.id === item.id));
  return [item, ...rest].slice(0, MAX_RECENTS);
}

let owner: string | null = null;

/** Set by AppProvider to the signed-in user, or null once signed out. */
export function setRecentsOwner(userId: string | null) {
  owner = userId;
}

function key() {
  return owner ? RECENTS_KEY_PREFIX + owner : null;
}

export function readRecents(): RecentItem[] {
  const k = key();
  if (!k) return [];
  try {
    return parseRecents(localStorage.getItem(k));
  } catch {
    return [];
  }
}

function write(list: RecentItem[]) {
  const k = key();
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(list));
  } catch {
    /* ignore localStorage errors */
  }
}

/** Records an open. Untitled items are skipped: the palette has nothing to show for them. */
export function recordRecent(item: RecentInput, now = Date.now()) {
  if (!item.title.trim()) return;
  write(pushRecent(readRecents(), { ...item, at: now } as RecentItem));
}

/** Drops an item that no longer exists, such as a deleted task or event. */
export function forgetRecent(kind: RecentKind, id: string) {
  const list = readRecents();
  const next = list.filter((r) => !(r.kind === kind && r.id === id));
  if (next.length !== list.length) write(next);
}
