import type { MailItem } from "@/lib/mail";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";

export const PALETTE_EVENT_DAYS_BACK = 365;
export const PALETTE_EVENT_DAYS_AHEAD = 365;
const LIMIT = 5;

const has = (query: string, ...fields: (string | undefined)[]) =>
  fields.some((f) => f?.toLowerCase().includes(query));

export function searchMail(items: MailItem[], query: string): MailItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return items
    .filter((m) => has(q, m.subject, m.from, m.fromAddress, m.company, m.snippet))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, LIMIT);
}

export function searchEvents(events: CalendarEvent[], query: string, today: string): CalendarEvent[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = events.filter((e) => has(q, e.summary, e.location, e.description));
  const upcoming = hits.filter((e) => e.endDate >= today).sort((a, b) => a.startISO.localeCompare(b.startISO));
  const past = hits.filter((e) => e.endDate < today).sort((a, b) => b.startISO.localeCompare(a.startISO));
  return [...upcoming, ...past].slice(0, LIMIT);
}

export type SearchType = "task" | "transaction" | "event" | "mail" | "note" | "chat";

export interface SearchFilters {
  text: string;
  type: SearchType | null;
  dueBy: string | null;
  overdue: boolean;
  tag: string | null;
  active: boolean;
}

const TYPE_ALIASES: Record<string, SearchType> = {
  task: "task", tasks: "task", todo: "task",
  transaction: "transaction", transactions: "transaction", tx: "transaction", expense: "transaction",
  event: "event", events: "event", calendar: "event",
  mail: "mail", email: "mail", emails: "mail",
  note: "note", notes: "note",
  chat: "chat", chats: "chat",
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseSearchFilters(query: string, today: string): SearchFilters {
  const filters: SearchFilters = { text: "", type: null, dueBy: null, overdue: false, tag: null, active: false };
  const rest: string[] = [];
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const type = /^type:(\w+)$/i.exec(token);
    const due = /^due:(.+)$/i.exec(token);
    const tag = /^#([\p{L}\p{N}_-]+)$/u.exec(token);
    const span = due && /^<?(\d{1,3})([dw])$/i.exec(due[1]);
    if (type && TYPE_ALIASES[type[1].toLowerCase()]) filters.type = TYPE_ALIASES[type[1].toLowerCase()];
    else if (tag) filters.tag = tag[1].toLowerCase();
    else if (due && due[1].toLowerCase() === "overdue") filters.overdue = true;
    else if (due && due[1].toLowerCase() === "today") filters.dueBy = today;
    else if (due && due[1].toLowerCase() === "tomorrow") filters.dueBy = addDays(today, 1);
    else if (span) filters.dueBy = addDays(today, Number(span[1]) * (span[2].toLowerCase() === "w" ? 7 : 1));
    else rest.push(token);
  }
  filters.text = rest.join(" ");
  filters.active = filters.type !== null || filters.dueBy !== null || filters.overdue || filters.tag !== null;
  return filters;
}

export function wantsType(filters: SearchFilters, type: SearchType): boolean {
  if (filters.type) return filters.type === type;
  if (filters.dueBy || filters.overdue) return type === "task" || type === "event";
  return true;
}

export function taskPasses(task: { endDate: string; completed: boolean }, category: string | undefined, filters: SearchFilters, today: string): boolean {
  if (filters.tag && !category?.toLowerCase().includes(filters.tag)) return false;
  if (!filters.dueBy && !filters.overdue) return true;
  if (task.completed || !task.endDate) return false;
  return filters.overdue ? task.endDate < today : task.endDate <= (filters.dueBy as string);
}

export function upcomingEvents(events: CalendarEvent[], today: string, until: string | null): CalendarEvent[] {
  return events
    .filter((e) => e.endDate >= today && (!until || e.startDate <= until))
    .sort((a, b) => a.startISO.localeCompare(b.startISO))
    .slice(0, LIMIT);
}
