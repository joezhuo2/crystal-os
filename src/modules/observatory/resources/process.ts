import { createVaultNote, fetchRawNote, saveVaultNote, vaultErrorCode } from "@/hooks/useVault";
import { parseFrontmatter, readVaultBinary } from "@/lib/vaultNative";
import { AI_UNVERIFIED, isUnverifiedMark } from "../questions";
import { patchNote } from "../model";
import { saveQuestion } from "../store";
import { chapterAt, detectChapters, linkTopic, type Chapter, type LinkableTopic } from "./chapters";
import { aiFor, aiReadPage, aiReadQuestion, aiSlideDeck, canvasPng, type AiDeck } from "./ai";
import { questionsMarkdown, recordAi } from "./aiRecord";
import { isMathGarbled, textConfidence } from "./confidence";
import { ocrPage } from "./ocr";
import { openPdf, readPdf, renderPage, renderRegion } from "./pdf";
import type { QuestionType } from "../questions";
import { createPool, isAiUnverified, isEdited, mergePool, parsePool, serializePool, withAiReading, type PoolItem, type PoolKind } from "./pool";
import { extractQuestions, type ExtractedQuestion } from "./questions-extract";
import { extractSlides, lectureMarkdown } from "./slides";
import { UNCLEAR_BELOW, type PdfDoc, type PdfPage, type Region, type ResourceType, type TextItem } from "./types";

export interface ProcessProgress { done: number; total: number; label: string }
export interface ProcessResult { type: ResourceType; confidence: number; needsOcr: number[]; pools: string[] }

const OCR_SCALE = 2;
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));
const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const round = (n: number) => Math.round(n * 100) / 100;

