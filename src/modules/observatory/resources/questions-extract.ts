import { bodyHeight, chapterAt, compare, docLines, isHeadingSize, type Chapter, type Line } from "./chapters";
import type { QuestionType } from "../questions";
import { isMathGarbled, textConfidence } from "./confidence";
import { UNCLEAR_BELOW, type PdfDoc, type Region } from "./types";

export type AnswerSource = "book" | "sheet" | "ai-unverified";
export interface ExtractedQuestion {
  number: string; parent?: string; chapter?: string; text: string; answer?: string; answer_source?: AnswerSource;
  page: number; region: Region; confidence: number; tags: string[]; qtype?: QuestionType; ai_log?: string;
}
export interface ExtractOptions { sheet?: boolean; chapters?: Chapter[] }

interface Part { letter?: string; text: string[]; lines: Line[]; answer: string[] }
interface Draft { number: string; chapter?: string; stem: Part; subs: Part[]; answer: string[] }

const EXERCISES = /^(?:(\d+(?:\.\d+)*)\s+)?(?:practice problems|review questions|suggested exercises|suggested problems|exercises|problems)(?:\s+(?:for\s+)?(?:section\s+|§\s*)?(\d+(?:\.\d+)*))?\s*:?$/i;
const ANSWERS = /^(?:(?:appendix\s+)?[A-Z]\s+)?(?:answers to (?:the )?(?:odd|selected)[- ]numbered (?:exercises|problems)|selected answers|(?:answers|solutions) to (?:the )?(?:exercises|problems)|answers|solutions)\s*:?$/i;
const ANSWER_CHAPTER = /^(?:chapter|section|exercises)\s+(\d+(?:\.\d+)*)\b/i;
const TOP = /^(?:(\d{1,3})[.)]|(\d{1,3}\.\d{1,3})\.?)\s+(.*)$/;
const ENTRY = /(?:^|\s)(?:(\d{1,3})[.)]|(\d{1,3}\.\d{1,3})\.?)\s+/g;
const INLINE_ANSWER = /\banswers?\s*:\s*/i;
const LABEL = /^(?:(?:Exercise|Problem|Question|Practice Problem|EXERCISE|PROBLEM|QUESTION)\s+(\d{1,3}(?:\.\d{1,3})*)(?:\s*[.):]?\s+|\s*$)|Q(\d{1,3})(?:\s*[.):]?\s+|\s*$))(.*)$/;
const BLOCK_END = /^(?:example|definition|theorem|proposition|lemma|corollary|remark|note|proof|solution|section|chapter)\b/i;
// shortcut: an inline textbook exercise ends at the next labelled block, heading or page, or after this many lines; layout boxes would be exact.
const INLINE_MAX_LINES = 12;

const letterAt = (i: number) => String.fromCharCode(97 + i);
const follows = (n: string, prev: string | null) =>
  prev === null || (compare(n, prev) > 0 && (n.includes(".") || prev.includes(".") || Number(n) <= Number(prev) + 10));

function regionOf(lines: Line[]): Region {
  const page = lines[0]!.page;
  const on = lines.filter((l) => l.page === page);
  const x = Math.min(...on.map((l) => l.x));
  const y = Math.min(...on.map((l) => l.y));
  return { page, x, y, w: Math.max(...on.map((l) => l.x + l.w)) - x, h: Math.max(...on.map((l) => l.y + l.h)) - y };
}

function confidenceOf(text: string): number {
  if (!text.trim()) return 0;
  const c = textConfidence(`${text}\nextracted question text`);
  return c.needsOcr ? 0 : c.confidence;
}

const clean = (s: string) => s.replace(/[\s,;]*(?:\band)?[\s,;]*$/i, "").trim();

export function splitAnswer(answer: string, letters: string[]): { head: string; parts: Record<string, string> } {
  const marks: { letter: string; at: number; end: number }[] = [];
  let from = 0;
  for (const letter of letters) {
    const m = new RegExp(`(^|[^\\w)])\\(${letter}\\)\\s*`).exec(answer.slice(from));
    if (!m) break;
    marks.push({ letter, at: from + m.index, end: from + m.index + m[0].length });
    from += m.index + m[0].length;
  }
  if (!marks.length) return { head: answer.trim(), parts: {} };
  const parts: Record<string, string> = {};
  marks.forEach((m, i) => (parts[m.letter] = clean(answer.slice(m.end, marks[i + 1]?.at ?? answer.length))));
  return { head: clean(answer.slice(0, marks[0]!.at)), parts };
}

