import { describe, expect, it } from "vitest";
import { buildLines, flattenOutline, readPdf, resolveOutline, type RawOutlineNode } from "./pdf";
import type { TextItem } from "./types";

const item = (str: string, x: number, y: number, w = str.length * 6, h = 10): TextItem => ({ str, x, y, w, h });

describe("buildLines", () => {
  it("groups items by line, orders by x and keeps indentation", () => {
    const text = buildLines([
      item("return 0;", 44, 24),
      item("{", 86, 10),
      item("int main()", 20, 10),
      item("}", 20, 38),
    ]);
    expect(text).toBe("int main() {\n    return 0;\n}");
  });

  it("keeps a superscript on its line and splits off a fraction numerator", () => {
    const text = buildLines([item("y = x", 0, 50), item("2", 30, 47, 4, 7), item("1", 60, 38), item("f =", 40, 52)]);
    expect(text.split("\n")).toEqual(["          1", "y = x2 f ="]);
  });

  it("adds a blank line for a large vertical gap and ignores whitespace items", () => {
    expect(buildLines([item("A", 0, 0), item("  ", 10, 0), item("B", 0, 40)])).toBe("A\n\nB");
    expect(buildLines([])).toBe("");
  });
});

describe("outline", () => {
  const nodes: RawOutlineNode[] = [
    { title: " Chapter 1 ", dest: "ch1", items: [{ title: "1.1 Limits", dest: [{ num: 9, gen: 0 }], items: [] }] },
    { title: "Part II", dest: null, items: [{ title: "Chapter 2", dest: "ch2", items: [] }] },
    { title: "Website", dest: null, items: [] },
  ];
  const pages: Record<string, number> = { ch1: 3, ch2: 40 };
  const pageOf = async (dest: string | unknown[]) => (typeof dest === "string" ? pages[dest] : 5);

  it("resolves destinations, borrows a child's page and drops unresolvable leaves", async () => {
    const outline = await resolveOutline(nodes, pageOf);
    expect(outline).toEqual([
      { title: "Chapter 1", page: 3, children: [{ title: "1.1 Limits", page: 5, children: [] }] },
      { title: "Part II", page: 40, children: [{ title: "Chapter 2", page: 40, children: [] }] },
    ]);
    expect(flattenOutline(outline)).toEqual([
      { title: "Chapter 1", page: 3, depth: 0 },
      { title: "1.1 Limits", page: 5, depth: 1 },
      { title: "Part II", page: 40, depth: 0 },
      { title: "Chapter 2", page: 40, depth: 1 },
    ]);
  });

  it("treats a failing destination lookup as unresolved", async () => {
    const outline = await resolveOutline([{ title: "Broken", dest: "x", items: [] }], () => Promise.reject(new Error("bad")));
    expect(outline).toEqual([]);
  });
});

function tinyPdf(): Uint8Array {
  const stream = "BT /F1 10 Tf 20 170 Td (int main\\(\\) {) Tj ET BT /F1 10 Tf 44 156 Td (return 0;) Tj ET BT /F1 10 Tf 20 142 Td (}) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    "<< /Title (Chapter 1) /Parent 5 0 R /Dest [3 0 R /XYZ 0 200 0] >>",
    "<< /Title (Tiny) >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((obj, i) => {
    const at = body.length;
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return at;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

describe("readPdf with pdf.js", () => {
  it("extracts page size, positioned text, rebuilt lines, outline and title", async () => {
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await lib.getDocument({ data: tinyPdf(), verbosity: 0 }).promise;
    try {
      const pdf = await readPdf(doc);
      expect(pdf.title).toBe("Tiny");
      expect(pdf.outline).toEqual([{ title: "Chapter 1", page: 1, children: [] }]);
      const [page] = pdf.pages;
      expect(page).toMatchObject({ index: 1, width: 300, height: 200 });
      expect(page.text).toBe("int main() {\n    return 0;\n}");
      const ret = page.items.find((it) => it.str === "return 0;");
      expect(ret?.x).toBeCloseTo(44);
      expect(ret?.y).toBeCloseTo(200 - 156 - 10);
      expect(ret?.w).toBeCloseTo(54);
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});
