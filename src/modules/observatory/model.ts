import yaml from "js-yaml";
import { parseFrontmatter } from "../../lib/vaultNative";
import type { Assessment, Exam, OutlineTopic, ParsedOutline } from "./outline";

export type Priority = "high" | "medium" | "low";
export interface Score { label: string; score: number; max?: number; excused?: boolean; missed?: boolean }
export interface Graded { scores?: Score[]; excused_to?: string }
export type GradedExam = Exam & Graded;
export type GradedAssessment = Assessment & Graded;
export interface Course { code: string; name: string; term: string; color: string; learn_url?: string; keywords: string[]; outcomes: string[]; exams: GradedExam[]; assessments: GradedAssessment[]; archived: boolean }
export interface Topic { slug: string; course: string; title: string; priority: Priority; objective: boolean; weeks: number[]; pages?: string; sections: string[]; chapters?: number[]; tutorial?: number; sources: string[]; learn_url?: string; tasks: string[]; events: string[]; body: string }
export interface Progress { version: 1; cards: Record<string, unknown>; mastery: Record<string, number>; log: unknown[] }

export class ProgressError extends Error {}

export const DEFAULT_FOLDER = "Observatory";
export const emptyProgress = (): Progress => ({ version: 1, cards: {}, mastery: {}, log: [] });

export function normalizeCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2,6}\d{2,4}[A-Z]?$/.test(code) ? code : null;
}

