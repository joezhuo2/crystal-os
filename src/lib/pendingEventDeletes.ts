import type { CalendarEvent, DeleteEventVars } from "@/hooks/useGoogleCalendar";
import { UNDO_MS } from "./undo";

/**
 * Event deletes held back for the Undo window (v0.10.3). Google Calendar has
 * no undelete, and recreating an event gives it a new id and drops what the
 * form does not carry, so a delete is only sent once its Undo has run out.
 * Until then (and while it is in flight) the event is hidden from every
 * loaded range, refetches included.
 */

type Entry = {
  vars: DeleteEventVars;
  timer: ReturnType<typeof setTimeout>;
  sent: boolean;
  send: () => Promise<unknown>;
  onSent: () => void;
  onError: (error: Error) => void;
};

const pending = new Set<Entry>();

/** Whether deleting `vars` takes `event` off the calendar. */
export function deletesEvent(vars: DeleteEventVars, event: CalendarEvent): boolean {
  if (event.calendarId && event.calendarId !== vars.calendarId) return false;
  if (event.id === vars.eventId) return true;
  if (vars.scope !== "all") return false;
  // The whole series: the master and every instance of it.
  const master = vars.recurringEventId ?? vars.eventId;
  return event.id === master || event.recurringEventId === master;
}

/** Whether a held or in-flight delete hides `event`. */
export function isPendingDelete(event: CalendarEvent): boolean {
  for (const entry of pending) if (deletesEvent(entry.vars, event)) return true;
  return false;
}

function fire(entry: Entry) {
  if (entry.sent) return Promise.resolve();
  entry.sent = true;
  clearTimeout(entry.timer);
  return entry.send().then(
    () => {
      pending.delete(entry);
      entry.onSent();
    },
    (error: unknown) => {
      // Shown again, since it was never removed.
      pending.delete(entry);
      entry.onError(error instanceof Error ? error : new Error(String(error)));
    },
  );
}

/**
 * Holds a delete for `delay` ms, then sends it. Returns a cancel function,
 * which is true when it stopped the delete in time.
 */
export function scheduleDelete(
  vars: DeleteEventVars,
  handlers: Pick<Entry, "send" | "onSent" | "onError">,
  delay = UNDO_MS,
): () => boolean {
  const entry: Entry = { vars, sent: false, ...handlers, timer: setTimeout(() => void fire(entry), delay) };
  pending.add(entry);
  return () => {
    if (entry.sent || !pending.has(entry)) return false;
    clearTimeout(entry.timer);
    pending.delete(entry);
    return true;
  };
}

/** Sends every held delete now: the app is closing or signing out. */
export function flushPendingDeletes(): Promise<void> {
  return Promise.all([...pending].map(fire)).then(() => undefined);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flushPendingDeletes());
}
