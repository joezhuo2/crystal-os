import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jbig2Url from "pdfjs-dist/wasm/jbig2.wasm?url";
import openjpegUrl from "pdfjs-dist/wasm/openjpeg.wasm?url";
import qcmsUrl from "pdfjs-dist/wasm/qcms_bg.wasm?url";
import type { PdfBookmark, PdfDoc, PdfPage, Region, TextItem } from "./types";

export type PdfSource = Uint8Array | PDFDocumentProxy;

export interface RawOutlineNode { title: string; dest: string | unknown[] | null; items: RawOutlineNode[] }

const WASM: Record<string, string> = { "jbig2.wasm": jbig2Url, "openjpeg.wasm": openjpegUrl, "qcms_bg.wasm": qcmsUrl };

class BundledBinaryData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === "wasmUrl" ? WASM[filename] : undefined;
    if (!url) throw new Error(`No bundled ${kind} file: ${filename}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function pdfjs() {
  return (pdfjsPromise ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  }));
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  return lib.getDocument({ data: bytes.slice(), useWorkerFetch: false, BinaryDataFactory: BundledBinaryData }).promise;
}

async function withDoc<T>(source: PdfSource, fn: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
  if (!(source instanceof Uint8Array)) return fn(source);
  const doc = await openPdf(source);
  try {
    return await fn(doc);
  } finally {
    await doc.loadingTask.destroy();
  }
}

const SYMBOL_PUA: Record<number, string> = { 0xf8e8: "®", 0xf8e9: "©", 0xf8ea: "™", 0xf8eb: "(", 0xf8ee: "[", 0xf8f2: "{", 0xf8f6: ")", 0xf8f9: "]", 0xf8fd: "}" };

// Symbol fonts draw tall brackets from private-use pieces; keep one bracket per piece stack and drop the rest.
export const cleanGlyphs = (s: string) =>
  s.replace(/[\uE000-\uF8FF]/g, (c) => SYMBOL_PUA[c.codePointAt(0)!] ?? "").replace(/[\uFE00-\uFE0F]/g, "");

export function buildLines(items: TextItem[]): string {
  const words = items.filter((it) => it.str.trim() !== "");
  if (words.length === 0) return "";
  const chars = words.reduce((n, it) => n + it.str.length, 0);
  const charW = Math.max(0.1, words.reduce((n, it) => n + it.w, 0) / chars);
  const left = Math.min(...words.map((it) => it.x));

  const lines: { top: number; bottom: number; items: TextItem[] }[] = [];
  for (const it of [...words].sort((a, b) => b.h - a.h || a.y - b.y)) {
    const mid = it.y + it.h / 2;
    const line = lines.find((l) => mid >= l.top && mid <= l.bottom);
    if (line) {
      line.items.push(it);
      line.top = Math.min(line.top, it.y);
      line.bottom = Math.max(line.bottom, it.y + it.h);
    } else lines.push({ top: it.y, bottom: it.y + it.h, items: [it] });
  }
  lines.sort((a, b) => a.top - b.top);

  const out: string[] = [];
  let prev: { top: number; bottom: number } | null = null;
  for (const line of lines) {
    const h = line.bottom - line.top;
    if (prev && line.top - prev.top > 1.8 * Math.max(h, prev.bottom - prev.top)) out.push("");
    line.items.sort((a, b) => a.x - b.x);
    const [first, ...rest] = line.items;
    let text = " ".repeat(Math.max(0, Math.round((first.x - left) / charW))) + first.str;
    let end = first.x + first.w;
    for (const it of rest) {
      const gap = it.x - end;
      if (gap >= 2 * charW) text += " ".repeat(Math.round(gap / charW));
      else if (gap > 0.15 * charW && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
      text += it.str;
      end = Math.max(end, it.x + it.w);
    }
    out.push(text.trimEnd());
    prev = line;
  }
  return out.join("\n");
}

export async function resolveOutline(
  nodes: RawOutlineNode[],
  pageOf: (dest: string | unknown[]) => Promise<number | null>,
): Promise<PdfBookmark[]> {
  const out: PdfBookmark[] = [];
  for (const node of nodes) {
    const children = await resolveOutline(node.items ?? [], pageOf);
    const page = node.dest ? await pageOf(node.dest).catch(() => null) : null;
    const resolved = page ?? children[0]?.page;
    if (resolved != null) out.push({ title: node.title.trim(), page: resolved, children });
  }
  return out;
}

export function flattenOutline(bookmarks: PdfBookmark[], depth = 0): { title: string; page: number; depth: number }[] {
  return bookmarks.flatMap((b) => [{ title: b.title, page: b.page, depth }, ...flattenOutline(b.children, depth + 1)]);
}

async function pageNumberOf(doc: PDFDocumentProxy, dest: string | unknown[]): Promise<number | null> {
  const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  const target = explicit?.[0];
  if (typeof target === "number") return target + 1;
  if (target && typeof target === "object") return (await doc.getPageIndex(target as { num: number; gen: number })) + 1;
  return null;
}

async function readPage(page: PDFPageProxy): Promise<PdfPage> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const [, , c, d, e, f] = raw.transform as number[];
    const h = raw.height || Math.hypot(c, d);
    const [x, baseline] = viewport.convertToViewportPoint(e, f);
    items.push({ str: cleanGlyphs(raw.str), x, y: baseline - h, w: raw.width, h, font: raw.fontName });
  }
  return { index: page.pageNumber, width: viewport.width, height: viewport.height, items, text: buildLines(items) };
}

export function readPdf(source: PdfSource): Promise<PdfDoc> {
  return withDoc(source, async (doc) => {
    const pages: PdfPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      pages.push(await readPage(page));
      page.cleanup();
    }
    const raw = ((await doc.getOutline()) ?? []) as RawOutlineNode[];
    const outline = await resolveOutline(raw, (dest) => pageNumberOf(doc, dest));
    const meta = await doc.getMetadata().catch(() => null);
    const title = (meta?.info as { Title?: unknown } | undefined)?.Title;
    return { pages, outline, ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}) };
  });
}

async function draw(page: PDFPageProxy, scale: number, crop?: Region): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport(crop ? { scale, offsetX: -crop.x * scale, offsetY: -crop.y * scale } : { scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((crop ? crop.w * scale : viewport.width)));
  canvas.height = Math.max(1, Math.ceil((crop ? crop.h * scale : viewport.height)));
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

export function renderPage(source: PdfSource, pageNumber: number, scale = 2): Promise<HTMLCanvasElement> {
  return withDoc(source, async (doc) => draw(await doc.getPage(pageNumber), scale));
}

export function renderRegion(source: PdfSource, region: Region, scale = 2): Promise<HTMLCanvasElement> {
  return withDoc(source, async (doc) => draw(await doc.getPage(region.page), scale, region));
}
