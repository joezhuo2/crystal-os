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
      const path = targets.get(target.trim().toLowerCase());
      // Unresolved links stay plain text rather than becoming dead anchors.
      return path ? `[${label}](#vault/${encodeURIComponent(path)})` : label;
    },
  );
}
