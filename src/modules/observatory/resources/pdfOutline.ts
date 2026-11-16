import { normalizeCode } from "../model";
import { OutlineError } from "../outline";
import type { Assessment, Exam, OutlineTopic, ParsedOutline } from "../outline";
import { BULLET, toLines, type Line } from "./slides";
import type { PdfDoc } from "./types";

export type OutlineConfidence = Record<keyof ParsedOutline, number>;
export interface PdfOutline { outline: ParsedOutline; confidence: OutlineConfidence }

type PLine = Line & { page: number };

const TERMS: Record<string, string> = { winter: "W", spring: "S", fall: "F" };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?/i;
const CODE = /\b([A-Z]{2,5})\s?(\d{3}[A-Z]?)\b/;
const TERM = /\b(fall|winter|spring)\s+(?:term\s+)?(\d{4})\b/i;
const EXAM = /\b(exam|midterm|final|test|quiz)\b/i;
const WEIGHT_HEAD = /^([A-Za-z][^=+%]{1,60}?)\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)\s*:?$/;
const WEIGHT_ROW = /^([A-Za-z][^=+%.:;]{1,60}?)\s+(\d+(?:\.\d+)?)\s*%$/;
const SIGNS = /course outline|syllabus|grading|marking scheme|assessments?|learning (?:outcomes|objectives)/i;

