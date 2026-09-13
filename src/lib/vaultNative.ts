/**
 * Webview half of the desktop app's native vault (src-tauri/src/vault.rs).
 *
 * Rust owns the filesystem: it lists, reads, and writes `.md` files under the
 * vault root the user picked, and pushes change events. This module turns
 * those bytes into the same shapes the `/api/obsidian` middleware returns,
 * using the shared logic in vaultCore.ts. Like platform.ts, nothing from
 * `@tauri-apps/*` is imported at module level.
 */

import yaml from "js-yaml";
import {
  DEFAULT_NOTE_PATH,
  buildNote,
  byteLength,
  normalizeNotePath,
  planQuickAdd,
  sortNotesByDate,
  type QuickAddResult,
  type VaultNoteDetail,
} from "./vaultCore";

/** Emitted by Rust with a {@link VaultChange} when notes change on disk. */
export const VAULT_CHANGED_EVENT = "vault://changed";

/** Mirrors `ErrorCode` in src-tauri/src/vault.rs. */
export type VaultErrorCode =
  | "not_configured"
  | "missing"
  | "permission_denied"
  | "not_found"
  | "invalid_path"
  | "conflict"
  | "io";

/** Mirrors `VaultStatus` in src-tauri/src/vault.rs. */
export interface VaultStatus {
  /** The folder as picked, even when it is currently unavailable. */
  path: string | null;
  available: boolean;
  watching: boolean;
  error: { code: VaultErrorCode; message: string } | null;
}

/** Payload of {@link VAULT_CHANGED_EVENT}. */
export interface VaultChange {
  paths: string[];
  rootMissing: boolean;
}

interface VaultEntry {
  path: string;
  mtime: number;
  size: number;
}

interface VaultFile extends VaultEntry {
  content: string;
}

export class NativeVaultError extends Error {
  constructor(
    message: string,
    readonly code: VaultErrorCode,
  ) {
    super(message);
    this.name = "NativeVaultError";
  }
}

function toVaultError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const { code, message } = err as { code: VaultErrorCode; message: string };
    return new NativeVaultError(message, code);
  }
  return new NativeVaultError(String(err), "io");
}

/** Loaded once; a listing fires many reads at the same time. */
let tauriCore: Promise<typeof import("@tauri-apps/api/core")> | undefined;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  tauriCore ??= import("@tauri-apps/api/core");
  const core = await tauriCore;
  try {
    return await core.invoke<T>(cmd, args);
  } catch (err) {
    throw toVaultError(err);
  }
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

const FRONTMATTER_RE = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Split YAML frontmatter from the body, as gray-matter does on the server.
 * gray-matter needs Node, so this uses js-yaml directly. Frontmatter that is
 * not valid YAML is ignored rather than hiding the note.
 */
export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { data: {}, content: text };

  const content = text.slice(match[0].length);
  try {
    const data = yaml.load(match[1] ?? "");
    const isObject = data !== null && typeof data === "object" && !Array.isArray(data);
    return { data: isObject ? (data as Record<string, unknown>) : {}, content };
  } catch {
    return { data: {}, content };
  }
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** Parsed notes keyed by path, invalidated on mtime change. */
const noteCache = new Map<string, { mtime: number; note: VaultNoteDetail }>();

/** Parallel reads per batch; IPC calls are cheap but not free. */
const READ_CONCURRENCY = 16;

function parseFile(file: VaultFile): VaultNoteDetail {
  const { data, content } = parseFrontmatter(file.content);
  const note = buildNote(file.path, data, content, file.mtime, file.size);
  noteCache.set(file.path, { mtime: file.mtime, note });
  return note;
}

