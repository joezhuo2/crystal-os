import yaml from "js-yaml";
import type { PdfDoc, PdfPage, Region, TextItem } from "./types";
import { UNCLEAR_BELOW } from "./types";
import { textConfidence } from "./confidence";

export interface Line { raw: string; text: string; x: number; y: number; w: number; h: number; items: TextItem[] }
export interface SlidePoint { text: string; level: number; code?: boolean }
export interface Slide { numbers: number[]; title: string; points: SlidePoint[]; regions: Region[] }
export interface DraftCard { front: string; back: string; slide: number; region: Region; confidence: number }
export interface OcrFlag { page: number; region: Region; text: string; confidence: number; unclear: boolean; ai?: boolean }
export interface LectureNote { title: string; handout: boolean; goals: string[]; slides: Slide[]; cards: DraftCard[]; ocr: OcrFlag[] }

export const BULLET = /^(?:[\uE000-\uF8FF\uFFFD\u2022\u25AA\u25E6\u2023\u25CF\u25CB\u25A0\u25A1\u27A2\u25BA\u2013*-]\s*|\d{1,2}[.)]\s+)/;
const CODE = /[;{}]\s*$|^(?:\/\/|#include\b|(?:int|char|unsigned|double|bool|void|auto|return|std::\w+)\b|(?:for|while|if|switch)\s*\()/;
const NUM = /^\d{1,3}$/;
const DEF = /^((?:an?|the)\s+)?([A-Za-z][\w+#'-]*(?:\s+[\w+#'-]+){0,4}?)\s+(is|are)\s+((?:an?|the|one)\s+.+)$/i;
const PRONOUN = new Set(["it", "this", "that", "there", "these", "those", "they", "which", "what", "who", "here", "each", "all", "one", "he", "she", "we", "you", "how", "why", "when", "where"]);

const charW = (it: TextItem) => it.w / Math.max(1, it.str.length);
const page1 = (p: PdfPage): Region => ({ page: p.index, x: 0, y: 0, w: p.width, h: p.height });

function makeLine(items: TextItem[]): Line {
  items.sort((a, b) => a.x - b.x);
  let raw = "";
  let end = -Infinity;
  for (const it of items) {
    const gap = it.x - end;
    if (raw && gap > charW(it) * 0.3 && !/\s$/.test(raw) && !/^\s/.test(it.str)) raw += " ".repeat(Math.max(1, Math.round(gap / charW(it))));
    raw += it.str;
    end = Math.max(end, it.x + it.w);
  }
  const x = items[0].x;
  return { raw, text: raw.replace(/\s+/g, " ").trim(), x, y: Math.min(...items.map((i) => i.y)), w: end - x, h: Math.max(...items.map((i) => i.h)), items };
}

export function toLines(items: TextItem[]): Line[] {
  const rows: TextItem[][] = [];
  for (const it of items.filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = rows.at(-1);
    if (last && Math.abs(it.y - last[0].y) <= Math.max(last[0].h, it.h) * 0.5) last.push(it);
    else rows.push([it]);
  }
  return rows.map(makeLine);
}

function segments(line: Line): Line[] {
  const out: TextItem[][] = [[]];
  let end = -Infinity;
  for (const it of line.items) {
    if (out[0].length && it.x - end > line.h * 3) out.unshift([]);
    out[0].push(it);
    end = Math.max(end, it.x + it.w);
  }
  return out.reverse().map(makeLine);
}

interface Anchor { title: Line; num: Line; n: number }

function candidates(p: PdfPage): Anchor[] {
  const segs = toLines(p.items).flatMap(segments);
  const out: Anchor[] = [];
  for (const num of segs.filter((s) => NUM.test(s.text))) {
    const title = segs
      .filter((s) => !NUM.test(s.text) && num.y - s.y >= -s.h * 0.5 && num.y - s.y <= s.h * 3 && Math.abs(num.x + num.w / 2 - (s.x + s.w / 2)) < p.width / 4)
      .sort((a, b) => Math.abs(num.y - a.y) - Math.abs(num.y - b.y))[0];
    if (title) out.push({ title, num, n: Number(num.text) });
  }
  return out;
}

function cluster(values: number[], tol: number): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

interface Cell { page: number; n?: number; region: Region; lines: Line[] }

function pageCells(p: PdfPage, anchors: Anchor[]): Cell[] {
  const used = new Set(anchors.flatMap((a) => [...a.title.items, ...a.num.items]));
  const items = p.items.filter((i) => !used.has(i));
  if (anchors.length < 2) return [{ page: p.index, n: anchors[0]?.n, region: page1(p), lines: toLines(items) }];
  const h = anchors[0].title.h;
  const cols = cluster(anchors.map((a) => a.title.x + a.title.w / 2), p.width / 8).length;
  const rowY = cluster(anchors.map((a) => a.title.y), h * 2);
  const cw = p.width / cols;
  const cellH = rowY.length > 1 ? rowY[1] - rowY[0] : p.height;
  const first = rowY[0];
  const last = rowY[rowY.length - 1];
  const above = items.filter((i) => i.y < first && i.y >= first - cellH).length;
  const below = items.filter((i) => i.y > last && i.y <= last + cellH).length;
  const header = below >= above;
  const rowOf = (y: number) => {
    if (header) return y < first - h * 0.5 || y > last + cellH ? -1 : rowY.filter((r) => r <= y + h * 0.5).length - 1;
    if (y < first - cellH || y > last + h * 0.5) return -1;
    return rowY.findIndex((r) => r >= y - h * 0.5);
  };
  const colOf = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor(x / cw)));
  const cells = new Map<string, { a: Anchor; r: number; c: number; items: TextItem[] }>();
  for (const a of anchors) {
    const r = rowY.findIndex((y) => Math.abs(y - a.title.y) <= h * 2);
    const c = colOf(a.title.x + a.title.w / 2);
    cells.set(`${r},${c}`, { a, r, c, items: [] });
  }
  for (const it of items) cells.get(`${rowOf(it.y)},${colOf(it.x + it.w / 2)}`)?.items.push(it);
  return [...cells.values()].map(({ a, r, c, items: cellItems }) => {
    const y = Math.max(0, header ? rowY[r] - h : rowY[r] - cellH + h);
    return { page: p.index, n: a.n, region: { page: p.index, x: c * cw, y, w: cw, h: Math.min(cellH, p.height - y) }, lines: toLines(cellItems) };
  });
}

const norm = (s: string) => s.replace(/\d+/g, "#").toLowerCase();

function parsePoints(lines: Line[]): SlidePoint[] {
  const points: (SlidePoint & { lines?: Line[] })[] = [];
  const bulletXs = cluster(lines.filter((l) => BULLET.test(l.text)).map((l) => l.x), lines[0]?.h ?? 1);
  for (const l of lines) {
    const prev = points[points.length - 1];
    const bullet = BULLET.test(l.text);
    if (!bullet && (CODE.test(l.text) || (prev?.lines && l.x >= Math.min(...prev.lines.map((p) => p.x)) - l.h))) {
      if (prev?.lines) prev.lines.push(l);
      else points.push({ text: "", level: Math.max(0, bulletXs.filter((x) => x < l.x).length - 1), code: true, lines: [l] });
      continue;
    }
    const text = l.text.replace(BULLET, "").trim();
    if (!bullet && prev && !prev.code) prev.text += ` ${text}`;
    else points.push({ text, level: Math.max(0, bulletXs.filter((x) => x <= l.x + l.h * 0.5).length - 1) });
  }
  return points.map(({ lines: code, ...p }) => {
    if (!code) return p;
    const left = Math.min(...code.map((l) => l.x));
    const its = code.flatMap((l) => l.items);
    const cw = its.reduce((s, i) => s + charW(i), 0) / its.length;
    return { ...p, text: code.map((l) => " ".repeat(Math.round((l.x - left) / cw)) + l.raw.trimEnd()).join("\n") };
  });
}

function definition(text: string): { front: string; back: string } | null {
  const m = /[:?]$/.test(text) ? null : DEF.exec(text);
  if (!m) return null;
  const [, art = "", subject, verb] = m;
  if (!art && PRONOUN.has(subject.split(/\s+/)[0].toLowerCase())) return null;
  return { front: `What ${verb.toLowerCase()} ${art.toLowerCase()}${subject}?`, back: text };
}

export function extractSlides(doc: PdfDoc): LectureNote {
  const textPages = doc.pages.filter((p) => p.items.some((i) => i.str.trim()));
  const ocr: OcrFlag[] = doc.pages
    .filter((p) => !textPages.includes(p))
    .map((p) => {
      const confidence = p.ocr?.confidence ?? 0;
      return { page: p.index, region: page1(p), text: p.ocr?.text ?? "", confidence, unclear: confidence < UNCLEAR_BELOW, ...(p.ocr?.ai && { ai: true }) };
    });

  const perPage = textPages.map((p) => [p, candidates(p)] as const);
  const counts = new Map<string, number>();
  for (const [, cs] of perPage) for (const c of cs) counts.set(c.title.text, (counts.get(c.title.text) ?? 0) + 1);
  const [deckTitle] = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0] ?? [];
  const cells = perPage.flatMap(([p, cs]) => pageCells(p, cs.filter((c) => c.title.text === deckTitle)));
  const handout = perPage.some(([, cs]) => cs.filter((c) => c.title.text === deckTitle).length >= 2);

  const seen = new Map<string, number>();
  for (const c of cells) for (const t of new Set(c.lines.map((l) => norm(l.text)))) seen.set(t, (seen.get(t) ?? 0) + 1);
  const limit = Math.max(3, Math.ceil(cells.length * 0.5));
  let prevN = 0;
  const numbered = cells.map((c) => {
    const lines = c.lines.filter((l) => (seen.get(norm(l.text)) ?? 0) < limit);
    while (lines.length && NUM.test(lines[lines.length - 1].text)) lines.pop();
    while (lines.length && NUM.test(lines[0].text)) lines.shift();
    prevN = c.n ?? prevN + 1;
    return { ...c, n: prevN, lines };
  });
  numbered.sort((a, b) => a.n - b.n);

  const slides: Slide[] = [];
  for (const c of numbered.filter((c) => c.lines.length)) {
    const title = c.lines[0].text.replace(BULLET, "").trim();
    const points = parsePoints(c.lines.slice(1));
    const prev = slides[slides.length - 1];
    if (prev && prev.title.toLowerCase() === title.toLowerCase()) {
      prev.numbers.push(c.n);
      prev.points.push(...points);
      prev.regions.push(c.region);
    } else slides.push({ numbers: [c.n], title, points, regions: [c.region] });
  }

  const goals: string[] = [];
  for (const s of slides) {
    const intro = s.points.findIndex((p) => /in this presentation,? we will/i.test(p.text));
    if (intro < 0 && !/^(outline|overview)$/i.test(s.title)) continue;
    goals.push(...s.points.slice(intro + 1).filter((p) => !p.code).map((p) => p.text));
  }

  const cards: DraftCard[] = [];
  for (const s of slides) {
    for (const p of s.points) {
      const d = p.code ? null : definition(p.text);
      if (d) cards.push({ ...d, slide: s.numbers[0], region: s.regions[0], confidence: textConfidence(p.text).confidence });
    }
  }

  return { title: deckTitle ?? doc.title ?? slides[0]?.title ?? "", handout, goals, slides, cards, ocr };
}

