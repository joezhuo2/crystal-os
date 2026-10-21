export const LAST_VERSION_KEY = "crystal-os-last-version";

const HEADING = /^## \[v?(\d+(?:\.\d+)*)\][^\n]*$/gm;

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export function changelogSince(markdown: string, from: string, to: string): string {
  const heads = [...markdown.matchAll(HEADING)];
  return heads
    .map((head, i) => ({
      version: head[1],
      text: markdown.slice(head.index, heads[i + 1]?.index ?? markdown.length).trim(),
    }))
    .filter(({ version }) => compareVersions(version, from) > 0 && compareVersions(version, to) <= 0)
    .map(({ text }) => text)
    .join("\n\n");
}

export function takeUpdatedFrom(current: string): string | null {
  try {
    const last = localStorage.getItem(LAST_VERSION_KEY);
    localStorage.setItem(LAST_VERSION_KEY, current);
    return last && compareVersions(current, last) > 0 ? last : null;
  } catch {
    return null;
  }
}
