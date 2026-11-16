import type { PdfBookmark, PdfDoc, PdfPage, TextItem } from "../types";

export type FixtureLine = string | { t: string; h?: number; x?: number; gap?: number };

export function page(index: number, lines: FixtureLine[], size: { width?: number; height?: number } = {}): PdfPage {
  const items: TextItem[] = [];
  let y = 72;
  for (const raw of lines) {
    const l = typeof raw === "string" ? { t: raw } : raw;
    const h = l.h ?? 10;
    y += l.gap ?? 0;
    let x = l.x ?? 72;
    for (const str of l.t.split("|")) {
      const w = str.length * h * 0.5;
      items.push({ str, x, y, w, h });
      x += w + h * 0.3;
    }
    y += h * 1.4;
  }
  return {
    index, width: size.width ?? 612, height: size.height ?? 792, items,
    text: lines.map((l) => (typeof l === "string" ? l : l.t).replace(/\|/g, " ")).join("\n"),
  };
}

export const doc = (pages: FixtureLine[][], outline: PdfBookmark[] = [], size?: { width?: number; height?: number }): PdfDoc =>
  ({ pages: pages.map((lines, i) => page(i + 1, lines, size)), outline });

export const bm = (title: string, page: number, children: PdfBookmark[] = []): PdfBookmark => ({ title, page, children });

export const filler = (n: number, word = "Body text about functions and limits") => Array.from({ length: n }, () => word);
