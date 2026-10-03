import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import {
  VaultError,
  buildNote,
  byteLength,
  normalizeNotePath,
  planQuickAdd,
  sortNotesByDate,
  type QuickAddResult,
  type VaultNoteDetail,
} from "../../src/lib/vaultCore";

// Parsing, search, and quick-add formatting live in src/lib/vaultCore.ts so
// the desktop app's native vault shares them. Re-exported for existing callers.
export {
  VaultError,
  assertQuickAddTags,
  assertQuickAddText,
  collectTags,
  deriveTitle,
  hasTrailingDayHeading,
  mergeTags,
  normalizeDate,
  normalizeTags,
  searchNotes,
  stripMarkdown,
  toSummary,
  upsertFrontmatterTags,
} from "../../src/lib/vaultCore";
export type {
  QuickAddResult,
  SearchHit,
  TagUpsert,
  VaultNote,
  VaultNoteDetail,
} from "../../src/lib/vaultCore";

/** Directories inside a vault that are never notes. */
const IGNORED = [
  "**/.obsidian/**",
  "**/.trash/**",
  "**/.git/**",
  "**/node_modules/**",
];

/* ------------------------------------------------------------------ *
 * Path safety
 * ------------------------------------------------------------------ */

/**
 * Resolve a caller-supplied relative path against the vault root, refusing
 * anything that escapes it. Every filesystem access goes through this - it is
 * the only thing between a JSON request body and an arbitrary file write.
 */
export function resolveVaultPath(vaultRoot: string, relPath: string): string {
  const rel = normalizeNotePath(relPath);
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
 * Reading
 * ------------------------------------------------------------------ */

/** Parsed notes keyed by path, invalidated on mtime change. */
const noteCache = new Map<string, { mtimeMs: number; note: VaultNoteDetail }>();

const cacheKey = (root: string, rel: string) => `${root}::${rel}`;

async function loadNote(root: string, rel: string): Promise<VaultNoteDetail | null> {
  const abs = path.join(root, rel);
  const key = cacheKey(root, rel);

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    noteCache.delete(key);
    return null;
  }

  const cached = noteCache.get(key);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.note;

  const raw = await fs.readFile(abs, { encoding: "utf-8" });
  const parsed = matter(raw);
  const note = buildNote(
    rel,
    (parsed.data ?? {}) as Record<string, unknown>,
    parsed.content ?? "",
    stat.mtimeMs,
    stat.size,
    stat.birthtimeMs,
  );
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

  // Drop entries for notes that no longer exist. Without this every path the
  // vault has ever held, including deleted and renamed notes, stays cached for
  // the life of the process.
  const prefix = cacheKey(root, "");
  const present = new Set(entries);
  for (const key of noteCache.keys()) {
    if (key.startsWith(prefix) && !present.has(key.slice(prefix.length))) {
      noteCache.delete(key);
    }
  }

  const loaded = await Promise.all(entries.map((rel) => loadNote(root, rel)));

  return sortNotesByDate(loaded.filter((n): n is VaultNoteDetail => n !== null));
}

/** Vault-relative paths currently held in the parse cache. Exposed for tests. */
export function cachedNotePaths(vaultRoot: string): string[] {
  const prefix = cacheKey(path.resolve(vaultRoot), "");
  return [...noteCache.keys()]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
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

/* ------------------------------------------------------------------ *
 * Editing
 * ------------------------------------------------------------------ */

/** Largest note the editor may save. */
export const MAX_NOTE_BYTES = 2 * 1024 * 1024;

/** A note's file exactly as stored, frontmatter included. */
export async function readRawNote(
  vaultRoot: string,
  relPath: string,
): Promise<{ path: string; content: string; mtime: number }> {
  const abs = resolveVaultPath(vaultRoot, relPath);
  const rel = toRelative(vaultRoot, abs);
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(abs, { encoding: "utf-8" }),
      fs.stat(abs),
    ]);
    return { path: rel, content, mtime: stat.mtimeMs };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError(`Note not found: ${rel}`, 404);
    }
    throw err;
  }
}

