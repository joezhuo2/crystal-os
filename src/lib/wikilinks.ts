/**
 * Obsidian wikilinks for The Archive's reader. Targets are looked up in a map
 * built once per listing, so rendering a note costs one lookup per link
 * instead of a scan of every note per link.
 */

interface LinkableNote {
  path: string;
  title: string;
}

/**
 * Wikilink target (lowercased) to note path. A link matches a note by title,
 * by its path without ".md", or by any trailing part of that path after a
 * "/". The first note in list order wins, as a linear search would pick.
 */
export function buildLinkTargets(notes: LinkableNote[]): Map<string, string> {
  const targets = new Map<string, string>();
  const add = (key: string, path: string) => {
    if (!targets.has(key)) targets.set(key, path);
  };
  for (const note of notes) {
    add(note.title.toLowerCase(), note.path);
    const lower = note.path.toLowerCase();
    if (!lower.endsWith(".md")) continue;
    const stem = lower.slice(0, -3);
    add(stem, note.path);
    for (let i = stem.indexOf("/"); i !== -1; i = stem.indexOf("/", i + 1)) {
      add(stem.slice(i + 1), note.path);
    }
  }
  return targets;
}

/** Rewrite wikilinks to `#vault/<path>` anchors; unresolved ones become plain text. */
export function resolveWikilinks(content: string, targets: Map<string, string>): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, alias?: string) => {
      const label = (alias ?? target).trim();
      // "[[Note#Heading]]" opens the note; the reader has no heading anchors.
      const path = targets.get(target.split("#")[0].trim().toLowerCase());
      // Unresolved links stay plain text rather than becoming dead anchors.
      return path ? `[${label}](#vault/${encodeURIComponent(path)})` : label;
    },
  );
}

interface ConnectableNote extends LinkableNote {
  /** Lowercased wikilink targets; absent on listings cached before v0.10.2. */
  links?: string[];
}

export interface NoteConnections<T> {
  /** Notes this note links to, in the order they first appear. */
  outgoing: T[];
  /** Notes that link to this note, in list order. */
  backlinks: T[];
}

/**
 * A note's resolved connections. Self-links and unresolved targets are
 * dropped; a note that both links and is linked appears in both lists.
 */
export function noteConnections<T extends ConnectableNote>(
  path: string,
  links: string[],
  notes: T[],
  targets: Map<string, string>,
): NoteConnections<T> {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const outgoing: T[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const target = targets.get(link);
    if (!target || target === path || seen.has(target)) continue;
    const note = byPath.get(target);
    if (!note) continue;
    seen.add(target);
    outgoing.push(note);
  }
  const backlinks = notes.filter(
    (n) => n.path !== path && (n.links ?? []).some((link) => targets.get(link) === path),
  );
  return { outgoing, backlinks };
}

interface CategorisedNote {
  path: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
}

/**
 * A note's categories: its tags plus any `categories`/`category` frontmatter,
 * where values may be plain names or wikilinks ("[[Books]]"). Lowercased.
 */
export function noteCategories(note: Pick<CategorisedNote, "tags" | "frontmatter">): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => {
    const name = String(value)
      .replace(/^\[\[|\]\]$/g, "")
      .split("|")[0]
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    if (name) out.add(name);
  };
  note.tags.forEach(add);
  for (const key of ["categories", "category"]) {
    const raw = note.frontmatter?.[key];
    if (raw === null || raw === undefined || raw === "") continue;
    (Array.isArray(raw) ? raw : String(raw).split(",")).forEach(add);
  }
  return [...out];
}

export interface RelatedNote<T> {
  note: T;
  /** Categories this note shares with the current one. */
  shared: string[];
}

/** Other notes sharing any category with this one, most shared first. */
export function relatedByCategory<T extends CategorisedNote>(
  current: Pick<CategorisedNote, "path" | "tags" | "frontmatter">,
  notes: T[],
): RelatedNote<T>[] {
  const mine = new Set(noteCategories(current));
  if (mine.size === 0) return [];
  const related: RelatedNote<T>[] = [];
  for (const note of notes) {
    if (note.path === current.path) continue;
    const shared = noteCategories(note).filter((c) => mine.has(c));
    if (shared.length) related.push({ note, shared });
  }
  // Stable sort keeps list order (newest first) within the same overlap.
  return related.sort((a, b) => b.shared.length - a.shared.length);
}
