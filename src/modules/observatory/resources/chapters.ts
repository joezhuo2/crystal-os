import type { Topic } from "../model";
import type { Extracted, PdfBookmark, PdfDoc, PdfPage, TextItem } from "./types";

export interface Line { page: number; text: string; x: number; y: number; w: number; h: number }
export interface Chapter { number: string; title: string; startPage: number; endPage: number }
export type ChapterSource = "bookmarks" | "chapter-headings" | "section-headings" | "none";
export type ChapterResult = Extracted<Chapter[]> & { source: ChapterSource };

export function pageLines(p: PdfPage): Line[] {
  const items = p.items.filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; h: number; items: TextItem[] }[] = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(it.y - last.y) <= Math.max(last.h, it.h) * 0.5) {
      last.items.push(it);
      last.h = Math.max(last.h, it.h);
    } else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  return rows.map((r) => {
    const its = r.items.sort((a, b) => a.x - b.x);
    let text = "";
    let end = -Infinity;
    for (const it of its) {
      text += (text && it.x - end > it.h * 0.15 ? " " : "") + it.str;
      end = it.x + it.w;
    }
    const x = its[0]!.x;
    return { page: p.index, text: text.replace(/\s+/g, " ").trim(), x, y: Math.min(...its.map((i) => i.y)), w: end - x, h: r.h };
  });
}

export const docLines = (doc: PdfDoc): Line[] => doc.pages.flatMap(pageLines);

export function bodyHeight(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const h = Math.round(l.h * 2) / 2;
    weight.set(h, (weight.get(h) ?? 0) + l.text.length);
  }
  let best = 0;
  let max = -1;
  for (const [h, w] of weight) if (w > max) [best, max] = [h, w];
  return best;
}

export const isHeadingSize = (l: Line, body: number) => l.h >= body * 1.12;

const SECTION = /^(\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+([A-Z(][^=<>+^]{1,79})$/;
const CHAPTER = /^chapter\s+(\d+)\s*[:.\-–—]?\s*(.*)$/i;
const LEADER = /(\.\s*){3,}\d+$/;

export function sectionHeading(l: Line, body: number): { number: string; title: string } | null {
  if (!isHeadingSize(l, body)) return null;
  const m = SECTION.exec(l.text);
  if (!m || LEADER.test(l.text) || (m[2]!.match(/[A-Za-z]/g)?.length ?? 0) < 3 || /\.$/.test(m[2]!)) return null;
  return { number: m[1]!, title: m[2]!.trim() };
}

const parts = (n: string) => n.split(".").map(Number);
export function compare(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  return 0;
}

function withRanges(found: { number: string; title: string; startPage: number }[], lastPage: number): Chapter[] {
  const sorted = [...found].sort((a, b) => a.startPage - b.startPage);
  return sorted.map((c, i) => ({ ...c, endPage: Math.max(c.startPage, (sorted[i + 1]?.startPage ?? lastPage + 1) - 1) }));
}

function increasing<T extends { number: string }>(found: T[]): T[] {
  const out: T[] = [];
  for (const f of found) if (!out.length || compare(f.number, out[out.length - 1]!.number) > 0) out.push(f);
  return out;
}

function fromBookmarks(outline: PdfBookmark[]) {
  let level = outline;
  while (level.length === 1 && level[0]!.children.length) level = level[0]!.children;
  const parsed = level.map((b, i) => {
    const m = /^(?:chapter\s+)?(\d+(?:\.\d+)*)\.?\s*[:.\-–—]?\s*(.*)$/i.exec(b.title.trim());
    return { numbered: !!m, number: m ? m[1]! : String(i + 1), title: (m?.[2] || b.title).trim(), startPage: b.page };
  });
  const numbered = parsed.filter((p) => p.numbered);
  return (numbered.length >= 2 ? numbered : parsed).map(({ numbered: _n, ...c }) => c);
}

function fromChapterHeadings(lines: Line[], body: number) {
  const found: { number: string; title: string; startPage: number }[] = [];
  lines.forEach((l, i) => {
    const m = CHAPTER.exec(l.text);
    if (!m || LEADER.test(l.text)) return;
    const top = lines.slice(Math.max(0, i - 2), i).every((p) => p.page !== l.page);
    if (!isHeadingSize(l, body) && !top) return;
    const next = lines[i + 1];
    const title = m[2]!.trim() || (next && next.page === l.page ? next.text : "");
    found.push({ number: m[1]!, title, startPage: l.page });
  });
  return increasing(found);
}

function fromSectionHeadings(lines: Line[], body: number) {
  const found = lines.flatMap((l) => {
    const s = sectionHeading(l, body);
    return s ? [{ ...s, startPage: l.page }] : [];
  });
  const depths = [...new Set(found.map((f) => parts(f.number).length))].sort();
  const depth = depths.find((d) => found.filter((f) => parts(f.number).length === d).length >= 2);
  return depth ? increasing(found.filter((f) => parts(f.number).length === depth)) : [];
}

export function detectChapters(doc: PdfDoc): ChapterResult {
  const lastPage = doc.pages[doc.pages.length - 1]?.index ?? 0;
  if (doc.outline.length) {
    const found = fromBookmarks(doc.outline);
    if (found.length >= 2) return { value: withRanges(found, lastPage), confidence: 0.95, source: "bookmarks" };
  }
  const lines = docLines(doc);
  const body = bodyHeight(lines);
  const chapters = fromChapterHeadings(lines, body);
  if (chapters.length >= 2) return { value: withRanges(chapters, lastPage), confidence: 0.85, source: "chapter-headings" };
  const sections = fromSectionHeadings(lines, body);
  if (sections.length >= 2) return { value: withRanges(sections, lastPage), confidence: sections.length >= 3 ? 0.7 : 0.5, source: "section-headings" };
  return { value: [], confidence: 0, source: "none" };
}

export const chapterAt = (chapters: Chapter[], page: number) => chapters.find((c) => page >= c.startPage && page <= c.endPage);

export type LinkableTopic = Pick<Topic, "slug" | "title"> & { pages?: string; sections?: string[]; chapters?: (number | string)[] };
export interface LinkTarget { chapter?: string; page?: number; text?: string }

export function parsePageRange(s: string): [number, number][] {
  return [...s.matchAll(/(\d+)\s*(?:[-–]\s*(\d+))?/g)].map((m) => [Number(m[1]), Number(m[2] ?? m[1])]);
}

const STOP = new Set(["with", "from", "that", "this", "into", "their", "using", "part"]);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));

export function linkTopic(topics: LinkableTopic[], target: LinkTarget): string | null {
  const ch = target.chapter;
  if (ch) {
    const hit = topics.find((t) =>
      (t.chapters ?? []).some((c) => ch === String(c) || ch.startsWith(`${c}.`)) || (t.sections ?? []).includes(ch));
    if (hit) return hit.slug;
  }
  const page = target.page;
  if (page !== undefined) {
    const hit = topics.find((t) => t.pages && parsePageRange(t.pages).some(([a, b]) => page >= a && page <= b));
    if (hit) return hit.slug;
  }
  if (!target.text) return null;
  const text = words(target.text);
  const scored = topics
    .map((t) => {
      const title = words(t.title);
      return { slug: t.slug, score: title.size ? [...title].filter((w) => text.has(w)).length / title.size : 0 };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  return best && best.score >= 0.5 && best.score > (second?.score ?? 0) ? best.slug : null;
}
