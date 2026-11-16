import type { PdfDoc, PdfPage, TextItem } from "../types";

const t = (str: string, x: number, y: number, size = 12): TextItem => ({ str, x, y, w: str.length * size * 0.5, h: size });
const page = (index: number, items: TextItem[]): PdfPage => ({ index, width: 720, height: 540, items, text: items.map((i) => i.str).join(" ") });
const footer = (n: number) => [t("Hello world!", 60, 500, 10), t(String(n), 200, 512, 10), t("Course notes", 560, 525, 8)];
const B = `${String.fromCharCode(0xf0a7)} `;

export const helloDeck: PdfDoc = {
  outline: [],
  pages: [
    page(1, [t("ECE 150 Fundamentals of Programming", 80, 60, 24), t("Hello world!", 80, 120, 20), t("Example Authors 2026", 300, 480, 10)]),
    page(2, [
      ...footer(2),
      t("Outline", 40, 30, 24),
      t(`${B}In this presentation, we will:`, 40, 100),
      t(`${B}Describe programs`, 70, 130),
      t(`${B}Define programming languages`, 70, 150),
    ]),
    page(3, [
      t("Programming languages", 40, 30, 24),
      t(`${B}A programming language is a human readable means of specifying`, 40, 100),
      t("the operations a computer is to perform", 58, 118),
      t(`${B}Programming languages are used to generate source code`, 40, 150),
      ...footer(3),
    ]),
    page(4, [
      ...footer(4),
      t("Our first program", 40, 30, 24),
      t(`${B}Here is our first program:`, 40, 100),
      t("int main() {", 80, 140),
      t("std::cout", 104, 158),
      t('<< "Hello world!" << std::endl;', 164, 158),
      t("return 0;", 104, 176),
      t("}", 80, 194),
    ]),
    page(5, [...footer(5), t("Our first program", 40, 30, 24), t(`${B}Compile and run it`, 40, 100)]),
  ],
};
