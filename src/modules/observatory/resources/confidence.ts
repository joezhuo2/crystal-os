export interface TextConfidence { confidence: number; reasons: string[]; needsOcr: boolean }

const MIN_TEXT_CHARS = 20;

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function numberingBreaks(text: string): number {
  const nums = [...text.matchAll(/^\s*(\d{1,3})[.)]\s/gm)].map((m) => Number(m[1]));
  let breaks = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) breaks++;
  return breaks;
}

export function textConfidence(text: string): TextConfidence {
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) return { confidence: 0, reasons: ["no text layer"], needsOcr: true };

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const singleCharLines = lines.filter((l) => /^[A-Za-z0-9](\s+[A-Za-z0-9])*$/.test(l)).length;
  const checks: [number, number, number, string][] = [
    [count(text, /�/g), 0.15, 0.5, "replacement characters"],
    [count(text, /[-]/g), 0.1, 0.4, "private-use glyphs"],
    [count(text, /\(\s+\)|\[\s+\]|[([]\s*-?\s*,|,\s*[)\]]/g), 0.1, 0.3, "empty brackets"],
    [count(text, /=\s*=|=[ \t]*$|^[ \t]*=/gm), 0.1, 0.3, "orphan equals signs"],
    [count(text, /(?<=^|\s)[A-Za-z0-9] {2,3}(?=[\w[(])/gm), 0.05, 0.2, "gaps where symbols were lost"],
    [singleCharLines / lines.length > 0.1 ? singleCharLines : 0, 0.05, 0.3, "lines of single characters"],
    [numberingBreaks(text), 0.1, 0.3, "broken numbering"],
  ];

  let confidence = 1;
  const reasons: string[] = [];
  for (const [n, each, cap, reason] of checks) {
    if (n === 0) continue;
    confidence -= Math.min(cap, n * each);
    reasons.push(`${n} ${reason}`);
  }
  return { confidence: Math.max(0, Math.round(confidence * 100) / 100), reasons, needsOcr: false };
}

const GARBLE_SIGNS: RegExp[] = [
  /[∫∑∏√]\s+\S(?=\s|$)/g,
  /[∫∑∏√]\s*$/gm,
  /[∫∑∏]\S(?=\s|$)/g,
  /(?<=\s)6=(?=\s)/g,
  /=\s+(?:for|where|if|when)\b|=\s*[.,](?=\s|$)/g,
  /\(\s+\)|\[\s+\]/g,
  /(?<=^|\s)(?:[A-Za-z0-9]\s+){2,}[A-Za-z0-9](?=\s|$)/g,
  /(?<=^|\s)[.,]\s+[A-Za-z0-9](?=\s)/g,
];

// pdf.js flattens two-dimensional equations into stray operators and runs of lone symbols.
export function isMathGarbled(text: string): boolean {
  const plain = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`]*`/g, " ");
  return GARBLE_SIGNS.reduce((n, re) => n + count(plain, re), 0) >= 2;
}
