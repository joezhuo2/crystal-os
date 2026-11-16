import { readVaultBinary, parseFrontmatter } from "@/lib/vaultNative";
import { topicPath, type Topic } from "../model";
import { AI_UNVERIFIED, parseQuestions, questionSource } from "../questions";
import { aiFindQuestions, canvasPng, type AiFoundQuestion } from "./ai";
import { questionsMarkdown, recordAi } from "./aiRecord";
import { chapterAt, detectChapters, linkTopic, type Chapter } from "./chapters";
import { isMathGarbled, textConfidence } from "./confidence";
import type { Resource } from "./ingest";
import { openPdf, readPdf, renderPage } from "./pdf";
import { AI_FOUND, hashItem, parsePool, poolItemId, serializePool, type PoolItem, type PoolNote } from "./pool";
import { chapterPoolPath, linkTarget, readOrNull, storedChapters, update } from "./process";
import type { PdfDoc, PdfPage } from "./types";

export interface FindJob { resource: Pick<Resource, "sidecar" | "pdf" | "name" | "type">; code: string; topics: Topic[] }
export interface FindProgress { page: number; pages: number }
export interface FindResult { found: number; added: number; log?: string }

export const PAGES_PER_CALL = 5;
const IMAGE_SCALE = 1.5;

export const normalizeQuestion = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const needsImage = (p: PdfPage) => textConfidence(p.text).needsOcr || isMathGarbled(p.text);

async function poolTexts(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths) {
    const raw = await readOrNull(path);
    if (!raw) continue;
    try {
      out.push(...parsePool(raw.content).items.map((i) => i.text));
    } catch {
      // A sidecar without frontmatter has no pool to compare against.
    }
  }
  return out;
}

async function topicTexts(folder: string, code: string, topics: Topic[]): Promise<string[]> {
  const out: string[] = [];
  for (const t of topics) {
    const raw = await readOrNull(topicPath(folder, code, t.slug));
    if (raw) out.push(...parseQuestions(parseFrontmatter(raw.content).content).map((q) => questionSource(q.prompt).body));
  }
  return out;
}

function chaptersFor(type: string, stored: unknown, doc: PdfDoc): Chapter[] {
  if (type !== "textbook") return [];
  const kept = storedChapters(stored);
  return kept.length ? kept : detectChapters(doc).value;
}

export async function countPages(pdf: string): Promise<number> {
  const proxy = await openPdf(new Uint8Array(await readVaultBinary(pdf)));
  try {
    return proxy.numPages;
  } finally {
    await proxy.loadingTask.destroy();
  }
}

export async function findQuestions(
  { resource, code, topics }: FindJob,
  folder: string,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (p: FindProgress) => void } = {},
): Promise<FindResult> {
  const sidecar = await readOrNull(resource.sidecar);
  const meta = sidecar ? parseFrontmatter(sidecar.content).data : {};
  const source = typeof meta.source === "string" ? meta.source : `[[${resource.pdf}]]`;
  const found: AiFoundQuestion[] = [];
  const proxy = await openPdf(new Uint8Array(await readVaultBinary(resource.pdf)));
  let doc: PdfDoc;
  try {
    doc = await readPdf(proxy);
    for (let i = 0; i < doc.pages.length && !signal?.aborted; i += PAGES_PER_CALL) {
      const batch = doc.pages.slice(i, i + PAGES_PER_CALL);
      onProgress?.({ page: i + 1, pages: doc.pages.length });
      const pages = [];
      for (const p of batch) pages.push({ page: p.index, text: p.text, ...(needsImage(p) && { image: canvasPng(await renderPage(proxy, p.index, IMAGE_SCALE)).base64 }) });
      const reply = await aiFindQuestions(pages, topics, code);
      if (!reply) throw new Error("No AI provider is selected in Settings → The Observatory");
      found.push(...reply);
    }
  } finally {
    await proxy.loadingTask.destroy();
  }

  const textbook = resource.type === "textbook";
  const chapters = chaptersFor(resource.type, meta.chapters, doc);
  const chapterOf = (page: number) => (textbook ? (chapterAt(chapters, page)?.number ?? "0") : undefined);
  const poolOf = (page: number) => (textbook ? chapterPoolPath(resource.sidecar, chapterOf(page)!) : resource.sidecar);
  const poolPaths = textbook ? [...new Set(["0", ...chapters.map((c) => c.number)])].map((n) => chapterPoolPath(resource.sidecar, n)) : [resource.sidecar];
  const seen = new Set([...(await poolTexts(poolPaths)), ...(await topicTexts(folder, code, topics))].map(normalizeQuestion));
  const fresh = new Set<AiFoundQuestion>();
  for (const q of found) {
    const key = normalizeQuestion(q.question);
    if (key && !seen.has(key)) fresh.add(q);
    seen.add(key);
  }

  const log = await recordAi({
    code,
    kind: "questions",
    title: `Questions in ${resource.name}`,
    source: resource.pdf,
    markdown: `Found ${found.length} question${found.length === 1 ? "" : "s"}; ${fresh.size} new went to the review pool.\n\n${questionsMarkdown(
      found.map((q) => ({ number: q.number, page: q.page, text: q.question, answer: q.answer, type: q.type, topic: q.topic, note: fresh.has(q) ? undefined : "already in the pool or a topic note, skipped" })),
    )}`,
  });

  const groups = new Map<string, AiFoundQuestion[]>();
  for (const q of fresh) groups.set(poolOf(q.page), [...(groups.get(poolOf(q.page)) ?? []), q]);
  const stem = linkTarget(source).split("/").pop()!;
  for (const [path, qs] of groups) {
    const chapter = chapterOf(qs[0]!.page);
    await update(path, (content) => {
      const pool: PoolNote = content
        ? parsePool(content)
        : { kind: "chapter", source, chapter, items: [], body: "", meta: { title: chapters.find((c) => c.number === chapter)?.title ?? (chapter === "0" ? "Unsorted" : `Chapter ${chapter}`) } };
      const taken = new Set(pool.items.map((i) => i.id));
      const items = qs.map((q): PoolItem => {
        const page = doc.pages.find((p) => p.index === q.page);
        const number = q.number || `p${q.page}`;
        const base = poolItemId(stem, `ai-${number}`, chapter);
        let id = base;
        for (let n = 2; taken.has(id); n++) id = `${base}~${n}`;
        taken.add(id);
        const topic = q.topic ?? linkTopic(topics, { chapter, page: q.page, text: `${q.question} ${q.answer}` });
        return {
          id, number, ...(chapter && { chapter }), text: q.question, ...(q.answer && { answer: q.answer, answer_source: AI_UNVERIFIED }),
          page: q.page, region: { page: q.page, x: 0, y: 0, w: page?.width ?? 0, h: page?.height ?? 0 }, confidence: 1,
          tags: [AI_UNVERIFIED, AI_FOUND], qtype: q.type, state: "pool", ...(topic && { topic }), hash: hashItem(q.question, q.answer), ...(log && { ai_log: log }),
        };
      });
      return serializePool({ ...pool, items: [...pool.items, ...items] });
    });
  }
  return { found: found.length, added: fresh.size, log };
}