const pageRef = (pages: number[]) => {
  const u = [...new Set(pages)].sort((a, b) => a - b);
  return u.length > 1 ? `pp. ${u[0]}-${u[u.length - 1]}` : `p. ${u[0]}`;
};

export function lectureMarkdown(note: LectureNote, source?: string, ai?: { summary: string; keyPoints: string[] }): string {
  const fm = { type: "slides", title: note.title, ...(source && { source: `[[${source}]]` }), slides: note.slides.length, ...(note.ocr.length && { needs_ocr: note.ocr.map((o) => o.page) }) };
  const out = [`# ${note.title}`, ""];
  if (ai && (ai.summary || ai.keyPoints.length)) {
    out.push("## Summary (AI, unverified)", "");
    if (ai.summary) out.push(ai.summary, "");
    if (ai.keyPoints.length) out.push(...ai.keyPoints.map((p) => `- ${p}`), "");
  }
  if (note.goals.length) out.push("## Goals", "", ...note.goals.map((g) => `- ${g}`), "");
  out.push("## Key points", "");
  for (const s of note.slides) {
    const nums = s.numbers.length > 1 ? `${s.numbers[0]}-${s.numbers[s.numbers.length - 1]}` : `${s.numbers[0]}`;
    out.push(`### ${nums}. ${s.title} (${pageRef(s.regions.map((r) => r.page))})`, "");
    for (const p of s.points) {
      const pad = "  ".repeat(p.level);
      out.push(p.code ? `${pad}\`\`\`\n${p.text.replace(/^/gm, pad)}\n${pad}\`\`\`` : `${pad}- ${p.text}`);
    }
    if (s.points.length) out.push("");
  }
  if (note.cards.length) out.push("## Definitions", "", ...note.cards.map((c) => `- **${c.front}** ${c.back} (${pageRef([c.region.page])})`), "");
  if (note.ocr.length) {
    out.push("## Unclear pages", "");
    for (const o of note.ocr) {
      if (!o.ai) out.push(`- ${pageRef([o.page])}: ${o.text || "needs OCR"} (Unclear)`);
      else out.push("", `### ${pageRef([o.page])} (AI, unverified)`, "", ...(source ? [`![[${source}#page=${o.page}]]`, ""] : []), o.text, "");
    }
    out.push("");
  }
  return `---\n${yaml.dump(fm, { lineWidth: -1 })}---\n${out.join("\n")}`;
}
