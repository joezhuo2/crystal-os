import { DefaultScheduler, type DefaultSchedulerCard } from "ts-fsrs";
import type { Progress } from "./model";
import type { Question } from "./questions";
import { capDue } from "./queue";
import { updateProgress } from "./store";

export type Grade = 1 | 2 | 3 | 4;
export type Scheduler = DefaultScheduler;
type Card = DefaultSchedulerCard;
export type StoredCard = Omit<Card, "dueAt" | "lastReviewAt"> & { dueAt: string; lastReviewAt: string | null };
export interface ReviewEntry { kind: "review"; card: string; grade: Grade; at: string; state: number }
export interface ObservationEntry { kind: "observation"; topic: string; at: string }
export type LogEntry = ReviewEntry | ObservationEntry;

export const DEFAULT_RETENTION = 0.9;
export const NEW_STATE = 0;

const schedulers = new Map<number, Promise<Scheduler>>();

export function getScheduler(retention = DEFAULT_RETENTION): Promise<Scheduler> {
  let s = schedulers.get(retention);
  if (!s) {
    s = DefaultScheduler({ desiredRetention: retention });
    schedulers.set(retention, s);
    s.catch(() => schedulers.delete(retention));
  }
  return s;
}

export const cardKey = (topic: string, questionId: string) => `${topic}/${questionId}`;

export const toStored = (c: Card): StoredCard => JSON.parse(JSON.stringify(c));

export const fromStored = (s: StoredCard): Card =>
  ({ ...s, dueAt: new Date(s.dueAt), lastReviewAt: s.lastReviewAt ? new Date(s.lastReviewAt) : null }) as Card;

export function readCard(p: Progress, key: string): StoredCard | null {
  const c = p.cards[key] as Partial<StoredCard> | undefined;
  return c && typeof c === "object" && typeof c.dueAt === "string" && !isNaN(Date.parse(c.dueAt)) && typeof c.stability === "number"
    ? (c as StoredCard)
    : null;
}

export const logEntries = (p: Progress): LogEntry[] =>
  p.log.filter((e): e is LogEntry => {
    const x = e as Partial<LogEntry> | null;
    return !!x && (x.kind === "review" || x.kind === "observation") && typeof x.at === "string";
  });

export const newCard = (s: Scheduler, now: Date): StoredCard => toStored(s.newCard({ now }));

export function schedule(s: Scheduler, card: StoredCard | null, grade: Grade, now: Date, key: string): { card: StoredCard; entry: ReviewEntry } {
  const { card: next, revlog } = s.review({ card: card ? fromStored(card) : s.newCard({ now }), now, grade });
  return { card: toStored(next), entry: { kind: "review", card: key, grade, at: now.toISOString(), state: revlog.state } };
}

export const gradeMc = (q: Extract<Question, { type: "mc" }>, picked: number[]): Grade => {
  const correct = q.options.flatMap((o, i) => (o.correct ? [i] : []));
  return correct.length === picked.length && correct.every((i) => picked.includes(i)) ? 3 : 1;
};

const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();
export const gradeOutput = (q: Extract<Question, { type: "output" }>, typed: string): Grade => (norm(typed) === norm(q.expected) ? 3 : 1);

export const gradeBug = (q: Extract<Question, { type: "bug" }>, line: number): Grade => (q.line === line ? 3 : 1);

export function progressSummary(p: Progress): string {
  const reviews = logEntries(p).filter((e) => e.kind === "review").length;
  return reviews ? `${reviews} review${reviews === 1 ? "" : "s"} logged.` : "No reviews yet.";
}

export async function recordReview(
  folder: string,
  code: string,
  topic: string,
  questionId: string,
  grade: Grade,
  { now = new Date(), retention = DEFAULT_RETENTION, deadline = null }: { now?: Date; retention?: number; deadline?: string | null } = {},
): Promise<Progress> {
  const s = await getScheduler(retention);
  const key = cardKey(topic, questionId);
  return updateProgress(folder, code, (p) => {
    const { card, entry } = schedule(s, readCard(p, key), grade, now, key);
    return { ...p, cards: { ...p.cards, [key]: capDue(card, deadline) }, log: [...p.log, entry] };
  }, progressSummary);
}

export function recordObservation(folder: string, code: string, topic: string, now = new Date()): Promise<Progress> {
  const entry: ObservationEntry = { kind: "observation", topic, at: now.toISOString() };
  return updateProgress(folder, code, (p) => ({ ...p, log: [...p.log, entry] }), progressSummary);
}
