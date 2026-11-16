import type { ObservatoryTarget } from "@/lib/appUi";
import { computeGrades, neededFor, toGpa } from "./grades";
import type { Course, Topic } from "./model";

export type ObsIcon = "grades" | "course" | "review" | "exam" | "topic" | "pdf" | "inbox";
export interface ObsResult { id: string; title: string; detail: string; icon: ObsIcon; target: ObservatoryTarget | "process-all" }
export interface ObsContext {
  courses: Course[];
  topics: Topic[];
  due: Record<string, number> | null;
  mastery: Record<string, number>;
  unprocessed: number;
  unsorted: number;
  today: string;
}

const DAY = 86_400_000;
const pct = (n: number) => `${Math.round(n)}%`;
const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / DAY);
const inDays = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

function matchCourses(tokens: string[], courses: Course[]): { matched: Course[]; rest: string[] } {
  const by = (t: string) =>
    courses.filter((c) => {
      const code = c.code.toLowerCase();
      return code === t || (/^\d+[a-z]?$/.test(t) && code.replace(/^[a-z]+/, "") === t);
    });
  if (tokens.length > 1 && /^[a-z]+$/.test(tokens[0]!)) {
    const joined = by(tokens[0]! + tokens[1]!);
    if (joined.length) return { matched: joined, rest: tokens.slice(2) };
  }
  const first = tokens[0] ? by(tokens[0]) : [];
  return first.length ? { matched: first, rest: tokens.slice(1) } : { matched: [], rest: tokens };
}

function nextExam(course: Course, today: string) {
  return course.exams.filter((e) => !e.done && e.date && daysUntil(e.date, today) >= 0).sort((a, b) => a.date!.localeCompare(b.date!))[0];
}

function courseResult(course: Course, ctx: ObsContext): ObsResult {
  const g = computeGrades(course);
  const exam = nextExam(course, ctx.today);
  const parts = [
    g.current == null ? "No grades yet" : `Current ${pct(g.current)}`,
    exam && `${exam.name} ${inDays(daysUntil(exam.date!, ctx.today))}`,
    ctx.due && `${ctx.due[course.code] ?? 0} due`,
  ];
  return { id: `course-${course.code}`, title: `${course.code} · ${course.name}`, detail: parts.filter(Boolean).join(" · "), icon: "course", target: { code: course.code, tab: "Overview" } };
}

function neededResult(course: Course, target: number): ObsResult {
  const g = computeGrades(course);
  const n = neededFor(g, target);
  const detail =
    n.status === "secured"
      ? `${pct(target)} is already secured`
      : n.status === "impossible"
        ? `${pct(target)} is out of reach${n.average == null ? "" : ` (needs ${pct(n.average)})`}`
        : `Need ${pct(n.average!)} average on the remaining ${pct(g.remainingWeight * 100)}`;
  return { id: `need-${course.code}-${target}`, title: `${course.code}: finish at ${pct(target)}`, detail, icon: "grades", target: { code: course.code, tab: "Grades" } };
}

function itemResults(course: Course, words: string[], ctx: ObsContext): ObsResult[] {
  const g = computeGrades(course);
  return g.items
    .filter((item) => words.every((w) => item.name.toLowerCase().includes(w)))
    .map((item) => {
      const exam = course.exams.find((e) => e.name === item.name);
      const date = exam?.date ? `${exam.date}${daysUntil(exam.date, ctx.today) >= 0 ? ` (${inDays(daysUntil(exam.date, ctx.today))})` : ""}` : null;
      const score = item.average == null ? "not graded yet" : `scored ${pct(item.average)}`;
      return {
        id: `item-${course.code}-${item.name}`,
        title: `${course.code} ${item.name}`,
        detail: [`Worth ${pct(item.weight * 100)}`, date, score].filter(Boolean).join(" · "),
        icon: item.kind === "exam" ? "exam" : "grades",
        target: { code: course.code, tab: "Grades" },
      };
    });
}