export function slugify(title: string, taken?: Set<string>): string {
  const base = title.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic";
  let slug = base;
  for (let n = 2; taken?.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export const coursePath = (folder: string, code: string) => `${folder}/${code}/_course.md`;
export const progressPath = (folder: string, code: string) => `${folder}/${code}/progress.md`;
export const topicPath = (folder: string, code: string, slug: string) => `${folder}/${code}/topics/${slug}.md`;

const note = (frontmatter: object, body = "") =>
  `---\n${yaml.dump(JSON.parse(JSON.stringify(frontmatter)), { lineWidth: -1 })}---\n${body}`;

const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

// Rewrites only `fields`, keeping unknown keys and the body. Throws on YAML it cannot parse rather than replace it.
export function patchNote(raw: string, fields: object): string {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const m = FRONTMATTER.exec(text);
  // CORE_SCHEMA keeps unquoted dates as strings so they are not rewritten as timestamps
  const data: unknown = (m && yaml.load(m[1] ?? "", { schema: yaml.CORE_SCHEMA })) ?? {};
  if (typeof data !== "object" || Array.isArray(data)) throw new Error("Frontmatter is not a mapping");
  return note({ ...data, ...fields }, m ? text.slice(m[0].length) : text);
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
// js-yaml's default schema turns unquoted YYYY-MM-DD into a Date; the web listing sends full ISO strings
const dateString = (v: unknown): string | null =>
  v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).replace(/^(\d{4}-\d{2}-\d{2})T.*$/, "$1");

export const serializeCourse = (c: Course): string => note(c);

export const parseCourse = (raw: string): Course => courseFromData(parseFrontmatter(raw).data);

export function courseFromData(d: Record<string, unknown>): Course {
  const exams = (Array.isArray(d.exams) ? d.exams : []) as GradedExam[];
  return {
    code: String(d.code ?? ""),
    name: String(d.name ?? ""),
    term: String(d.term ?? ""),
    color: String(d.color ?? ""),
    ...(d.learn_url != null && { learn_url: String(d.learn_url) }),
    keywords: strings(d.keywords),
    outcomes: strings(d.outcomes),
    exams: exams.map((e) => ({ ...e, date: dateString(e.date) })),
    assessments: (Array.isArray(d.assessments) ? d.assessments : []) as GradedAssessment[],
    archived: d.archived === true,
  };
}

export function serializeTopic(t: Topic): string {
  const { slug: _slug, body, ...frontmatter } = t;
  return note(frontmatter, body);
}

export function parseTopic(raw: string, slug: string): Topic {
  const { data, content } = parseFrontmatter(raw);
  return topicFromData(data, slug, content);
}

export function topicFromData(d: Record<string, unknown>, slug: string, body = ""): Topic {
  const priority = d.priority === "high" || d.priority === "low" ? d.priority : "medium";
  return {
    slug,
    course: String(d.course ?? ""),
    title: String(d.title ?? slug),
    priority,
    objective: d.objective === true,
    weeks: Array.isArray(d.weeks) ? d.weeks.map(Number) : [],
    ...(d.pages != null && { pages: String(d.pages) }),
    sections: strings(d.sections),
    ...(Array.isArray(d.chapters) && { chapters: d.chapters.map(Number) }),
    ...(d.tutorial != null && { tutorial: Number(d.tutorial) }),
    sources: strings(d.sources),
    ...(d.learn_url != null && { learn_url: String(d.learn_url) }),
    tasks: strings(d.tasks),
    events: strings(d.events),
    body,
  };
}

export const serializeProgress = (p: Progress, summary: string): string =>
  `# Progress\n\n${summary}\n\n\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\`\n`;

export function parseProgress(raw: string): Progress {
  const blocks = [...raw.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)];
  const last = blocks[blocks.length - 1];
  if (!last) return emptyProgress();
  let p: Progress;
  try {
    p = JSON.parse(last[1]!);
  } catch {
    throw new ProgressError("progress.md has a malformed json block");
  }
  if (p?.version !== 1) throw new ProgressError("progress.md has an unsupported version");
  return { ...emptyProgress(), ...p };
}

const outlineTopic = (t: OutlineTopic, slug: string, course: string): Topic => ({
  slug, course, title: t.title, priority: t.objective ? "high" : "medium", objective: t.objective,
  weeks: t.weeks, ...(t.pages !== undefined && { pages: t.pages }), sections: t.sections,
  ...(t.tutorial !== undefined && { tutorial: t.tutorial }),
  sources: [], tasks: [], events: [], body: "",
});

export function outlineToCourse(o: ParsedOutline, color: string): { course: Course; topics: Topic[] } {
  const course: Course = {
    code: o.code, name: o.name, term: o.term, color,
    keywords: [], outcomes: o.outcomes, exams: o.exams, assessments: o.assessments, archived: false,
  };
  const taken = new Set<string>();
  const topics = o.topics.map((t) => {
    const slug = slugify(t.title, taken);
    taken.add(slug);
    return outlineTopic(t, slug, o.code);
  });
  return { course, topics };
}

export const outlineFields = (t: Topic) =>
  ({ weeks: t.weeks, pages: t.pages, sections: t.sections, tutorial: t.tutorial, objective: t.objective });

export interface OutlineMerge { course: Course; added: Topic[]; updated: Topic[]; changes: string[] }

const pct = (w: number) => `${+(w * 100).toFixed(2)}%`;
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function weightChanges(before: { name: string; weight: number }[], after: { name: string; weight: number }[], changes: string[]) {
  for (const a of after) {
    const b = before.find((x) => x.name === a.name);
    if (!b) changes.push(`${a.name} added (${pct(a.weight)})`);
    else if (b.weight !== a.weight) changes.push(`${a.name} weight ${pct(b.weight)} to ${pct(a.weight)}`);
  }
  for (const b of before) if (!after.some((a) => a.name === b.name)) changes.push(`${b.name} removed`);
}

const keepGrades = <T extends { name: string }>(item: T, old?: Graded): T & Graded =>
  ({ ...item, ...(old?.scores && { scores: old.scores }), ...(old?.excused_to && { excused_to: old.excused_to }) });

export function mergeOutline(course: Course, topics: Topic[], o: ParsedOutline): OutlineMerge {
  const changes: string[] = [];
  if (o.name !== course.name) changes.push(`Name: ${course.name || "none"} to ${o.name}`);
  if (o.term !== course.term) changes.push(`Term: ${course.term || "none"} to ${o.term}`);
  const longest = Math.max(o.outcomes.length, course.outcomes.length);
  const outcomes = Array.from({ length: longest }).filter((_, i) => o.outcomes[i] !== course.outcomes[i]).length;
  if (outcomes) changes.push(`${plural(outcomes, "outcome")} changed`);

  const exams = o.exams.map((e) => {
    const old = course.exams.find((x) => x.name === e.name);
    if (old && old.date !== e.date) changes.push(`${e.name} date ${old.date ?? "none"} to ${e.date ?? "none"}`);
    const kept = keepGrades(e, old);
    return old?.event_id ? { ...kept, event_id: old.event_id } : kept;
  });
  const assessments = o.assessments.map((a) => keepGrades(a, course.assessments.find((x) => x.name === a.name)));
  weightChanges(course.exams, o.exams, changes);
  weightChanges(course.assessments, o.assessments, changes);

  const byTitle = new Map(topics.map((t) => [t.title.toLowerCase(), t]));
  const taken = new Set(topics.map((t) => t.slug));
  const added: Topic[] = [];
  const updated: Topic[] = [];
  for (const ot of o.topics) {
    const existing = byTitle.get(ot.title.toLowerCase());
    if (!existing) {
      const slug = slugify(ot.title, taken);
      taken.add(slug);
      added.push(outlineTopic(ot, slug, course.code));
      continue;
    }
    const { pages: _p, tutorial: _t, ...kept } = existing;
    const { title: _title, ...fromOutline } = ot;
    const next: Topic = { ...kept, ...fromOutline };
    if (JSON.stringify(outlineFields(next)) !== JSON.stringify(outlineFields(existing))) updated.push(next);
  }

  return { course: { ...course, name: o.name, term: o.term, outcomes: o.outcomes, exams, assessments }, added, updated, changes };
}
