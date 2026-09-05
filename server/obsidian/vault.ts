import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";

/** Directories inside a vault that are never notes. */
const IGNORED = [
  "**/.obsidian/**",
  "**/.trash/**",
  "**/.git/**",
  "**/node_modules/**",
];

const MAX_TEXT_LENGTH = 10_000;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 60;
/** Obsidian tags: letters, digits, and - _ / only. */
const TAG_PATTERN = /^[\p{L}\p{N}_\-/]+$/u;
const EXCERPT_LENGTH = 200;
const CONTEXT_RADIUS = 80;

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

/* ------------------------------------------------------------------ *
 * Path safety
 * ------------------------------------------------------------------ */

/**
 * Resolve a caller-supplied relative path against the vault root, refusing
 * anything that escapes it. Every filesystem access goes through this - it is
 * the only thing between a JSON request body and an arbitrary file write.
 */
export function resolveVaultPath(vaultRoot: string, relPath: string): string {
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

  const root = path.resolve(vaultRoot);
  const resolved = path.resolve(root, rel);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new VaultError("notePath escapes the vault root");
  }

  return resolved;
}

/** Vault-relative, forward-slashed form of an absolute path. */
export function toRelative(vaultRoot: string, absPath: string): string {
  return path.relative(path.resolve(vaultRoot), absPath).replace(/\\/g, "/");
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
  return path.basename(relPath, path.extname(relPath));
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

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** Parsed notes keyed by path, invalidated on mtime change. */
const noteCache = new Map<string, { mtimeMs: number; note: VaultNoteDetail }>();

function parseNote(
  relPath: string,
  raw: string,
  mtimeMs: number,
  size: number,
): VaultNoteDetail {
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const content = parsed.content ?? "";

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

async function loadNote(root: string, rel: string): Promise<VaultNoteDetail | null> {
  const abs = path.join(root, rel);

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return null;
  }

  const key = `${root}::${rel}`;
  const cached = noteCache.get(key);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.note;

  const raw = await fs.readFile(abs, { encoding: "utf-8" });
  const note = parseNote(rel, raw, stat.mtimeMs, stat.size);
  noteCache.set(key, { mtimeMs: stat.mtimeMs, note });
  return note;
}

/** Every markdown note in the vault, newest first. */
export async function listNotes(vaultRoot: string): Promise<VaultNoteDetail[]> {
  const root = path.resolve(vaultRoot);

  // fast-glob treats "\" as an escape character, so a raw Windows path matches
  // nothing. Only the glob cwd gets the forward-slash form; path.join above
  // keeps using the native root.
  const globRoot = root.replace(/\\/g, "/");

  const entries = await fg("**/*.md", {
    cwd: globRoot,
    ignore: IGNORED,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
  });

  const loaded = await Promise.all(entries.map((rel) => loadNote(root, rel)));

  return loaded
    .filter((n): n is VaultNoteDetail => n !== null)
    .sort((a, b) => {
      const at = a.date ? Date.parse(a.date) : a.mtime;
      const bt = b.date ? Date.parse(b.date) : b.mtime;
      return bt - at;
    });
}

/** One note, including its body. */
export async function readNote(
  vaultRoot: string,
  relPath: string,
): Promise<VaultNoteDetail> {
  const abs = resolveVaultPath(vaultRoot, relPath);
  const rel = toRelative(vaultRoot, abs);
  const note = await loadNote(path.resolve(vaultRoot), rel);
  if (!note) throw new VaultError(`Note not found: ${rel}`, 404);
  return note;
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
 * Rewriting the file through gray-matter would reformat every other key, so
 * the YAML is patched textually and the existing list style is preserved.
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

export interface AppendOptions {
  /** Merged into the note's frontmatter tag list. */
  tags?: unknown;
  now?: Date;
}

/**
 * Append a timestamped bullet to a note, creating the file (and any parent
 * directories) when it does not exist yet. Supplied tags are merged into the
 * note's frontmatter, which is where the rest of the app reads tags from.
 */
export async function appendToNote(
  vaultRoot: string,
  relPath: string,
  rawText: string,
  { tags: rawTags, now = new Date() }: AppendOptions = {},
): Promise<QuickAddResult> {
  const text = assertQuickAddText(rawText);
  const tags = assertQuickAddTags(rawTags);
  const abs = resolveVaultPath(vaultRoot, relPath);
  const rel = toRelative(vaultRoot, abs);

  await fs.mkdir(path.dirname(abs), { recursive: true });

  let existing = "";
  let created = false;
  try {
    existing = await fs.readFile(abs, { encoding: "utf-8" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    created = true;
  }

  const day = formatDay(now);
  let noteTags = tags;
  let tagsAdded = tags;

  if (created) {
    // Fall back to the inbox tag so untagged captures stay findable.
    noteTags = tags.length ? tags : ["inbox"];
    tagsAdded = noteTags;
    const title = path.basename(rel, ".md");
    existing = `---\ntags: [${noteTags.join(", ")}]\ncreated: ${day}\n---\n\n# ${title}\n`;
    await fs.writeFile(abs, existing, { encoding: "utf-8" });
  } else {
    // Also runs with no new tags, so the result reports what the note carries.
    const upsert = upsertFrontmatterTags(existing, tags);
    noteTags = upsert.tags;
    tagsAdded = upsert.added;
    if (upsert.added.length) {
      existing = upsert.content;
      await fs.writeFile(abs, existing, { encoding: "utf-8" });
    }
  }

  // Indent continuation lines so multi-line captures stay inside the bullet.
  const bullet = `- **${formatTime(now)}** ${text.replace(/\r?\n/g, "\n  ")}\n`;

  let chunk = "";
  if (existing.length && !existing.endsWith("\n")) chunk += "\n";
  if (!hasTrailingDayHeading(existing, day)) chunk += `\n## ${day}\n`;
  chunk += `\n${bullet}`;

  // Explicit encoding: without it appendFile takes a Buffer path that mangles
  // emoji and other non-ASCII characters.
  await fs.appendFile(abs, chunk, { encoding: "utf-8" });

  noteCache.delete(`${path.resolve(vaultRoot)}::${rel}`);

  return {
    path: rel,
    created,
    bytesWritten: Buffer.byteLength(chunk, "utf-8"),
    tags: noteTags,
    tagsAdded,
  };
}