export function observatoryResults(query: string, ctx: ObsContext): ObsResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const active = ctx.courses.filter((c) => !c.archived);
  const tokens = q.split(/\s+/);
  const out: ObsResult[] = [];

  if ("grades".startsWith(q) && q.length >= 3) {
    for (const c of active) {
      const g = computeGrades(c);
      out.push({
        id: `grades-${c.code}`,
        title: `${c.code} grades`,
        detail: g.current == null ? "No grades yet" : `Current ${pct(g.current)} (${toGpa(g.current).toFixed(1)} GPA) · projected ${g.projected == null ? "–" : pct(g.projected)}`,
        icon: "grades",
        target: { code: c.code, tab: "Grades" },
      });
    }
  }

  if ("exams".startsWith(q) && q.length >= 3) {
    const upcoming = active
      .flatMap((c) => c.exams.filter((e) => !e.done && e.date && daysUntil(e.date, ctx.today) >= 0).map((e) => ({ c, e })))
      .sort((a, b) => a.e.date!.localeCompare(b.e.date!));
    for (const { c, e } of upcoming) {
      const weight = computeGrades(c).items.find((i) => i.name === e.name)?.weight ?? 0;
      out.push({ id: `exam-${c.code}-${e.name}`, title: `${c.code} ${e.name}`, detail: `${inDays(daysUntil(e.date!, ctx.today))} · worth ${pct(weight * 100)}`, icon: "exam", target: { code: c.code, tab: "Overview" } });
    }
  }

  if (tokens[0] && "review".startsWith(tokens[0]) && tokens[0].length >= 3) {
    const { matched } = matchCourses(tokens.slice(1), active);
    const scope = tokens.length > 1 ? matched : [];
    if (tokens.length === 1) {
      const total = ctx.due ? active.reduce((n, c) => n + (ctx.due![c.code] ?? 0), 0) : null;
      out.push({ id: "review-all", title: "Start review", detail: total == null ? "All courses" : `${total} card${total === 1 ? "" : "s"} due`, icon: "review", target: { view: "review" } });
    }
    for (const c of scope)
      out.push({ id: `review-${c.code}`, title: `Review ${c.code}`, detail: ctx.due ? `${ctx.due[c.code] ?? 0} due` : c.name, icon: "review", target: { view: "review", code: c.code } });
  }

  if (q.length >= 3 && "process all".startsWith(q)) out.push({ id: "process-all", title: "Process all PDFs", detail: `${ctx.unprocessed} unprocessed`, icon: "pdf", target: "process-all" });
  if (q.length >= 3 && ("inbox".startsWith(q) || "_inbox".startsWith(q))) out.push({ id: "inbox", title: "Open _inbox", detail: `${ctx.unsorted} unsorted`, icon: "inbox", target: { view: "inbox" } });

  const { matched, rest } = matchCourses(tokens, active);
  for (const c of matched) {
    if (!rest.length) out.push(courseResult(c, ctx));
    else if (rest[0] === "need" && rest.length === 2 && Number.isFinite(Number(rest[1]!.replace("%", "")))) out.push(neededResult(c, Number(rest[1]!.replace("%", ""))));
    else out.push(...itemResults(c, rest, ctx));
  }

  if (q.length >= 3 && !matched.length) {
    const live = new Set(active.map((c) => c.code));
    for (const t of ctx.topics.filter((t) => live.has(t.course) && t.title.toLowerCase().includes(q)).slice(0, 6)) {
      const key = `${t.course}/${t.slug}`;
      const parts = [t.course, ctx.mastery[key] != null && `${pct(ctx.mastery[key]! * 100)} mastered`, ctx.due && `${ctx.due[key] ?? 0} due`];
      out.push({ id: `topic-${key}`, title: t.title, detail: parts.filter(Boolean).join(" · "), icon: "topic", target: { code: t.course, tab: "Topics", topic: t.slug } });
    }
  }
  return out;
}
