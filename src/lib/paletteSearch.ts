import type { MailItem } from "@/lib/mail";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";

export const PALETTE_EVENT_DAYS_BACK = 30;
export const PALETTE_EVENT_DAYS_AHEAD = 90;
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
