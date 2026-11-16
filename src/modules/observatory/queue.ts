import type { Course, Priority, Progress, Topic } from "./model";
import { parseQuestions, topicSummary, type Question } from "./questions";
import { cardKey, logEntries, NEW_STATE, readCard, type StoredCard } from "./srs";
import { dayKey } from "./stats";

export const DEFAULT_NEW_PER_DAY = 10;
const BASE: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export interface CourseStudy { course: Course; topics: Topic[]; progress: Progress; overrides?: Record<string, number> }
export interface QueueItem { course: string; topic: Topic; question: Question; key: string; card: StoredCard | null; score: number; deadline: string | null }
export interface Observation { course: string; topic: Topic; summary: string | null; items: QueueItem[] }

export const priorityScore = (t: Topic, override?: number): number =>
  override ?? BASE[t.priority] * (1 + (t.objective ? 0.5 : 0) + (t.tutorial != null ? 0.25 : 0));

const DAY = 86_400_000;
export const examStart = (date: string) => new Date(`${date}T00:00:00`);

export function deadlineFor(course: Course, topic: Topic, now: Date): string | null {
  const upcoming = course.exams
    .filter((e) => !e.done && e.date && examStart(e.date).getTime() > now.getTime())
    .sort((a, b) => a.date!.localeCompare(b.date!));
  return (upcoming.find((e) => e.event_id && topic.events.includes(e.event_id)) ?? upcoming[0])?.date ?? null;
}

export function examUrgency(deadline: string | null, now: Date): number {
  if (!deadline) return 1;
  const days = (examStart(deadline).getTime() - now.getTime()) / DAY;
  if (days < 0 || days > 21) return 1;
  return days > 7 ? 1 + (21 - days) / 14 : 2 + (3 * (7 - days)) / 7;
}

export const capDue = (card: StoredCard, deadline: string | null): StoredCard =>
  deadline && Date.parse(card.dueAt) > examStart(deadline).getTime() ? { ...card, dueAt: examStart(deadline).toISOString() } : card;

export function overdueRatio(card: StoredCard, now: Date): number {
  const due = Date.parse(card.dueAt);
  const last = card.lastReviewAt ? Date.parse(card.lastReviewAt) : due;
  return (now.getTime() - last) / Math.max(due - last, 60_000);
}

export function newIntroducedToday(progress: Progress, now: Date): number {
  const today = dayKey(now);
  return logEntries(progress).filter((e) => e.kind === "review" && e.state === NEW_STATE && dayKey(e.at) === today).length;
}

const top = (items: QueueItem[]) => Math.max(...items.map((i) => i.score));

export function buildQueue(courses: CourseStudy[], { now = new Date(), newPerDay = DEFAULT_NEW_PER_DAY } = {}): QueueItem[] {
  const due: QueueItem[][] = [];
  const fresh: QueueItem[][] = [];
  for (const { course, topics, progress, overrides } of courses) {
    if (course.archived) continue;
    let budget = Math.max(0, newPerDay - newIntroducedToday(progress, now));
    const ranked = topics.map((topic) => ({ topic, score: priorityScore(topic, overrides?.[topic.slug]) * examUrgency(deadlineFor(course, topic, now), now) })).sort((a, b) => b.score - a.score);
    for (const { topic, score } of ranked) {
      const deadline = deadlineFor(course, topic, now);
      const dueItems: QueueItem[] = [];
      const newItems: QueueItem[] = [];
      for (const question of parseQuestions(topic.body)) {
        const key = cardKey(topic.slug, question.id);
        const stored = readCard(progress, key);
        const card = stored && capDue(stored, deadline);
        const item = { course: course.code, topic, question, key, card, score, deadline };
        if (!card) {
          if (budget > 0) {
            budget--;
            newItems.push(item);
          }
        } else if (Date.parse(card.dueAt) <= now.getTime()) dueItems.push({ ...item, score: score * overdueRatio(card, now) });
      }
      if (dueItems.length) due.push(dueItems.sort((a, b) => b.score - a.score));
      if (newItems.length) fresh.push(newItems);
    }
  }
  due.sort((a, b) => top(b) - top(a));
  fresh.sort((a, b) => top(b) - top(a));
  return [...due, ...fresh].flat();
}

export function buildObservations(queue: QueueItem[], size = 3): Observation[] {
  const out: Observation[] = [];
  for (const item of queue) {
    const last = out[out.length - 1];
    if (last && last.course === item.course && last.topic.slug === item.topic.slug && last.items.length < size) last.items.push(item);
    else out.push({ course: item.course, topic: item.topic, summary: topicSummary(item.topic.body), items: [item] });
  }
  return out;
}
