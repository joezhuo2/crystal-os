import { useEffect, useMemo, useState } from "react";
import { isDesktop } from "@/lib/platform";
import { stripMarkdown } from "@/lib/vaultCore";
import { listNotesNative } from "@/lib/vaultNative";

export interface Embedded {
  mtime: number;
  vector: number[];
}
export type SemanticIndex = Record<string, Embedded>;

interface Indexable {
  path: string;
  title: string;
  tags: string[];
  mtime: number;
  excerpt: string;
  content?: string;
}

const BODY_CHARS = 1500;
const BATCH = 16;
export const MIN_SCORE = 0.2;

export function noteText(note: Indexable): string {
  const body = note.content === undefined ? note.excerpt : stripMarkdown(note.content);
  return `${note.title}\n${note.tags.join(" ")}\n${body.slice(0, BODY_CHARS)}`;
}

export function staleNotes<T extends Indexable>(notes: T[], index: SemanticIndex): T[] {
  return notes.filter((n) => index[n.path]?.mtime !== n.mtime);
}

export function rankNotes(query: number[], index: SemanticIndex, limit = 30): { path: string; score: number }[] {
  return Object.entries(index)
    .map(([path, { vector }]) => ({ path, score: vector.reduce((sum, v, i) => sum + v * query[i], 0) }))
    .filter((hit) => hit.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (v: number[][]) => void; reject: (e: Error) => void }>();

function embed(texts: string[]): Promise<number[][]> {
  if (!worker) {
    worker = new Worker(new URL("./embedWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; vectors?: number[][]; error?: string }>) => {
      const job = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      if (event.data.vectors) job?.resolve(event.data.vectors);
      else job?.reject(new Error(event.data.error ?? "Embedding failed"));
    };
    worker.onerror = (event) => {
      for (const job of waiting.values()) job.reject(new Error(event.message || "The embedding model could not start"));
      waiting.clear();
      worker = null;
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, texts });
  });
}

const DB = "crystal-os-semantic";
const STORE = "index";

function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result.transaction(STORE, mode).objectStore(STORE));
    open.onerror = () => reject(open.error);
  });
}

async function loadIndex(): Promise<SemanticIndex> {
  try {
    const request = (await store("readonly")).get("notes");
    return await new Promise((resolve) => {
      request.onsuccess = () => resolve((request.result as SemanticIndex | undefined) ?? {});
      request.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

async function saveIndex(index: SemanticIndex) {
  try {
    (await store("readwrite")).put(index, "notes");
  } catch {
    /* rebuilt next launch */
  }
}

let memory: SemanticIndex | null = null;

async function buildIndex(notes: Indexable[], onProgress: (done: number, total: number) => void, live: () => boolean): Promise<SemanticIndex> {
  memory ??= await loadIndex();
  const kept: SemanticIndex = {};
  for (const note of notes) if (memory[note.path]?.mtime === note.mtime) kept[note.path] = memory[note.path];
  const stale = staleNotes(notes, kept);
  for (let i = 0; i < stale.length && live(); i += BATCH) {
    onProgress(i, stale.length);
    const batch = stale.slice(i, i + BATCH);
    const vectors = await embed(batch.map(noteText));
    batch.forEach((note, j) => (kept[note.path] = { mtime: note.mtime, vector: vectors[j] }));
  }
  if (live()) {
    memory = kept;
    if (stale.length > 0) void saveIndex(kept);
  }
  return kept;
}

export type SemanticState = { status: "off" } | { status: "indexing"; done: number; total: number } | { status: "ready" } | { status: "error"; message: string };

export function useSemanticSearch(enabled: boolean, query: string, notes: Indexable[]) {
  const [state, setState] = useState<SemanticState>({ status: "off" });
  const [index, setIndex] = useState<SemanticIndex | null>(null);
  const [hits, setHits] = useState<{ path: string; score: number }[] | null>(null);
  const signature = useMemo(() => notes.map((n) => `${n.path}:${n.mtime}`).join("|"), [notes]);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "off" });
      return;
    }
    let live = true;
    setState({ status: "indexing", done: 0, total: 0 });
    (async () => {
      const source: Indexable[] = isDesktop() ? await listNotesNative() : notes;
      const built = await buildIndex(source, (done, total) => live && setState({ status: "indexing", done, total }), () => live);
      if (!live) return;
      setIndex(built);
      setState({ status: "ready" });
    })().catch((err) => live && setState({ status: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature]);

  const q = query.trim();
  useEffect(() => {
    if (!enabled || !index || !q) {
      setHits(null);
      return;
    }
    let live = true;
    embed([q]).then(
      ([vector]) => live && setHits(rankNotes(vector, index)),
      (err) => live && setState({ status: "error", message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, [enabled, index, q]);

  return { state, hits };
}
