import type { FinancialCategory, Task, TaskCategory, Transaction } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";

export const SNAPSHOT_EVENT_DAYS = 14;
export const SNAPSHOT_TRANSACTION_DAYS = 60;
export const SNAPSHOT_PREAMBLE =
  "Snapshot of the user's Crystal OS data, read-only. Answer the question from it; do not edit files or run commands for this. If the snapshot does not hold the answer, say so.";

const MAX_TASKS = 80;
const MAX_EVENTS = 60;
const MAX_TRANSACTIONS = 80;
const MAX_NOTES = 5;

export interface SnapshotNote {
  path: string;
  title: string;
  matchContext?: string;
  excerpt?: string;
}

export interface SnapshotInput {
  now: Date;
  today: string;
  tasks: Task[];
  taskCategories: TaskCategory[];
  events: CalendarEvent[] | null;
  transactions: Transaction[];
  financialCategories: FinancialCategory[];
  notes: SnapshotNote[];
  workDay?: { dayStart: string; dayEnd: string };
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const more = (total: number, shown: number) => (total > shown ? [`- (${total - shown} more not shown)`] : []);

function dateOffset(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildDataSnapshot(input: SnapshotInput): string {
  const { today } = input;
  const name = (categories: { id: string; name: string }[], id: string) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const weekday = input.now.toLocaleDateString("en-US", { weekday: "long" });

  const open = input.tasks.filter((t) => !t.completed).sort((a, b) => a.endDate.localeCompare(b.endDate));
  const taskLines = open.slice(0, MAX_TASKS).map((t) => {
    const parts = [
      `due ${t.endDate}${t.endTime ? ` ${t.endTime}` : ""}`,
      t.endDate < today ? "overdue" : null,
      t.priority,
      name(input.taskCategories, t.categoryId),
      t.estimateMinutes ? `${t.estimateMinutes} min` : null,
      t.someday ? "snoozed to someday" : t.snoozedUntil && t.snoozedUntil > today ? `snoozed until ${t.snoozedUntil}` : null,
    ].filter(Boolean);
    return `- ${oneLine(t.name)} (${parts.join(", ")})`;
  });

  const until = dateOffset(today, SNAPSHOT_EVENT_DAYS);
  const upcoming = (input.events ?? [])
    .filter((e) => e.endDate >= today && e.startDate <= until)
    .sort((a, b) => a.startISO.localeCompare(b.startISO));
  const eventLines = upcoming.slice(0, MAX_EVENTS).map((e) => {
    const when = e.allDay ? `${e.startDate} all day` : `${e.startDate} ${e.startTime}–${e.endTime}`;
    return `- ${when}: ${oneLine(e.summary) || "(No title)"}${e.location ? ` @ ${oneLine(e.location)}` : ""}`;
  });

  const since = dateOffset(today, -SNAPSHOT_TRANSACTION_DAYS);
  const recent = input.transactions.filter((t) => t.date >= since).sort((a, b) => b.date.localeCompare(a.date));
  const sum = (type: Transaction["type"]) => recent.filter((t) => t.type === type).reduce((total, t) => total + t.amount, 0);
  const moneyLines = recent
    .slice(0, MAX_TRANSACTIONS)
    .map((t) => `- ${t.date}: ${t.type === "income" ? "+" : "-"}${t.amount.toFixed(2)} ${oneLine(t.name)} (${name(input.financialCategories, t.categoryId)})`);

  const noteLines = input.notes
    .slice(0, MAX_NOTES)
    .map((n) => `- ${n.title} (${n.path}): ${oneLine(n.matchContext ?? n.excerpt ?? "").slice(0, 300)}`);

  return [
    SNAPSHOT_PREAMBLE,
    `Now: ${weekday} ${today} ${String(input.now.getHours()).padStart(2, "0")}:${String(input.now.getMinutes()).padStart(2, "0")} (local time).${
      input.workDay ? ` Work day: ${input.workDay.dayStart}–${input.workDay.dayEnd}.` : ""
    }`,
    `## Open tasks (${open.length})`,
    ...(taskLines.length ? taskLines : ["- none"]),
    ...more(open.length, taskLines.length),
    `## Calendar, next ${SNAPSHOT_EVENT_DAYS} days`,
    ...(input.events === null ? ["- Google Calendar is not connected."] : eventLines.length ? eventLines : ["- no events"]),
    ...more(upcoming.length, eventLines.length),
    `## Money, last ${SNAPSHOT_TRANSACTION_DAYS} days (income ${sum("income").toFixed(2)}, spending ${sum("expense").toFixed(2)})`,
    ...(moneyLines.length ? moneyLines : ["- no transactions"]),
    ...more(recent.length, moneyLines.length),
    "## Notes matching the question",
    ...(noteLines.length ? noteLines : ["- none"]),
  ].join("\n");
}