export function extractQuestions(doc: PdfDoc, opts: ExtractOptions = {}): ExtractedQuestion[] {
  const all = docLines(doc);
  const lines = all.filter((l, i) => !(/^\d{1,4}$/.test(l.text) && (all[i - 1]?.page !== l.page || all[i + 1]?.page !== l.page)));
  const body = bodyHeight(lines);
  const heading = (l: Line) => isHeadingSize(l, body) && /[A-Za-z]{3,}/.test(l.text);
  const drafts: Draft[] = [];
  const book = new Map<string, string>();
  let mode: "none" | "questions" | "answers" = opts.sheet ? "questions" : "none";
  let sectionChapter: string | undefined;
  let answerChapter: string | undefined;
  let lastTop: string | null = null;
  let lastEntry: { key: string; number: string } | null = null;
  let margin: number | null = null;
  let cur: Draft | null = null;
  let target: Part | null = null;
  let inAnswer = false;
  let answerTo: string[] = [];
  let inline = 0;
  let prev: Line | null = null;

  const close = () => { cur = null; target = null; inAnswer = false; inline = 0; };
  const push = (part: Part, text: string, l: Line) => {
    if (text.trim()) part.text.push(text.trim());
    if (!part.lines.includes(l)) part.lines.push(l);
  };

  const addContent = (d: Draft, text: string, l: Line) => {
    let rest = text;
    let atStart = true;
    for (;;) {
      const letter = letterAt(d.subs.length);
      const m = new RegExp(`(^|\\s)\\(${letter}\\)\\s*`).exec(rest);
      const lineStart = atStart && m?.index === 0;
      const ok = m && (lineStart || d.subs.length > 0 || rest.slice(m.index + m[0].length).includes(`(${letterAt(d.subs.length + 1)})`));
      if (!m || !ok) break;
      push(target!, rest.slice(0, m.index), l);
      target = { letter, text: [], lines: [], answer: [] };
      d.subs.push(target);
      rest = rest.slice(m.index + m[0].length);
      atStart = false;
    }
    push(target!, rest, l);
  };

  const consume = (d: Draft, text: string, l: Line) => {
    if (inAnswer) {
      if (!text.trim().startsWith(`(${letterAt(d.subs.length)}) `)) return void answerTo.push(text);
      inAnswer = false;
    }
    const m = INLINE_ANSWER.exec(text);
    const before = m ? text.slice(0, m.index) : text;
    if (before.trim() || !m) addContent(d, before, l);
    if (!m) return;
    inAnswer = true;
    const after = text.slice(m.index + m[0].length).trim();
    answerTo = target === d.stem || after.includes("(a)") ? d.answer : target!.answer;
    const own = answerTo === d.answer ? after : after.replace(new RegExp(`^\\(${target!.letter}\\)\\s*`), "");
    if (own) answerTo.push(own);
  };

  const start = (n: string, text: string, l: Line) => {
    const chapter = sectionChapter ?? chapterAt(opts.chapters ?? [], l.page)?.number ?? (n.includes(".") ? n.split(".")[0] : undefined);
    const d: Draft = { number: n, ...(chapter && { chapter }), stem: { text: [], lines: [l], answer: [] }, subs: [], answer: [] };
    drafts.push(d);
    cur = d;
    target = d.stem;
    inAnswer = false;
    consume(d, text, l);
  };

  const bookLine = (text: string) => {
    const starts: { number: string; at: number; end: number }[] = [];
    for (const m of text.matchAll(ENTRY)) {
      const n = (m[1] ?? m[2])!;
      if (follows(n, starts[starts.length - 1]?.number ?? lastEntry?.number ?? null)) starts.push({ number: n, at: m.index!, end: m.index! + m[0].length });
    }
    const append = (key: string, s: string) => s.trim() && book.set(key, `${book.get(key) ? `${book.get(key)} ` : ""}${s.trim()}`);
    const lead = text.slice(0, starts[0]?.at ?? text.length);
    if (lastEntry) append(lastEntry.key, lead);
    starts.forEach((s, i) => {
      const key = `${answerChapter ?? ""}|${s.number}`;
      append(key, text.slice(s.end, starts[i + 1]?.at ?? text.length));
      lastEntry = { key, number: s.number };
    });
  };

  for (const l of lines) {
    const t = l.text;
    const ex = EXERCISES.exec(t);
    if (ex) {
      mode = "questions";
      sectionChapter = ex[2] ?? ex[1];
      lastTop = null;
      margin = null;
      close();
      continue;
    }
    if (ANSWERS.test(t) && (heading(l) || !cur)) {
      mode = "answers";
      answerChapter = undefined;
      lastEntry = null;
      close();
      continue;
    }
    if (mode === "answers") {
      const c = ANSWER_CHAPTER.exec(t) ?? (heading(l) ? /^(\d+(?:\.\d+)*)\s+[A-Z]/.exec(t) : null);
      if (c) {
        answerChapter = c[1];
        lastEntry = null;
      } else if (heading(l)) mode = "none";
      else bookLine(t);
      continue;
    }
    const label = LABEL.exec(t);
    const labelled = label && (label[1] ?? label[2]) !== "0" ? label : null;
    const gap = prev && prev.page === l.page ? l.y - (prev.y + prev.h) : 0;
    prev = l;
    if (mode === "none") {
      if (labelled) {
        start((labelled[1] ?? labelled[2])!, labelled[3]!, l);
        inline = INLINE_MAX_LINES;
      } else if (cur && inline) {
        if (BLOCK_END.test(t) || heading(l) || gap > 1.2 * l.h || l.page !== cur.stem.lines[0]!.page || --inline === 0) close();
        else consume(cur, t, l);
      }
      continue;
    }
    if (labelled) {
      lastTop = (labelled[1] ?? labelled[2])!;
      start(lastTop, labelled[3]!, l);
      continue;
    }
    const top = TOP.exec(t);
    if (heading(l) && !top) {
      close();
      if (!opts.sheet) mode = "none";
      continue;
    }
    const n = top ? (top[1] ?? top[2])! : null;
    if (n && follows(n, lastTop) && (margin === null || Math.abs(l.x - margin) <= 2 * l.h)) {
      margin ??= l.x;
      lastTop = n;
      start(n, top![3]!, l);
      continue;
    }
    if (inAnswer && margin !== null && l.x < margin + 0.5 * l.h) close();
    if (cur) consume(cur, t, l);
  }

  const byNumber = new Map<string, string | null>();
  for (const [key, answer] of book) {
    const n = key.slice(key.indexOf("|") + 1);
    byNumber.set(n, byNumber.has(n) ? null : answer);
  }
  const out: ExtractedQuestion[] = [];
  const item = (base: Omit<ExtractedQuestion, "confidence" | "tags">, scored: string): ExtractedQuestion => {
    const confidence = confidenceOf(scored);
    return { ...base, confidence, tags: confidence < UNCLEAR_BELOW || isMathGarbled(base.text) ? ["needs-cleanup"] : [] };
  };
  for (const d of drafts) {
    let answer = d.answer.join(" ").trim();
    let source: AnswerSource | undefined = answer ? "sheet" : undefined;
    if (!answer) {
      const found = book.get(`${d.chapter ?? ""}|${d.number}`) ?? book.get(`|${d.number}`) ?? byNumber.get(d.number) ?? undefined;
      if (found) [answer, source] = [found, "book"];
    }
    const { head, parts } = splitAnswer(answer, d.subs.map((s) => s.letter!));
    const stem = d.stem.text.join(" ");
    const withAnswer = (a: string | undefined) => (a ? { answer: a, answer_source: source } : {});
    const chapter = d.chapter ? { chapter: d.chapter } : {};
    out.push(item({
      number: d.number, ...chapter, text: stem, ...withAnswer(head || undefined),
      page: d.stem.lines[0]!.page, region: regionOf([...d.stem.lines, ...d.subs.flatMap((s) => s.lines)]),
    }, `${stem}\n${head}`));
    for (const s of d.subs) {
      const text = s.text.join(" ");
      const own = s.answer.join(" ").trim();
      out.push(item({
        number: `${d.number}(${s.letter})`, parent: d.number, ...chapter, text,
        ...(own ? { answer: own, answer_source: "sheet" as const } : withAnswer(parts[s.letter!])),
        page: s.lines[0]!.page, region: regionOf(s.lines),
      }, `${stem}\n${text}\n${parts[s.letter!] ?? ""}`));
    }
  }
  return out;
}