export const linkTarget = (source: string) => source.replace(/^!?\[\[|\]\]$/g, "").split(/[#|]/)[0]!.trim();
export const pdfPathOf = (sidecar: string, source: string) => `${dirOf(sidecar)}/${linkTarget(source).split("/").pop()}`;
export const pageLink = (source: string, page: number, region?: Region) =>
  `[[${linkTarget(source)}#page=${page}${region && region.w > 0 && region.h > 0 ? `&region=${[region.x, region.y, region.w, region.h].map(Math.round).join(",")}` : ""}]]`;
export const chapterFile = (n: string) => `ch${n.split(".").map((p) => p.padStart(2, "0")).join(".")}.md`;
export const chapterPoolPath = (sidecar: string, n: string) => `${dirOf(sidecar)}/chapters/${chapterFile(n)}`;

export async function readOrNull(path: string) {
  try {
    return await fetchRawNote(path);
  } catch (err) {
    if (vaultErrorCode(err) === "not_found") return null;
    throw err;
  }
}

async function write(path: string, content: string, mtime?: number) {
  if (mtime !== undefined) await saveVaultNote({ path, content, expectedMtime: mtime });
  else await createVaultNote({ path, content, overwrite: false });
}

const ATTEMPTS = 3;

// The app owns these files, so a write that loses a race with another writer (Obsidian, sync) re-reads and retries.
export async function update(path: string, change: (content: string | null) => string) {
  for (let attempt = 1; ; attempt++) {
    const raw = await readOrNull(path);
    try {
      return await write(path, change(raw?.content ?? null), raw?.mtime);
    } catch (err) {
      if (attempt >= ATTEMPTS || vaultErrorCode(err) !== "conflict") throw err;
    }
  }
}

function ocrItems(words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[]): TextItem[] {
  return words.map(({ text, bbox: b }) => ({
    str: text, x: b.x0 / OCR_SCALE, y: b.y0 / OCR_SCALE, w: (b.x1 - b.x0) / OCR_SCALE, h: (b.y1 - b.y0) / OCR_SCALE,
  }));
}

async function loadDoc(pdfPath: string, asItems: boolean, onProgress: (p: ProcessProgress) => void) {
  const proxy = await openPdf(new Uint8Array(await readVaultBinary(pdfPath)));
  try {
    const doc = await readPdf(proxy);
    const scanned = doc.pages.filter((p) => textConfidence(p.text).needsOcr);
    for (const [i, page] of scanned.entries()) {
      onProgress({ done: i, total: scanned.length, label: `Reading scanned page ${page.index}` });
      await yieldToUi();
      const canvas = await renderPage(proxy, page.index, OCR_SCALE);
      const ocr = await ocrPage(canvas);
      page.ocr = { text: ocr.text, confidence: round(ocr.confidence) };
      if (asItems) page.items = ocrItems(ocr.words);
      else if (page.ocr.confidence < UNCLEAR_BELOW && aiFor("aiExtract")) {
        onProgress({ done: i, total: scanned.length, label: `Reading page ${page.index} with AI` });
        const markdown = await aiReadPage(canvasPng(canvas).base64).catch(() => null);
        if (markdown) {
          page.ocr = { ...page.ocr, text: markdown, ai: true };
          await recordAi({ kind: "page-reading", title: `Page ${page.index} of ${pdfPath.split("/").pop()}`, markdown, source: `${pdfPath}#page=${page.index}`, status: "applied" });
        }
      }
    }
    return { doc, needsOcr: scanned.map((p) => p.index) };
  } finally {
    await proxy.loadingTask.destroy();
  }
}

const pageConfidence = (p: PdfPage) => p.ocr?.confidence ?? textConfidence(p.text).confidence;
const docConfidence = (doc: PdfDoc) =>
  doc.pages.length ? round(doc.pages.reduce((n, p) => n + pageConfidence(p), 0) / doc.pages.length) : 0;

function gateOcr(doc: PdfDoc, qs: ExtractedQuestion[]): ExtractedQuestion[] {
  return qs.map((q) => {
    const ocr = doc.pages.find((p) => p.index === q.page)?.ocr;
    if (!ocr) return q;
    const confidence = Math.min(q.confidence, ocr.confidence);
    return { ...q, confidence, tags: confidence < UNCLEAR_BELOW ? [...new Set([...q.tags, "needs-cleanup"])] : q.tags };
  });
}

export function withFallbackTopic(qs: ExtractedQuestion[], topicOf: (q: ExtractedQuestion) => string | null, fallback: string | null) {
  const linked = new Map(qs.map((q) => [q, topicOf(q)]));
  const counts = new Map<string, number>();
  for (const t of linked.values()) if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  const majority = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  return (q: ExtractedQuestion) => linked.get(q) ?? majority;
}

async function writePool(path: string, kind: PoolKind, source: string, qs: ExtractedQuestion[], topicOf: (q: ExtractedQuestion) => string | null, extra: { chapter?: string; meta?: Record<string, unknown>; body?: string; fallback?: string | null } = {}) {
  const ids = linkTarget(source).split("/").pop()!;
  const fresh = { ...createPool(kind, ids, qs, { chapter: extra.chapter, topicOf: withFallbackTopic(qs, topicOf, extra.fallback ?? null) }), source, meta: extra.meta ?? {} };
  await update(path, (content) => {
    const merged = mergePool(content ? parsePool(content) : null, fresh);
    return serializePool(extra.body !== undefined ? { ...merged, body: extra.body } : merged);
  });
}

// shortcut: caps AI reads per run so a scanned textbook cannot fire hundreds of calls; raise it or batch by chapter if needed.
const AI_READS_PER_RUN = 30;

async function aiCleanPools(pdfPath: string, paths: string[], onProgress: (p: ProcessProgress) => void) {
  if (!aiFor("aiExtract")) return;
  const proxy = await openPdf(new Uint8Array(await readVaultBinary(pdfPath)));
  try {
    let left = AI_READS_PER_RUN;
    for (const path of paths) {
      const raw = await readOrNull(path);
      if (!raw || left <= 0) continue;
      const targets = parsePool(raw.content).items.filter((i) => i.state === "pool" && isUnclear(i) && !isAiUnverified(i) && i.region.w > 0 && i.region.h > 0).slice(0, left);
      left -= targets.length;
      const readings = new Map<string, { question: string; answer: string }>();
      for (const [n, item] of targets.entries()) {
        onProgress({ done: n, total: targets.length, label: `Reading ${item.number} with AI` });
        const reading = await renderRegion(proxy, item.region).then((c) => aiReadQuestion(canvasPng(c).base64)).catch(() => null);
        if (reading) readings.set(item.id, reading);
      }
      if (!readings.size) continue;
      const read = targets.filter((i) => readings.has(i.id));
      const log = await recordAi({
        kind: "question-reread",
        title: `Re-read questions in ${path.split("/").pop()}`,
        markdown: questionsMarkdown(read.map((i) => ({ number: i.number, page: i.page, text: readings.get(i.id)!.question, answer: readings.get(i.id)!.answer }))),
        source: read.length === 1 ? `${pdfPath}#page=${read[0]!.page}` : pdfPath,
      });
      await update(path, (content) => {
        const fresh = parsePool(content ?? "");
        return serializePool({ ...fresh, items: fresh.items.map((i) => (readings.has(i.id) ? { ...withAiReading(i, readings.get(i.id)!), ...(log && { ai_log: log }) } : i)) });
      });
    }
  } finally {
    await proxy.loadingTask.destroy();
  }
}

export function storedChapters(v: unknown): Chapter[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c: Record<string, unknown>) => {
    const startPage = Number(c?.start ?? c?.startPage);
    const endPage = Number(c?.end ?? c?.endPage ?? startPage);
    return c && c.number != null && startPage > 0 ? [{ number: String(c.number), title: String(c.title ?? ""), startPage, endPage }] : [];
  });
}

