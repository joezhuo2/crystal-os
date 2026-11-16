import { isTaskOverdue, type RepeatRule } from "./utils";

export interface NowEvent {
  summary: string;
  location: string;
  allDay: boolean;
  startISO: string;
}

export interface NowTask {
  name: string;
  endDate: string;
  completed: boolean;
  repeat?: RepeatRule;
}

export interface NowInput {
  now: Date;
  today: string;
  events: readonly NowEvent[];
  tasks: readonly NowTask[];
  reviewDue: number;
  habitsLeft: number;
}

export interface NowPick {
  kind: "leave" | "event" | "overdue" | "review" | "habits" | "today";
  text: string;
  tab: "calendar" | "tasks" | "observatory" | "orbit";
}

export const SOON_MINUTES = 60;
export const LEAVE_MINUTES = 30;
export const HABIT_REMINDER_HOUR = 18;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const andMore = (first: string, count: number) => (count > 1 ? `${first} and ${count - 1} more` : first);

export function pickNow({ now, today, events, tasks, reviewDue, habitsLeft }: NowInput): NowPick | null {
  const next = events
    .filter((e) => !e.allDay)
    .map((e) => ({ event: e, minutes: Math.ceil((new Date(e.startISO).getTime() - now.getTime()) / 60_000) }))
    .filter((e) => e.minutes > 0 && e.minutes <= SOON_MINUTES)
    .sort((a, b) => a.minutes - b.minutes)[0];
  if (next) {
    const title = next.event.summary || "Your event";
    const leave = next.event.location && next.minutes <= LEAVE_MINUTES;
    return {
      kind: leave ? "leave" : "event",
      text: leave
        ? `Leave now: ${title} at ${next.event.location} starts in ${next.minutes} min`
        : `${title} starts in ${next.minutes} min`,
      tab: "calendar",
    };
  }

  const overdue = tasks.filter((t) => isTaskOverdue(t, today)).sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (overdue.length) return { kind: "overdue", text: andMore(`Overdue: ${overdue[0].name}`, overdue.length), tab: "tasks" };

  if (reviewDue > 0) return { kind: "review", text: `${plural(reviewDue, "card")} to review in The Observatory`, tab: "observatory" };

  if (habitsLeft > 0 && now.getHours() >= HABIT_REMINDER_HOUR) {
    return { kind: "habits", text: `${plural(habitsLeft, "habit")} left to tick today`, tab: "orbit" };
  }

  const dueToday = tasks.filter((t) => !t.completed && t.endDate === today);
  if (dueToday.length) return { kind: "today", text: andMore(`Due today: ${dueToday[0].name}`, dueToday.length), tab: "tasks" };

  return null;
}