/**
 * Replace an existing note's whole file, refusing with 409 when its mtime is
 * no longer `expectedMtime`: someone (usually Obsidian) saved it since the
 * editor read it. Mirrors write_note in src-tauri/src/vault.rs, including the
 * write-beside-then-rename so a crash never leaves half a note.
 */
export async function saveNote(
  vaultRoot: string,
  relPath: string,
  content: unknown,
  expectedMtime: unknown,
): Promise<{ path: string; mtime: number }> {
  if (typeof content !== "string") throw new VaultError("content must be a string");
  if (typeof expectedMtime !== "number" || !Number.isFinite(expectedMtime)) {
    throw new VaultError("expectedMtime must be a number");
  }
  if (byteLength(content) > MAX_NOTE_BYTES) throw new VaultError("Note is too large", 413);

  const abs = resolveVaultPath(vaultRoot, relPath);
  const rel = toRelative(vaultRoot, abs);

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError(`Note not found: ${rel}`, 404);
    }
    throw err;
  }
  if (stat.mtimeMs !== expectedMtime) {
    throw new VaultError(`${rel} changed on disk. Try again.`, 409);
  }

  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.crystal-tmp`);
  await fs.writeFile(tmp, content, { encoding: "utf-8" });
  try {
    await fs.rename(tmp, abs);
  } catch {
    // Windows refuses the swap while another app holds the note open.
    await fs.rm(tmp, { force: true });
    await fs.writeFile(abs, content, { encoding: "utf-8" });
  }

  noteCache.delete(cacheKey(path.resolve(vaultRoot), rel));
  const written = await fs.stat(abs);
  return { path: rel, mtime: written.mtimeMs };
}

/**
 * Write a new note (The Orbit's review export), creating parent folders.
 * Refuses with 409 when the file already exists unless `overwrite` is true,
 * so the caller can ask before replacing it.
 */
export async function createNote(
  vaultRoot: string,
  relPath: string,
  content: unknown,
  overwrite: unknown,
): Promise<{ path: string; mtime: number; created: boolean }> {
  if (typeof content !== "string") throw new VaultError("content must be a string");
  if (byteLength(content) > MAX_NOTE_BYTES) throw new VaultError("Note is too large", 413);
  if (!/\.md$/i.test(relPath)) throw new VaultError("Only .md notes can be created");

  const abs = resolveVaultPath(vaultRoot, relPath);
  const rel = toRelative(vaultRoot, abs);

  let exists = false;
  try {
    exists = (await fs.stat(abs)).isFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (exists && overwrite !== true) {
    throw new VaultError(`${rel} already exists`, 409);
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.crystal-tmp`);
  await fs.writeFile(tmp, content, { encoding: "utf-8" });
  try {
    await fs.rename(tmp, abs);
  } catch {
    await fs.rm(tmp, { force: true });
    await fs.writeFile(abs, content, { encoding: "utf-8" });
  }

  noteCache.delete(cacheKey(path.resolve(vaultRoot), rel));
  const written = await fs.stat(abs);
  return { path: rel, mtime: written.mtimeMs, created: !exists };
}

/* ------------------------------------------------------------------ *
 * Quick add
 * ------------------------------------------------------------------ */

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
  { tags, now = new Date() }: AppendOptions = {},
): Promise<QuickAddResult> {
  const abs = resolveVaultPath(vaultRoot, relPath);
  const rel = toRelative(vaultRoot, abs);

  let existing: string | null = null;
  try {
    existing = await fs.readFile(abs, { encoding: "utf-8" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Validates text and tags before anything touches the disk.
  const plan = planQuickAdd(existing, rel, rawText, tags, now);

  await fs.mkdir(path.dirname(abs), { recursive: true });
  // Explicit encoding keeps emoji and other non-ASCII characters intact.
  await fs.writeFile(abs, plan.content, { encoding: "utf-8" });

  noteCache.delete(cacheKey(path.resolve(vaultRoot), rel));

  return {
    path: rel,
    created: plan.created,
    bytesWritten: byteLength(plan.chunk),
    tags: plan.tags,
    tagsAdded: plan.tagsAdded,
  };
}
