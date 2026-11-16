const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], prev2[j - 2] + 1);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

const typosAllowed = (token: string) => (token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0);

function tokenScore(token: string, word: string): number {
  if (word === token) return 1;
  if (word.startsWith(token)) return 0.9;
  if (word.includes(token)) return 0.8;
  const max = typosAllowed(token);
  if (!max) return 0;
  const candidates = [word, word.slice(0, token.length), word.slice(0, token.length + 1)];
  return candidates.some((c) => editDistance(token, c, max) <= max) ? 0.5 : 0;
}

export function fuzzyScore(query: string, text: string): number {
  const tokens = words(query);
  if (!tokens.length) return 0;
  if (text.toLowerCase().includes(query.trim().toLowerCase())) return 1;
  const targets = words(text);
  let total = 0;
  for (const token of tokens) {
    const best = Math.max(0, ...targets.map((word) => tokenScore(token, word)));
    if (!best) return 0;
    total += best;
  }
  return (total / tokens.length) * 0.95;
}

export function fuzzyRank<T>(query: string, items: readonly T[], text: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, text(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
