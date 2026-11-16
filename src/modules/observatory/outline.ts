export interface Exam { name: string; date: string | null; weight: number; done?: boolean; event_id?: string }
export interface Assessment { name: string; weight: number }
export interface OutlineTopic { title: string; weeks: number[]; pages?: string; sections: string[]; tutorial?: number; objective: boolean }
export interface ParsedOutline { code: string; name: string; term: string; outcomes: string[]; topics: OutlineTopic[]; exams: Exam[]; assessments: Assessment[] }

export class OutlineError extends Error {}

const TERMS: Record<string, string> = { Winter: "W", Spring: "S", Fall: "F" };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const STOP = new Set(["functions", "function", "with", "and", "the", "intro", "rules", "problems", "values"]);

const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? ([] as string[]);
const clean = (s: string | null | undefined) => (s ?? "").replace(/[\s\u00a0]+/g, " ").trim();

function findTable(doc: Document, id: string): HTMLTableElement | null {
  let el: Element | null = doc.getElementById(id);
  while (el && (el = el.nextElementSibling)) {
    const t = el.tagName === "TABLE" ? el : el.querySelector("table");
    if (t) return t as HTMLTableElement;
    if (el.tagName === "H2") break;
  }
  return null;
}

function tableAfter(doc: Document, id: string): HTMLTableElement {
  const t = findTable(doc, id);
  if (!t) throw new OutlineError("Not a UW course outline");
  return t;
}

const rows = (t: HTMLTableElement) => [...t.querySelectorAll("tr")].map((tr) => [...tr.children] as HTMLElement[]);
const paras = (td: HTMLElement) => [...td.querySelectorAll("p")].map((p) => clean(p.textContent)).filter(Boolean);

function weekParas(doc: Document): [number, string][] {
  const out: [number, string][] = [];
  let el: Element | null = doc.getElementById("tentative_class_plan");
  while (el && (el = el.nextElementSibling) && el.tagName !== "H2") {
    for (const p of el.querySelectorAll("p")) {
      const s = p.querySelector("strong");
      const m = /^Week\s+(\d+)$/i.exec(clean(s?.textContent));
      if (s && m) out.push([Number(m[1]), clean(p.textContent?.replace(s.textContent ?? "", ""))]);
    }
  }
  return out;
}

export function parseUwOutline(html: string, today: Date = new Date()): ParsedOutline {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.getElementById("learning_outcomes")) throw new OutlineError("Not a UW course outline");
  doc.querySelectorAll("br").forEach((br) => br.replaceWith(" "));

  const text = (sel: string) => clean(doc.querySelector(sel)?.textContent);
  const [season, year] = text(".outline-term").split(" ");
  if (!/^\d{4}$/.test(year ?? "")) throw new OutlineError("Not a UW course outline");
  const term = `${year}${TERMS[season] ?? ""}`;

  const outcomes = [...tableAfter(doc, "learning_outcomes").querySelectorAll("td")].map((td) => clean(td.textContent)).filter(Boolean);
  const outcomeWords = words(outcomes.join(" "));
  const isObjective = (title: string) =>
    words(title)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .some((w) => outcomeWords.some((o) => o.startsWith(w.slice(0, 5))));

  const topics = new Map<string, OutlineTopic>();
  const pageRanges = new Map<string, [number, number]>();
  const tutorials: [number, string][] = [];
  const add = (title: string, week: number, sections: string[]) => {
    const t = topics.get(title) ?? { title, weeks: [], sections: [], objective: isObjective(title) };
    topics.set(title, t);
    if (week && !t.weeks.includes(week)) t.weeks.push(week);
    for (const s of sections) if (!t.sections.includes(s)) t.sections.push(s);
  };
  const plan = findTable(doc, "tentative_class_plan");
  for (const [week, body] of plan ? [] : weekParas(doc)) {
    for (const part of body.split(";")) {
      const title = clean(part).replace(/^and\s+/i, "").replace(/\.$/, "").trim();
      if (title && !/room for delayed/i.test(title)) add(title, week, []);
    }
  }
  for (const cells of plan ? rows(plan).filter((r, i) => i > 0 || r.length < 4) : []) {
    if (cells.length === 1) {
      const m = /^(\d+\.\d+)\s+(.+)$/.exec(clean(cells[0].textContent));
      if (m) add(m[2], 0, [`§${m[1]}`]);
      continue;
    }
    if (cells.length < 4) continue;
    const week = Number(/Week\s+(\d+)/i.exec(clean(cells[0]?.textContent))?.[1]);
    const titles = paras(cells[1]).filter((t) => !/reading week|wrap up/i.test(t));
    let pages: [number, number] | undefined;
    const sections: string[] = [];
    for (const p of paras(cells[2])) {
      const m = /pp\.?\s*(\d+)\s*[-–]\s*(\d+)/.exec(p);
      if (m) pages = [Number(m[1]), Number(m[2])];
      else sections.push(p);
    }
    for (const p of paras(cells[3])) {
      const m = /^Tutorial\s+(\d+):/i.exec(p);
      if (m) tutorials.push([Number(m[1]), p.toLowerCase()]);
    }
    for (const title of titles) {
      add(title, week, sections);
      if (pages) {
        const r = pageRanges.get(title);
        pageRanges.set(title, r ? [Math.min(r[0], pages[0]), Math.max(r[1], pages[1])] : pages);
      }
    }
  }
  const out = [...topics.values()].map((t) => {
    const r = pageRanges.get(t.title);
    const tut = tutorials.find(([, s]) => s.includes(t.title.toLowerCase()));
    return { title: t.title, weeks: t.weeks, ...(r && { pages: `${r[0]}-${r[1]}` }), sections: t.sections, ...(tut && { tutorial: tut[0] }), objective: t.objective };
  });

  const exams: Exam[] = [];
  const assessments: Assessment[] = [];
  const assessTable = findTable(doc, "assessments_amp_activities");
  for (const cells of (assessTable ? rows(assessTable) : []).filter((r) => r[0]?.tagName === "TD")) {
    const [name, date, , w] = cells.map((c) => clean(c.textContent));
    const weight = (Number.parseFloat(w) || 0) / 100;
    if (!/exam|midterm|final|test|quiz/i.test(name)) {
      assessments.push({ name, weight });
      continue;
    }
    const m = new RegExp(String.raw`(${MONTHS.join("|")})\s+(\d{1,2})`, "i").exec(date);
    const iso = m ? `${year}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
    const done = iso ? new Date(`${iso}T00:00:00`) < today : false;
    exams.push({ name, date: iso, weight, ...(iso && { done }) });
  }

  return { code: text(".outline-courses").replace(/\s+/g, ""), name: text(".outline-title-full"), term, outcomes, topics: out, exams, assessments };
}
