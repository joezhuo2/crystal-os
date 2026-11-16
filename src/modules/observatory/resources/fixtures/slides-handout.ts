import type { PdfDoc, PdfPage, TextItem } from "../types";

const t = (str: string, x: number, y: number, size = 9): TextItem => ({ str, x, y, w: str.length * size * 0.5, h: size });
const B = `${String.fromCharCode(0xf0a7)} `;

const cell = (n: number, title: string, body: [string, number][]): TextItem[] => {
  const pos = (n - 1) % 4;
  const x0 = (pos % 2) * 306;
  const y0 = pos < 2 ? 60 : 420;
  return [
    t("C-style strings", x0 + 40, y0, 8),
    t(String(n), x0 + 150, y0 + 10, 8),
    t(title, x0 + 20, y0 + 30, 14),
    ...body.map(([s, dx], i) => t(s, x0 + dx, y0 + 60 + i * 15)),
  ];
};

const page = (index: number, cells: TextItem[][]): PdfPage => {
  const items = [t("2026-01-05", 540, 20, 8), ...cells.flat(), t(String(index), 590, 770, 8)];
  return { index, width: 612, height: 792, items, text: items.map((i) => i.str).join(" ") };
};

const s1 = cell(1, "C-style strings", [["Arrays of characters", 20]]);
const s2 = cell(2, "Outline", [[`${B}In this presentation, we will:`, 20], [`${B}Review character arrays`, 40], [`${B}Describe the null character`, 40]]);
const s3 = cell(3, "Character arrays", [[`${B}A character array is a sequence of char values`, 20]]);
const s4 = cell(4, "Termination", [[`${B}How long is the string?`, 20]]);
const s5 = cell(5, "Strings", [[`${B}One solution: store the length`, 20]]);
const s6 = cell(6, "Strings", [[`${B}Another solution: mark the end`, 20]]);
const s7 = cell(7, "Default values", [
  [`${B}The default character is the null character:`, 20],
  ["int main() {", 40],
  ["char phrase[10]{};", 58],
  ["return 0;", 58],
  ["}", 40],
]);
const s8 = cell(8, "C-style strings", [[`${B}A C-style string is a character array ending in the null character`, 20]]);

export const handoutDeck: PdfDoc = {
  outline: [],
  pages: [page(1, [s1, s3, s2, s4]), page(2, [s5, s7, s6, s8])],
};
