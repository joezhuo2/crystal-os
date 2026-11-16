import yaml from "js-yaml";
import { slugify } from "../model";
import { AI_UNVERIFIED, isUnverifiedMark } from "../questions";
import type { AnswerSource, ExtractedQuestion } from "./questions-extract";
import type { Region } from "./types";

export type PoolState = "pool" | "accepted" | "rejected";
export type PoolKind = "chapter" | "question-sheet";
export interface PoolItem extends ExtractedQuestion { id: string; state: PoolState; topic?: string; hash: string }

export const AI_FOUND = "ai-found";
export interface PoolNote { kind: PoolKind; source: string; chapter?: string; items: PoolItem[]; meta: Record<string, unknown>; body: string }

export const poolItemId = (source: string, number: string, chapter?: string) =>
  `${slugify(source.replace(/\.pdf$/i, ""))}:${chapter ? `${chapter}/` : ""}${number}`;

export function hashItem(text: string, answer?: string): string {
  let h = 5381;
  for (const ch of `${text}\u0000${answer ?? ""}`) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

export const isEdited = (item: PoolItem) => hashItem(item.text, item.answer) !== item.hash;

export function createPool(
  kind: PoolKind, source: string, questions: ExtractedQuestion[],
  opts: { chapter?: string; topicOf?: (q: ExtractedQuestion) => string | null } = {},
): PoolNote {
  const taken = new Set<string>();
  const items = questions.map((q): PoolItem => {
    const base = poolItemId(source, q.number, opts.chapter ?? q.chapter);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}~${n}`;
    taken.add(id);
    const topic = opts.topicOf?.(q);
    return { ...q, id, state: "pool", ...(topic && { topic }), hash: hashItem(q.text, q.answer) };
  });
  return { kind, source, ...(opts.chapter && { chapter: opts.chapter }), items, meta: {}, body: "" };
}

export function mergePool(existing: PoolNote | null, fresh: PoolNote): PoolNote {
  if (!existing) return fresh;
  const old = new Map(existing.items.map((i) => [i.id, i]));
  const items = fresh.items.map((n): PoolItem => {
    const o = old.get(n.id);
    if (!o) return n;
    old.delete(n.id);
    const next: PoolItem = { ...n, state: o.state, ...(o.topic !== undefined && { topic: o.topic }), ...(!n.ai_log && o.ai_log && { ai_log: o.ai_log }) };
    if (!isEdited(o)) return next;
    const { answer: _a, answer_source: _s, ...rest } = next;
    return {
      ...rest, text: o.text, ...(o.answer !== undefined && { answer: o.answer, answer_source: o.answer_source }),
      hash: o.hash, tags: [...new Set([...n.tags.filter((t) => t !== "needs-cleanup"), ...o.tags.filter(isUnverifiedMark)])],
    };
  });
  for (const o of old.values()) if (o.state !== "pool" || isEdited(o) || o.tags.includes(AI_FOUND)) items.push(o);
  return { ...fresh, meta: { ...existing.meta, ...fresh.meta }, body: existing.body, items };
}

export const isAiUnverified = (i: Pick<PoolItem, "tags" | "answer_source">) => i.tags.some(isUnverifiedMark) || isUnverifiedMark(i.answer_source);

export function withAiReading(item: PoolItem, reading: { question: string; answer: string }): PoolItem {
  const { answer: _a, answer_source: _s, ...rest } = item;
  const answer = reading.answer
    ? { answer: reading.answer, answer_source: AI_UNVERIFIED as AnswerSource }
    : item.answer ? { answer: item.answer, ...(item.answer_source && { answer_source: item.answer_source }) } : {};
  return { ...rest, text: reading.question, ...answer, tags: [...new Set([...item.tags.filter((t) => t !== "needs-cleanup"), AI_UNVERIFIED])] };
}

export function serializePool(p: PoolNote): string {
  const fm = { ...p.meta, kind: p.kind, source: p.source, ...(p.chapter && { chapter: p.chapter }), items: p.items };
  return `---\n${yaml.dump(JSON.parse(JSON.stringify(fm)), { lineWidth: -1 })}---\n${p.body}`;
}

const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const STATES: PoolState[] = ["pool", "accepted", "rejected"];

function regionFrom(v: unknown, page: number): Region {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { page: Number(r.page ?? page), x: Number(r.x ?? 0), y: Number(r.y ?? 0), w: Number(r.w ?? 0), h: Number(r.h ?? 0) };
}

function itemFrom(v: unknown): PoolItem {
  const d = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const page = Number(d.page ?? 0);
  const text = String(d.text ?? "");
  const answer = d.answer != null ? String(d.answer) : undefined;
  return {
    ...d,
    id: String(d.id ?? ""),
    number: String(d.number ?? ""),
    ...(d.parent != null && { parent: String(d.parent) }),
    ...(d.chapter != null && { chapter: String(d.chapter) }),
    text,
    ...(answer !== undefined && { answer }),
    ...(d.answer_source != null && { answer_source: String(d.answer_source) as AnswerSource }),
    page,
    region: regionFrom(d.region, page),
    confidence: Number(d.confidence ?? 0),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    state: STATES.includes(d.state as PoolState) ? (d.state as PoolState) : "pool",
    ...(d.topic != null && { topic: String(d.topic) }),
    ...(d.ai_log != null && { ai_log: String(d.ai_log) }),
    hash: d.hash != null ? String(d.hash) : hashItem(text, answer),
  };
}

export function parsePool(raw: string): PoolNote {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const m = FRONTMATTER.exec(text);
  if (!m) throw new Error("Pool note has no frontmatter");
  const data: unknown = yaml.load(m[1] ?? "", { schema: yaml.CORE_SCHEMA }) ?? {};
  if (typeof data !== "object" || Array.isArray(data)) throw new Error("Pool note frontmatter is not a mapping");
  const { kind, source, chapter, items, ...meta } = data as Record<string, unknown>;
  return {
    kind: kind === "chapter" ? "chapter" : "question-sheet",
    source: String(source ?? ""),
    ...(chapter != null && { chapter: String(chapter) }),
    items: (Array.isArray(items) ? items : []).map(itemFrom),
    meta,
    body: text.slice(m[0].length),
  };
}