async function recordDeck(deck: AiDeck, pdfPath: string, title: string) {
  const base = { source: pdfPath };
  const points = deck.keyPoints.map((p) => `- ${p}`).join("\n") || "_None._";
  await recordAi({ ...base, kind: "slide-summary", title: `Summary of ${title}`, status: "applied", markdown: `${deck.summary || "_No summary._"}\n\n## Key points\n\n${points}` });
  const questions = deck.questions.length
    ? await recordAi({ ...base, kind: "drafted-questions", title: `Questions drafted from ${title}`, markdown: questionsMarkdown(deck.questions.map((q) => ({ number: q.slide ? `slide ${q.slide}` : undefined, text: q.prompt, answer: q.answer, type: q.type }))) })
    : undefined;
  const suggestions = deck.logistics.length
    ? await recordAi({
        ...base,
        kind: "course-suggestions",
        title: `Course changes suggested by ${title}`,
        markdown: deck.logistics.map((s) => `- ${s.kind} "${s.name}"${s.weight !== undefined ? `, weight ${s.weight}%` : ""}${s.date ? `, date ${s.date}` : ""}${s.quote ? `\n  > ${s.quote}` : ""}`).join("\n"),
      })
    : undefined;
  return { questions, suggestions };
}

export async function processResource(
  sidecar: string,
  topics: LinkableTopic[],
  onProgress: (p: ProcessProgress) => void = () => {},
): Promise<ProcessResult> {
  const raw = await fetchRawNote(sidecar);
  const { data } = parseFrontmatter(raw.content);
  const type = String(data.type ?? "other") as ResourceType;
  const source = String(data.source ?? "");
  const done = { processed: true, processed_at: new Date().toISOString().slice(0, 10) };

  if (type !== "textbook" && type !== "question-sheet" && type !== "slides") {
    await update(sidecar, (content) => patchNote(content ?? raw.content, done));
    return { type, confidence: 1, needsOcr: [], pools: [] };
  }
  if (!source) throw new Error(`${sidecar} has no source PDF`);

  const pdfPath = pdfPathOf(sidecar, source);
  const { doc, needsOcr } = await loadDoc(pdfPath, type !== "slides", onProgress);
  const confidence = docConfidence(doc);
  const info = { ...done, confidence, needs_ocr: needsOcr };
  const textOf = (q: ExtractedQuestion) => `${q.text} ${q.answer ?? ""}`;
  const docTopic = linkTopic(topics, { text: `${String(data.title ?? "")} ${doc.pages[0]?.text ?? ""}` });

  if (type === "question-sheet") {
    onProgress({ done: 0, total: 1, label: "Extracting questions" });
    const qs = gateOcr(doc, extractQuestions(doc, { sheet: true }));
    await writePool(sidecar, "question-sheet", source, qs, (q) => linkTopic(topics, { chapter: q.chapter, page: q.page, text: textOf(q) }), { meta: info, fallback: docTopic });
    await aiCleanPools(pdfPath, [sidecar], onProgress);
    onProgress({ done: 1, total: 1, label: "Done" });
    return { type, confidence, needsOcr, pools: [sidecar] };
  }

  if (type === "slides") {
    onProgress({ done: 0, total: 1, label: "Extracting slides" });
    const note = extractSlides(doc);
    const deck = await aiSlideDeck(note).catch(() => null);
    const logs: { questions?: string; suggestions?: string } = deck ? await recordDeck(deck, pdfPath, String(data.title ?? "") || (pdfPath.split("/").pop() ?? "slides")) : {};
    const lecture = parseFrontmatter(lectureMarkdown(note, linkTarget(source), deck ?? undefined));
    const { source: _s, ...fields } = lecture.data;
    const cards = note.cards.map((c, i): ExtractedQuestion => ({
      number: `${c.slide}.${i + 1}`, text: c.front, answer: c.back, page: c.region.page, region: c.region,
      confidence: c.confidence, tags: c.confidence < UNCLEAR_BELOW ? ["needs-cleanup"] : [],
    }));
    const first = doc.pages[0];
    const slideRegion = (n: number): Region =>
      note.slides.find((s) => s.numbers.includes(n))?.regions[0] ?? { page: first?.index ?? 1, x: 0, y: 0, w: first?.width ?? 0, h: first?.height ?? 0 };
    const drafted = (deck?.questions ?? []).map((q, i): ExtractedQuestion => {
      const region = slideRegion(q.slide);
      return {
        number: `ai.${i + 1}`, text: q.prompt, ...(q.answer && { answer: q.answer, answer_source: AI_UNVERIFIED }),
        page: region.page, region, confidence: 1, tags: [AI_UNVERIFIED], qtype: q.type, ...(logs.questions && { ai_log: logs.questions }),
      };
    });
    const handled = new Set(Array.isArray(data.suggestions_done) ? data.suggestions_done.map(String) : []);
    const suggestions = deck && { suggestions: deck.logistics.filter((s) => !handled.has(s.id)).map((s) => (logs.suggestions ? { ...s, log: logs.suggestions } : s)) };
    await writePool(sidecar, "question-sheet", source, [...cards, ...drafted], (q) => linkTopic(topics, { text: textOf(q) }), {
      meta: { ...fields, title: data.title ?? fields.title, ...info, ...suggestions }, body: lecture.content, fallback: docTopic,
    });
    onProgress({ done: 1, total: 1, label: "Done" });
    return { type, confidence, needsOcr, pools: [sidecar] };
  }

  const detected = detectChapters(doc);
  const stored = storedChapters(data.chapters);
  const edited = stored.length > 0 && JSON.stringify(stored) !== JSON.stringify(detected.value);
  const chapters = edited ? stored : detected.value;
  const qs = gateOcr(doc, extractQuestions(doc, { chapters }));
  const groups = new Map<string, ExtractedQuestion[]>();
  for (const q of qs) {
    const n = chapterAt(chapters, q.page)?.number ?? q.chapter ?? "0";
    groups.set(n, [...(groups.get(n) ?? []), q]);
  }
  const pools: string[] = [];
  let i = 0;
  for (const [n, items] of groups) {
    onProgress({ done: i++, total: groups.size, label: `Chapter ${n}` });
    await yieldToUi();
    const path = chapterPoolPath(sidecar, n);
    await writePool(path, "chapter", source, items, (q) => linkTopic(topics, { chapter: q.chapter ?? n, page: q.page, text: textOf(q) }), {
      fallback: linkTopic(topics, { chapter: n }),
      chapter: n, meta: { title: chapters.find((c) => c.number === n)?.title ?? (n === "0" ? "Unsorted" : `Chapter ${n}`) },
    });
    pools.push(path);
  }
  await aiCleanPools(pdfPath, pools, onProgress);
  await update(sidecar, (content) => patchNote(content ?? raw.content, {
    ...info,
    title: data.title ?? doc.title ?? "",
    chapters: chapters.map((c) => ({ number: c.number, title: c.title, start: c.startPage, end: c.endPage })),
    chapter_source: edited ? "edited" : detected.source,
    chapter_confidence: edited ? 1 : detected.confidence,
  }));
  onProgress({ done: groups.size, total: groups.size, label: "Done" });
  return { type, confidence, needsOcr, pools };
}

