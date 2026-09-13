/**
 * Vault logic shared by the Node middleware (server/obsidian/vault.ts) and
 * the desktop app's native vault (src/lib/vaultNative.ts): note parsing,
 * search, tag handling, and quick-add formatting.
 *
 * Pure string work only. No `node:*` imports, no `@/` alias (the server
 * imports this by relative path), and no filesystem access — callers own I/O.
 */

const MAX_TEXT_LENGTH = 10_000;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 60;
/** Obsidian tags: letters, digits, and - _ / only. */
const TAG_PATTERN = /^[\p{L}\p{N}_\-/]+$/u;
const EXCERPT_LENGTH = 200;
const CONTEXT_RADIUS = 80;
const DEFAULT_LIMIT = 50;

/** Where quick-add appends when no note is chosen. */
export const DEFAULT_NOTE_PATH = "Inbox.md";

/** An error carrying the HTTP status the middleware should reply with. */
export class VaultError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "VaultError";
    this.status = status;
  }
}

export interface VaultNote {
  /** Vault-relative path, always forward-slashed: "Projects/Anamnesis.md". */
  path: string;
  title: string;
  tags: string[];
  /** ISO date from frontmatter when present, otherwise the file mtime. */
  date: string | null;
  status: string | null;
  /** Frontmatter keys beyond the four we model explicitly. */
  frontmatter: Record<string, unknown>;
  excerpt: string;
  mtime: number;
  size: number;
}

export interface VaultNoteDetail extends VaultNote {
  content: string;
}

export interface SearchHit extends VaultNote {
  score: number;
  /** Snippet around a body match, so the UI can show why the note matched. */
  matchContext: string | null;
}

export interface VaultNotesResponse {
  notes: SearchHit[];
  allTags: string[];
  total: number;
}

export interface VaultQuery {
  q?: string;
  tag?: string;
  limit?: number;
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

/**
 * Normalise a vault-relative note path: forward slashes, no leading "./",
 * ".md" appended. Refuses absolute paths; containment against a real root is
 * the caller's job (resolveVaultPath on Node, vault.rs on desktop).
 */
export function normalizeNotePath(relPath: unknown): string {
  if (typeof relPath !== "string" || !relPath.trim()) {
    throw new VaultError("notePath must be a non-empty string");
  }

  let rel = relPath.replace(/\\/g, "/").trim();

  if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) {
    throw new VaultError("notePath must be relative to the vault root");
  }

  rel = rel.replace(/^(\.\/)+/, "");
  if (!rel) throw new VaultError("notePath must be a non-empty string");
  if (!rel.toLowerCase().endsWith(".md")) rel += ".md";
  return rel;
}

function basenameWithoutExt(relPath: string): string {
  const base = relPath.slice(relPath.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/* ------------------------------------------------------------------ *
 * Frontmatter normalisation
 * ------------------------------------------------------------------ */

export function normalizeTags(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === "") return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\n]+/);
  const cleaned = list
    .map((t) => String(t).trim().replace(/^#/, ""))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

export function normalizeDate(raw: unknown, fallbackMs: number): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.valueOf())) {
    return raw.toISOString();
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  }
  return fallbackMs ? new Date(fallbackMs).toISOString() : null;
}

export function deriveTitle(
  data: Record<string, unknown>,
  content: string,
  relPath: string,
): string {
  if (typeof data.title === "string" && data.title.trim()) {
    return data.title.trim();
  }
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return basenameWithoutExt(relPath);
}