const isHeading = (t: string) => (/^[A-Z][A-Z0-9 ,/&()'-]{2,}:?$/.test(t) && /[A-Z]{3}/.test(t)) || (/:$/.test(t) && t.split(/\s+/).length <= 5 && !BULLET.test(t));

export function parsePdfOutline(doc: PdfDoc, today: Date = new Date(), fileName = ""): PdfOutline {
  const lines: PLine[] = doc.pages.flatMap((p) => toLines(p.items).map((l) => ({ ...l, page: p.index }))).filter((l) => !/^\d{1,3}$/.test(l.text));
  const all = lines.map((l) => l.text).join("\n");
  const meta = `${doc.title ?? ""} ${fileName}`.replace(/_/g, " ");
  const section = (head: RegExp) => {
    const i = lines.findIndex((l) => (isHeading(l.text) || l.text.split(/\s+/).length <= 4) && head.test(l.text));
    if (i < 0) return null;
    const end = lines.findIndex((l, j) => j > i && isHeading(l.text));
    return lines.slice(i + 1, end < 0 ? undefined : end);
  };

  let code = "";
  let codeConf = 0;
  let name = "";
  let nameConf = 0;
  const head = lines.slice(0, 15).findIndex((l) => CODE.test(l.text));
  const m = head >= 0 ? CODE.exec(lines[head].text) : CODE.exec(meta) ?? CODE.exec(all);
  if (m) {
    code = normalizeCode(m[1] + m[2]) ?? "";
    codeConf = head >= 0 ? (head < 5 ? 0.9 : 0.7) : CODE.test(meta) ? 0.7 : 0.4;
  }
  if (head >= 0) {
    const paren = /^\((.+)\)$/.exec(lines[head + 1]?.text ?? "");
    const rest = lines[head].text.replace(CODE, "").replace(/^[\s:\u2013-]+/, "").trim();
    if (paren) [name, nameConf] = [paren[1].trim(), 0.9];
    else if (rest.length >= 3) [name, nameConf] = [rest, 0.7];
  }

  const t = TERM.exec(all) ?? TERM.exec(meta);
  const term = t ? `${t[2]}${TERMS[t[1].toLowerCase()]}` : "";
  const termConf = t ? (TERM.test(all) ? 0.9 : 0.7) : 0;

  let outcomes: string[] = [];
  let outcomesConf = 0;
  const outSec = section(/^(learning|course)\s+(objectives|outcomes)\b/i);
  if (outSec?.length) {
    const items: string[] = [];
    for (const l of outSec) {
      if (BULLET.test(l.text)) items.push(l.text.replace(BULLET, "").trim());
      else if (items.length) items[items.length - 1] += ` ${l.text}`;
    }
    if (items.length) [outcomes, outcomesConf] = [items, 0.8];
    else {
      const stop = outSec.findIndex((l, i) => i > 0 && l.page === outSec[i - 1].page && l.y - outSec[i - 1].y > l.h * 1.8);
      const para = outSec.slice(0, stop < 0 ? undefined : stop).map((l) => l.text).join(" ");
      outcomes = para.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
      outcomesConf = outcomes.length ? 0.4 : 0;
    }
  }

  const alt = lines.findIndex((l) => /alternat\w*\s+(marking|grading)/i.test(l.text));
  const main = alt < 0 ? lines : lines.slice(0, alt);
  const found: { name: string; weight: number; at: number; head: boolean }[] = [];
  main.forEach((l, at) => {
    const hw = WEIGHT_HEAD.exec(l.text);
    const w = hw ?? (l.text.split(/\s+/).length <= 7 ? WEIGHT_ROW.exec(l.text) : null);
    const n = w?.[1].trim();
    if (w && n && !found.some((f) => f.name.toLowerCase() === n.toLowerCase())) found.push({ name: n, weight: Number(w[2]) / 100, at, head: !!hw });
  });
  const sum = found.reduce((s, f) => s + f.weight, 0);
  const weightConf = !found.length ? 0 : Math.abs(sum - 1) < 0.011 ? 0.9 : 0.5;

  const isWindow = (s: string) => /exam\s+(period|session|window)/i.test(s) && DATE.test(s);
  const windowLine = lines.find((l) => isWindow(l.text))?.text;
  const year = Number(t?.[2] ?? (windowLine && /\b(20\d{2})\b/.exec(windowLine)?.[1]) ?? today.getFullYear());
  const iso = (s: string) => {
    const d = DATE.exec(s);
    if (!d) return null;
    const y = t ? year : Number(d[3] ?? year);
    return `${y}-${String(MONTHS.indexOf(d[1].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${d[2].padStart(2, "0")}`;
  };

  const exams: Exam[] = [];
  const assessments: Assessment[] = [];
  let dateConf = 1;
  found.forEach((f, i) => {
    if (!EXAM.test(f.name)) return void assessments.push({ name: f.name, weight: f.weight });
    const stop = main.findIndex((l, j) => j > f.at && (j === found[i + 1]?.at || isHeading(l.text)));
    const own = f.head ? iso(main.slice(f.at + 1, stop < 0 ? undefined : stop).map((l) => l.text).join(" ")) : null;
    const key = EXAM.exec(f.name)![1].toLowerCase();
    const near = iso(main.find((l) => l.text.toLowerCase().includes(key) && DATE.test(l.text) && !isWindow(l.text))?.text ?? "");
    const date = own ?? near ?? (/final/i.test(f.name) && windowLine ? iso(windowLine) : null);
    dateConf = Math.min(dateConf, own ? 0.8 : near ? 0.6 : date ? 0.5 : 0.3);
    exams.push({ name: f.name, date, weight: f.weight, ...(date && { done: new Date(`${date}T00:00:00`) < today }) });
  });

  const topics: OutlineTopic[] = [];
  for (const l of lines) {
    const w = /^Week\s+(\d+)\s*[:.\u2013-]?\s+(.+)$/i.exec(l.text);
    for (const title of w ? w[2].split(";").map((s) => s.trim().replace(/\.$/, "")) : []) {
      if (!title || /reading week|review|midterm|exam/i.test(title)) continue;
      const old = topics.find((x) => x.title === title);
      if (old) old.weeks.push(Number(w![1]));
      else topics.push({ title, weeks: [Number(w![1])], sections: [], objective: false });
    }
  }

  const garbled = (all.match(/\uFFFD/g)?.length ?? 0) / Math.max(1, all.length) > 0.02;
  if (all.trim() && !garbled && !code && !found.length && !outSec && !SIGNS.test(all)) throw new OutlineError("Not a course outline");
  const k = garbled ? 0.5 : 1;
  const confidence: OutlineConfidence = {
    code: codeConf * k,
    name: nameConf * k,
    term: termConf * k,
    outcomes: outcomesConf * k,
    topics: (topics.length ? 0.6 : 0.5) * k,
    exams: (exams.length ? Math.min(weightConf, dateConf) : weightConf) * k,
    assessments: weightConf * k,
  };
  return { outline: { code, name, term, outcomes, topics, exams, assessments }, confidence };
}