export const isUnclear = (i: PoolItem) =>
  (!isEdited(i) && (i.confidence < UNCLEAR_BELOW || i.tags.includes("needs-cleanup") || isMathGarbled(i.text))) || isAiUnverified(i);

export function questionDraft(item: PoolItem, items: PoolItem[], source: string, type: QuestionType, image?: string) {
  const parent = item.parent ? items.find((p) => p.number === item.parent && p.chapter === item.chapter) : undefined;
  const letter = item.parent ? /\(([a-z])\)$/.exec(item.number)?.[1] : undefined;
  const text = parent ? `${parent.text}\n\n(${letter}) ${item.text}` : item.text;
  const unverified = isAiUnverified(item) || !!parent?.tags.some(isUnverifiedMark);
  return {
    type: item.qtype ?? type,
    prompt: `${text}${image ? `\n\n![[${image}]]` : ""}\n\nSource: ${pageLink(source, item.page, item.region)}`,
    answer: item.answer ?? "",
    ...(unverified && { unverified }),
  };
}

export async function acceptClear(folder: string, code: string, path: string, type: QuestionType): Promise<number> {
  const pool = parsePool((await fetchRawNote(path)).content);
  const done = new Set<string>();
  try {
    const parents = new Set(pool.items.flatMap((i) => (i.parent ? [`${i.chapter ?? ""}|${i.parent}`] : [])));
    for (const item of pool.items.filter((i) => i.state === "pool" && i.topic && !isUnclear(i) && !parents.has(`${i.chapter ?? ""}|${i.number}`))) {
      const draft = questionDraft(item, pool.items, pool.source, type);
      for (let attempt = 1; ; attempt++) {
        try {
          await saveQuestion(folder, code, item.topic!, draft);
          break;
        } catch (err) {
          if (attempt >= ATTEMPTS || vaultErrorCode(err) !== "conflict") throw err;
        }
      }
      done.add(item.id);
    }
  } finally {
    if (done.size)
      await update(path, (content) => {
        const fresh = parsePool(content ?? "");
        return serializePool({ ...fresh, items: fresh.items.map((i) => (done.has(i.id) ? { ...i, state: "accepted" } : i)) });
      });
  }
  return done.size;
}