/** Flatten markdown to plain-ish text for excerpts and body search. */
export function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias || target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcerpt(content: string): string {
  const text = stripMarkdown(content);
  return text.length > EXCERPT_LENGTH
    ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}...`
    : text;
}

/** Build a note from already-split frontmatter data and body. */
export function buildNote(
  relPath: string,
  data: Record<string, unknown>,
  content: string,
  mtimeMs: number,
  size: number,
): VaultNoteDetail {
  const { title: _title, tags: _tags, date: _date, status: _status, ...rest } = data;

  return {
    path: relPath,
    title: deriveTitle(data, content, relPath),
    tags: normalizeTags(data.tags),
    date: normalizeDate(data.date, mtimeMs),
    status: typeof data.status === "string" ? data.status : null,
    frontmatter: rest,
    excerpt: buildExcerpt(content),
    mtime: mtimeMs,
    size,
    content,
  };
}

/** Newest first, by frontmatter date when present, else mtime. */
export function sortNotesByDate<T extends VaultNote>(notes: T[]): T[] {
  return notes.sort((a, b) => {
    const at = a.date ? Date.parse(a.date) : a.mtime;
    const bt = b.date ? Date.parse(b.date) : b.mtime;
    return bt - at;
  });
}

/** Strip the body - list responses stay small. */
export function toSummary(note: VaultNoteDetail): VaultNote {
  const { content: _content, ...summary } = note;
  return summary;
}

/** The deduplicated tag list, most frequent first. */
export function collectTags(notes: VaultNote[]): string[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/**
 * Score notes against a query: title beats tags beats path beats body. Body
 * hits carry a snippet so the caller can show why the note matched.
 */
export function searchNotes(notes: VaultNoteDetail[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];

  for (const note of notes) {
    let score = 0;
    let matchContext: string | null = null;

    const title = note.title.toLowerCase();
    if (title === q) score += 100;
    else if (title.startsWith(q)) score += 60;
    else if (title.includes(q)) score += 40;

    if (note.tags.some((t) => t.toLowerCase() === q)) score += 30;
    else if (note.tags.some((t) => t.toLowerCase().includes(q))) score += 15;

    if (note.path.toLowerCase().includes(q)) score += 10;

    const body = stripMarkdown(note.content);
    const idx = body.toLowerCase().indexOf(q);
    if (idx !== -1) {
      score += 5;
      const start = Math.max(0, idx - CONTEXT_RADIUS);
      const end = Math.min(body.length, idx + q.length + CONTEXT_RADIUS);
      matchContext =
        (start > 0 ? "..." : "") +
        body.slice(start, end).trim() +
        (end < body.length ? "..." : "");
    }

    if (score > 0) hits.push({ ...toSummary(note), score, matchContext });
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/** Recent notes, or search/tag results, shaped like `GET /api/obsidian/notes`. */
export function queryNotes(
  all: VaultNoteDetail[],
  { q = "", tag = "", limit }: VaultQuery = {},
): VaultNotesResponse {
  const query = q.trim();
  const wanted = tag.trim().toLowerCase();
  const max = limit && limit > 0 ? limit : DEFAULT_LIMIT;

  let notes: SearchHit[] = query
    ? searchNotes(all, query)
    : all.map((note) => ({ ...toSummary(note), score: 0, matchContext: null }));

  if (wanted) {
    notes = notes.filter((n) => n.tags.some((t) => t.toLowerCase() === wanted));
  }

  return { notes: notes.slice(0, max), allTags: collectTags(all), total: notes.length };
}

/* ------------------------------------------------------------------ *
 * Frontmatter tags
 * ------------------------------------------------------------------ */

/** Frontmatter block at the very top of a note, plus its trailing newline. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

/**
 * Validate caller-supplied tags. Whitespace inside a tag becomes a hyphen so
 * "quick note" is accepted rather than rejected; anything still outside the
 * Obsidian tag charset after that is an error.
 */
export function assertQuickAddTags(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (!Array.isArray(raw) && typeof raw !== "string") {
    throw new VaultError("tags must be an array of strings");
  }

  const tags = normalizeTags(raw).map((t) => t.replace(/\s+/g, "-"));

  if (tags.length > MAX_TAGS) {
    throw new VaultError(`No more than ${MAX_TAGS} tags`);
  }
  for (const tag of tags) {
    if (tag.length > MAX_TAG_LENGTH) {
      throw new VaultError(`Tag exceeds ${MAX_TAG_LENGTH} characters: ${tag}`);
    }
    if (!TAG_PATTERN.test(tag)) {
      throw new VaultError(`Invalid tag: ${tag}`);
    }
  }

  // normalizeTags dedupes exactly; also fold case-insensitive duplicates.
  return mergeTags([], tags);
}

/** Union of two tag lists, keeping the casing already on the note. */
export function mergeTags(existing: string[], incoming: string[]): string[] {
  const out = [...existing];
  const seen = new Set(existing.map((t) => t.toLowerCase()));
  for (const tag of incoming) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Tags from an inline `[a, b]`, quoted, or comma-separated YAML value. */
function parseInlineTagValue(value: string): string[] {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  return normalizeTags(inner.replace(/["']/g, ""));
}

export interface TagUpsert {
  /** The note text with the frontmatter tag list updated. */
  content: string;
  /** The note's full tag list after the merge. */
  tags: string[];
  /** Tags that were not already on the note. */
  added: string[];
}

/**
 * Merge tags into a note's frontmatter, touching only the tag list itself.
 * Rewriting the file through a YAML serialiser would reformat every other
 * key, so the YAML is patched textually and the existing list style is kept.
 */
export function upsertFrontmatterTags(raw: string, incoming: string[]): TagUpsert {
  const add = incoming.filter(Boolean);
  const match = raw.match(FRONTMATTER_RE);

  // No frontmatter yet: give the note one.
  if (!match) {
    if (!add.length) return { content: raw, tags: [], added: [] };
    const lead = raw.startsWith("\n") ? "" : "\n";
    return {
      content: `---\ntags: [${add.join(", ")}]\n---\n${lead}${raw}`,
      tags: add,
      added: add,
    };
  }

  const [block, body] = match;
  const eol = block.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r?\n/);
  const keyIdx = lines.findIndex((line) => /^tags[ \t]*:/i.test(line));

  const rebuild = (next: string[], tags: string[], added: string[]): TagUpsert => ({
    // The block always matches at index 0, so the body is everything after it.
    content: `---${eol}${next.join(eol)}${eol}---${eol}` + raw.slice(block.length),
    tags,
    added,
  });

  // No tags key: append one to the end of the block.
  if (keyIdx === -1) {
    if (!add.length) return { content: raw, tags: [], added: [] };
    const next = [...lines, `tags: [${add.join(", ")}]`];
    return rebuild(next, add, add);
  }

  const value = lines[keyIdx].replace(/^tags[ \t]*:/i, "");

  // Block list style:  tags:\n  - one\n  - two
  if (!value.trim()) {
    let end = keyIdx + 1;
    const items: string[] = [];
    const itemRe = /^([ \t]*)-[ \t]+(.*)$/;
    let indent = "  ";

    while (end < lines.length) {
      const item = lines[end].match(itemRe);
      if (!item) break;
      if (items.length === 0 && item[1]) indent = item[1];
      items.push(...normalizeTags(item[2].replace(/["']/g, "")));
      end += 1;
    }

    const merged = mergeTags(items, add);
    const added = merged.slice(items.length);
    if (!added.length) return { content: raw, tags: merged, added: [] };

    const next = [
      ...lines.slice(0, keyIdx + 1),
      ...merged.map((tag) => `${indent}- ${tag}`),
      ...lines.slice(end),
    ];
    return rebuild(next, merged, added);
  }

  // Inline / comma-separated style.
  const existing = parseInlineTagValue(value);
  const merged = mergeTags(existing, add);
  const added = merged.slice(existing.length);
  if (!added.length) return { content: raw, tags: merged, added: [] };

  const next = [...lines];
  next[keyIdx] = `tags: [${merged.join(", ")}]`;
  return rebuild(next, merged, added);
}

/* ------------------------------------------------------------------ *
 * Quick add
 * ------------------------------------------------------------------ */

export function assertQuickAddText(text: unknown): string {
  if (typeof text !== "string") {
    throw new VaultError("text must be a string");
  }
  const trimmed = text.trim();
  if (!trimmed) throw new VaultError("text must not be empty");
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new VaultError(`text exceeds ${MAX_TEXT_LENGTH} characters`);
  }
  return trimmed;
}

function formatDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** True when the last "## YYYY-MM-DD" heading in the file is already today. */
export function hasTrailingDayHeading(content: string, day: string): boolean {
  const matches = [...content.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm)];
  if (!matches.length) return false;
  return matches[matches.length - 1][1] === day;
}

export interface QuickAddResult {
  path: string;
  created: boolean;
  bytesWritten: number;
  /** The note's frontmatter tags after the append. */
  tags: string[];
  /** The subset of those tags this append introduced. */
  tagsAdded: string[];
}

export interface QuickAddPlan {
  /** The full note text to write. */
  content: string;
  /** The appended bullet (and day heading), for byte accounting. */
  chunk: string;
  created: boolean;
  tags: string[];
  tagsAdded: string[];
}

/**
 * Work out the note text after a quick-add: a timestamped bullet under
 * today's "## YYYY-MM-DD" heading, with supplied tags merged into the
 * frontmatter. `existing` is null when the note does not exist yet.
 */
export function planQuickAdd(
  existing: string | null,
  relPath: string,
  rawText: unknown,
  rawTags: unknown,
  now: Date = new Date(),
): QuickAddPlan {
  const text = assertQuickAddText(rawText);
  const tags = assertQuickAddTags(rawTags);
  const day = formatDay(now);

  let content: string;
  let noteTags: string[];
  let tagsAdded: string[];

  if (existing === null) {
    // Fall back to the inbox tag so untagged captures stay findable.
    noteTags = tags.length ? tags : ["inbox"];
    tagsAdded = noteTags;
    content = `---\ntags: [${noteTags.join(", ")}]\ncreated: ${day}\n---\n\n# ${basenameWithoutExt(relPath)}\n`;
  } else {
    // Also runs with no new tags, so the result reports what the note carries.
    const upsert = upsertFrontmatterTags(existing, tags);
    noteTags = upsert.tags;
    tagsAdded = upsert.added;
    content = upsert.added.length ? upsert.content : existing;
  }

  // Indent continuation lines so multi-line captures stay inside the bullet.
  const bullet = `- **${formatTime(now)}** ${text.replace(/\r?\n/g, "\n  ")}\n`;

  let chunk = "";
  if (content.length && !content.endsWith("\n")) chunk += "\n";
  if (!hasTrailingDayHeading(content, day)) chunk += `\n## ${day}\n`;
  chunk += `\n${bullet}`;

  return {
    content: content + chunk,
    chunk,
    created: existing === null,
    tags: noteTags,
    tagsAdded,
  };
}

/** UTF-8 byte length, without Node's Buffer. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
