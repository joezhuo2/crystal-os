import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

/**
 * Minimal read/upsert access to `.env.local`.
 *
 * The file is treated as raw UTF-8 text rather than a parsed object: a
 * parse-and-reserialize round trip would drop comments and reorder keys, and
 * this file is hand-maintained (it already holds OBSIDIAN_VAULT_PATH). Only the
 * single line for the target key is ever rewritten. `dotenv.parse` is used for
 * reading a value back, never for writing.
 */

const ENV_FILE = ".env.local";

function envPath(cwd: string): string {
  return path.join(cwd, ENV_FILE);
}

async function readRaw(cwd: string): Promise<string | null> {
  try {
    return await readFile(envPath(cwd), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * The file's dominant line ending. A file with no newline yet (new, or a single
 * unterminated line) gets "\n" rather than the platform's, so a repo checked out
 * on Windows does not acquire CRLF in a file that had none.
 */
function detectEol(raw: string): string {
  if (raw.includes("\r\n")) return "\r\n";
  return "\n";
}

function keyPattern(key: string): RegExp {
  // Tolerates leading whitespace and `export KEY=`, matching dotenv's own rules.
  return new RegExp(String.raw`^\s*(?:export\s+)?${key}\s*=`);
}

/** Current value of `key` in .env.local, or null when unset. */
export async function readEnvValue(
  cwd: string,
  key: string,
): Promise<string | null> {
  const raw = await readRaw(cwd);
  if (raw === null) return null;
  const parsed = dotenv.parse(raw);
  const value = parsed[key];
  return value ? value : null;
}

/**
 * Replace `key`'s line in place, or append one. Every other line — comments,
 * blanks, other keys — survives byte-identical, and the file's own line ending
 * and trailing-newline habit are preserved.
 */
export async function upsertEnvValue(
  cwd: string,
  key: string,
  value: string,
): Promise<void> {
  const raw = (await readRaw(cwd)) ?? "";
  const eol = detectEol(raw);
  const endsWithNewline = raw.length === 0 || /\r?\n$/.test(raw);

  // Split on either ending so a mixed file still parses; rejoin with `eol`.
  const lines = raw.length ? raw.split(/\r?\n/) : [];
  // A trailing newline yields a final empty element — drop it, then restore it
  // through `endsWithNewline` so the file's shape is unchanged.
  if (endsWithNewline && lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const pattern = keyPattern(key);
  const index = lines.findIndex((line) => pattern.test(line));
  const next = `${key}=${value}`;

  if (index >= 0) lines[index] = next;
  else lines.push(next);

  const body = lines.join(eol) + (endsWithNewline ? eol : "");
  await writeFile(envPath(cwd), body, "utf-8");
}

/** Drop `key`'s line entirely. A no-op when the key is absent. */
export async function removeEnvValue(cwd: string, key: string): Promise<void> {
  const raw = await readRaw(cwd);
  if (raw === null) return;

  const eol = detectEol(raw);
  const endsWithNewline = /\r?\n$/.test(raw);
  const lines = raw.split(/\r?\n/);
  if (endsWithNewline && lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const pattern = keyPattern(key);
  const kept = lines.filter((line) => !pattern.test(line));
  if (kept.length === lines.length) return;

  const body = kept.join(eol) + (endsWithNewline && kept.length ? eol : "");
  await writeFile(envPath(cwd), body, "utf-8");
}