/** Every note in the vault, newest first. Only changed files are re-read. */
export async function listNotesNative(): Promise<VaultNoteDetail[]> {
  const entries = await invoke<VaultEntry[]>("list_vault");

  const present = new Set(entries.map((e) => e.path));
  for (const path of noteCache.keys()) {
    if (!present.has(path)) noteCache.delete(path);
  }

  const notes: VaultNoteDetail[] = [];
  const stale: VaultEntry[] = [];
  for (const entry of entries) {
    const cached = noteCache.get(entry.path);
    if (cached && cached.mtime === entry.mtime) notes.push(cached.note);
    else stale.push(entry);
  }

  for (let i = 0; i < stale.length; i += READ_CONCURRENCY) {
    const batch = stale.slice(i, i + READ_CONCURRENCY);
    const loaded = await Promise.all(
      batch.map((entry) =>
        invoke<VaultFile>("read_vault_file", { path: entry.path }).then(parseFile, (err) => {
          // Deleted between listing and reading: leave it out of this listing.
          if (err instanceof NativeVaultError && err.code === "not_found") return null;
          throw err;
        }),
      ),
    );
    for (const note of loaded) if (note) notes.push(note);
  }

  return sortNotesByDate(notes);
}

/** One note, including its body. Rejects with code `not_found` once deleted. */
export async function readNoteNative(notePath: string): Promise<VaultNoteDetail> {
  const path = normalizeNotePath(notePath);
  try {
    return parseFile(await invoke<VaultFile>("read_vault_file", { path }));
  } catch (err) {
    if (err instanceof NativeVaultError && err.code === "not_found") noteCache.delete(path);
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export interface NativeQuickAddInput {
  text: string;
  notePath?: string;
  tags?: string[];
}

/**
 * Append to a note through Rust. The write carries the mtime that was read,
 * so an edit Obsidian saves in between is detected and the append is redone
 * on top of it instead of clobbering it.
 */
export async function quickAddNative(
  { text, notePath, tags }: NativeQuickAddInput,
  now: Date = new Date(),
): Promise<QuickAddResult & { ok: true }> {
  const path = normalizeNotePath(notePath?.trim() || DEFAULT_NOTE_PATH);

  for (let attempt = 0; ; attempt++) {
    let existing: VaultFile | null = null;
    try {
      existing = await invoke<VaultFile>("read_vault_file", { path });
    } catch (err) {
      if (!(err instanceof NativeVaultError && err.code === "not_found")) throw err;
    }

    const plan = planQuickAdd(existing?.content ?? null, path, text, tags, now);

    try {
      const written = await invoke<{ path: string }>("write_vault_file", {
        path,
        content: plan.content,
        expectedMtime: existing?.mtime ?? null,
      });
      noteCache.delete(written.path);
      return {
        ok: true,
        path: written.path,
        created: plan.created,
        bytesWritten: byteLength(plan.chunk),
        tags: plan.tags,
        tagsAdded: plan.tagsAdded,
      };
    } catch (err) {
      const retry = err instanceof NativeVaultError && err.code === "conflict" && attempt < 2;
      if (!retry) throw err;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Vault folder and live updates
 * ------------------------------------------------------------------ */

export function getVaultStatus(): Promise<VaultStatus> {
  return invoke<VaultStatus>("get_vault_status");
}

/** Open the native folder picker. Resolves to null when cancelled. */
export async function pickVault(): Promise<VaultStatus | null> {
  const status = await invoke<VaultStatus | null>("pick_vault");
  // A different vault: nothing cached belongs to it.
  if (status) noteCache.clear();
  return status;
}

/** Subscribe to on-disk changes. Returns an unsubscribe function. */
export function onVaultChanged(listener: (change: VaultChange) => void): () => void {
  let cancelled = false;
  let unlisten: (() => void) | undefined;

  import("@tauri-apps/api/event").then(({ listen }) =>
    listen<VaultChange>(VAULT_CHANGED_EVENT, (event) => {
      for (const path of event.payload.paths) noteCache.delete(path);
      if (event.payload.rootMissing) noteCache.clear();
      listener(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    }),
  );

  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Test hook: drop every parsed note. */
export function clearNativeVaultCache() {
  noteCache.clear();
}
