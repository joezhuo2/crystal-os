import { detectChapters, pageLines } from "./chapters";
import type { PdfDoc, ResourceType } from "./types";

export interface Detection { type: ResourceType; confidence: number; reasons: string[] }

type Score = { type: ResourceType; score: number; reasons: string[] };

function repeatedEdgeLine(doc: PdfDoc): string | null {
  if (doc.pages.length < 3) return null;
  const counts = new Map<string, number>();
  for (const p of doc.pages) {
    const lines = pageLines(p);
    const edges = new Set([lines[0]?.text, lines[lines.length - 1]?.text].filter(Boolean).map((t) => t!.toLowerCase().replace(/\d+/g, "#")));
    for (const e of edges) counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  const need = Math.max(2, doc.pages.length * 0.6);
  return [...counts].find(([, n]) => n >= need)?.[0] ?? null;
}

export function detectType(doc: PdfDoc, fileName = ""): Detection {
  const n = doc.pages.length;
  const name = fileName.toLowerCase();
  const firstText = doc.pages.slice(0, 3).map((p) => p.text).join("\n");
  const top = doc.pages[0] ? pageLines(doc.pages[0]).slice(0, 5).map((l) => l.text).join("\n") : "";
  const head = `${name}\n${top}`;
  const scores: Score[] = [];
  const add = (type: ResourceType, score: number, reasons: string[]) => scores.push({ type, score, reasons });

  const outline: string[] = [];
  let o = 0;
  if (/\b[A-Z]{2,6} ?\d{3}[A-Z]?\b/.test(firstText)) { o += 0.2; outline.push("course code on the first pages"); }
  if (/\bASSESSMENTS?\b/.test(firstText) || /\bassessments?\s*:/i.test(firstText)) { o += 0.25; outline.push("assessments heading"); }
  if (/learning (objectives|outcomes)/i.test(firstText)) { o += 0.25; outline.push("learning objectives heading"); }
  if (/course outline|syllabus/i.test(head)) { o += 0.25; outline.push("course outline title"); }
  if ((firstText.match(/\d{1,3}(\.\d+)?\s?%/g)?.length ?? 0) >= 2) { o += 0.2; outline.push("assessment weights"); }
  add("outline", o, outline);

  const slides: string[] = [];
  let s = 0;
  const landscape = n ? doc.pages.filter((p) => p.width > p.height).length / n : 0;
  if (landscape >= 0.6) { s += 0.35; slides.push("landscape pages"); }
  const avg = n ? doc.pages.reduce((a, p) => a + p.text.length, 0) / n : 0;
  if (n >= 3 && avg < 500) { s += 0.2; slides.push("little text per page"); }
  if (repeatedEdgeLine(doc)) { s += 0.35; slides.push("header or footer repeated on most pages"); }
  add("slides", s, slides);

  const sheet: string[] = [];
  let q = 0;
  if (/problem\s*set|practice|worksheet|tutorial|exercises/i.test(head)) { q += 0.45; sheet.push("problem set heading"); }
  const lines = doc.pages.slice(0, 10).flatMap(pageLines);
  const numbered = lines.filter((l) => /^\d{1,2}[.)]\s/.test(l.text)).length;
  if (numbered >= 3 && numbered / Math.max(1, lines.length) >= 0.15) { q += 0.3; sheet.push("mostly numbered problems"); }
  if (lines.some((l) => /\banswers?:/i.test(l.text))) { q += 0.1; sheet.push("inline answers"); }
  if (n <= 15) q += 0.1;
  else if (n > 30) q -= 0.3;
  add("question-sheet", q, sheet);

  const book: string[] = [];
  let b = 0;
  const chapters = detectChapters(doc);
  if (chapters.source === "bookmarks") { b += 0.5; book.push("bookmark outline"); }
  if (chapters.source === "chapter-headings") { b += 0.45; book.push("Chapter N headings"); }
  if (chapters.source === "section-headings") { b += 0.35; book.push("numbered section headings"); }
  if (doc.pages.slice(0, 5).some((p) => /table of contents|^\s*contents\s*$/im.test(p.text))) { b += 0.2; book.push("table of contents"); }
  if (n >= 30) { b += 0.25; book.push("long document"); }
  else if (n >= 15) b += 0.1;
  else if (n < 4) b -= 0.3;
  add("textbook", b, book);

  const assignment: string[] = [];
  let a = 0;
  if (/assignment|homework|\bhw ?\d/i.test(head)) { a += 0.5; assignment.push("assignment title"); }
  if (a && /\bdue\b/i.test(firstText)) { a += 0.2; assignment.push("due date"); }
  add("assignment", a, assignment);

  const exam: string[] = [];
  let e = 0;
  if (/midterm|final exam|\bexam\b|\bquiz\b/i.test(head)) { e += 0.45; exam.push("exam title"); }
  if (e && /instructions|time allowed|duration|student id|name:/i.test(firstText)) { e += 0.2; exam.push("exam instructions"); }
  add("past-exam", e, exam);

  const best = scores.sort((x, y) => y.score - x.score)[0]!;
  if (best.score < 0.3) return { type: "other", confidence: 0.3, reasons: ["no strong signal"] };
  return { type: best.type, confidence: Math.min(0.95, +best.score.toFixed(2)), reasons: best.reasons };
}
