import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { CalendarError } from "./errors";

/**
 * The event shape the client works with. Google's `start`/`end` union (a `date`
 * for all-day events, a `dateTime` for timed ones) is flattened here into the
 * "YYYY-MM-DD" + "HH:MM" strings the rest of Crystal OS already uses, so the
 * month grid can keep comparing dates as strings.
 */
export interface AppEvent {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  allDay: boolean;
  /** Local wall-clock date, as the calendar's own timezone reports it. */
  startDate: string;
  /** "" when allDay. */
  startTime: string;
  /** Inclusive - Google's all-day end date is exclusive and is shifted back. */
  endDate: string;
  endTime: string;
  startISO: string;
  endISO: string;
  /** RRULE lines, present on a series master. */
  recurrence: string[] | null;
  /** Set on an instance of a series; points at the master. */
  recurringEventId: string | null;
  htmlLink: string;
}

export interface AppCalendar {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor: string;
  accessRole: string;
  timeZone: string;
}

export interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  allDay: boolean;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  /** IANA zone from the browser. Ignored for all-day events. */
  timeZone?: string;
  recurrence?: string[] | null;
}

const DAY_MS = 86400000;

/** "YYYY-MM-DD" shifted by whole days, without tripping over DST. */
function shiftDate(dateStr: string, days: number): string {
  // Noon anchoring is the convention used throughout the app (src/lib/utils.ts).
  const d = new Date(`${dateStr}T12:00:00Z`);
  const shifted = new Date(d.getTime() + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Read wall-clock parts straight off Google's string rather than through Date,
 * which would re-express the instant in the *server's* timezone. Google already
 * returns each time in its calendar's zone, which is what the user should see.
 */
function splitDateTime(dateTime: string): { date: string; time: string } {
  return { date: dateTime.slice(0, 10), time: dateTime.slice(11, 16) };
}

export function toAppEvent(
  raw: calendar_v3.Schema$Event,
  calendarId: string,
): AppEvent {
  const allDay = Boolean(raw.start?.date);

  let startDate: string;
  let startTime: string;
  let endDate: string;
  let endTime: string;

  if (allDay) {
    startDate = raw.start?.date ?? "";
    startTime = "";
    // Google's all-day end is exclusive: a one-day event ends the next morning.
    endDate = raw.end?.date ? shiftDate(raw.end.date, -1) : startDate;
    endTime = "";
  } else {
    const start = splitDateTime(raw.start?.dateTime ?? "");
    const end = splitDateTime(raw.end?.dateTime ?? "");
    startDate = start.date;
    startTime = start.time;
    endDate = end.date || start.date;
    endTime = end.time || start.time;
  }

  return {
    id: raw.id ?? "",
    calendarId,
    summary: raw.summary ?? "(no title)",
    description: raw.description ?? "",
    location: raw.location ?? "",
    allDay,
    startDate,
    startTime,
    endDate,
    endTime,
    startISO: raw.start?.dateTime ?? raw.start?.date ?? "",
    endISO: raw.end?.dateTime ?? raw.end?.date ?? "",
    recurrence: raw.recurrence ?? null,
    recurringEventId: raw.recurringEventId ?? null,
    htmlLink: raw.htmlLink ?? "",
  };
}

export function toGoogleEvent(input: EventInput): calendar_v3.Schema$Event {
  const summary = input.summary?.trim();
  if (!summary) throw new CalendarError("An event needs a title");
  if (!input.startDate || !input.endDate) {
    throw new CalendarError("An event needs a start and end date");
  }

  const body: calendar_v3.Schema$Event = {
    summary,
    description: input.description?.trim() || undefined,
    location: input.location?.trim() || undefined,
  };

  if (input.allDay) {
    if (input.endDate < input.startDate) {
      throw new CalendarError("The end date is before the start date");
    }
    body.start = { date: input.startDate };
    // Exclusive end: an event "on" the 7th ends on the 8th as far as Google
    // is concerned.
    body.end = { date: shiftDate(input.endDate, 1) };
  } else {
    const startTime = input.startTime || "00:00";
    const endTime = input.endTime || "23:59";
    const startISO = `${input.startDate}T${startTime}:00`;
    const endISO = `${input.endDate}T${endTime}:00`;
    if (endISO <= startISO) {
      throw new CalendarError("The end time is not after the start time");
    }
    // No offset on the string - `timeZone` is what resolves it, so the event
    // lands on the wall clock the user typed.
    body.start = { dateTime: startISO, timeZone: input.timeZone || undefined };
    body.end = { dateTime: endISO, timeZone: input.timeZone || undefined };
  }

  // null clears an existing series; undefined leaves it untouched on a PATCH.
  if (input.recurrence !== undefined) {
    body.recurrence = input.recurrence?.length ? input.recurrence : null;
  }

  return body;
}

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** Compose the single RRULE line the event form supports. */
export function buildRecurrence(
  freq: Frequency | "NONE" | null | undefined,
  until?: string | null,
): string[] | null {
  if (!freq || freq === "NONE") return null;
  let rule = `RRULE:FREQ=${freq}`;
  if (until) {
    // UNTIL is inclusive and must be UTC when the event is timed; end-of-day
    // keeps the final occurrence in range.
    rule += `;UNTIL=${until.replace(/-/g, "")}T235959Z`;
  }
  return [rule];
}

/** Pull the form's two fields back out of an RRULE line. */
export function parseRecurrence(recurrence: string[] | null | undefined): {
  freq: Frequency | "NONE";
  until: string;
} {
  const rule = recurrence?.find((r) => r.startsWith("RRULE:"));
  if (!rule) return { freq: "NONE", until: "" };

  const freqMatch = /FREQ=([A-Z]+)/.exec(rule);
  const untilMatch = /UNTIL=(\d{4})(\d{2})(\d{2})/.exec(rule);
  const freq = (freqMatch?.[1] ?? "NONE") as Frequency | "NONE";

  return {
    freq: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)
      ? freq
      : "NONE",
    until: untilMatch
      ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`
      : "",
  };
}

/* -- Google API calls -- */

function api(auth: OAuth2Client): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth });
}

export async function listCalendars(
  auth: OAuth2Client,
): Promise<AppCalendar[]> {
  const { data } = await api(auth).calendarList.list({ maxResults: 250 });
  return (data.items ?? [])
    .filter((c) => c.id)
    .map((c) => ({
      id: c.id as string,
      summary: c.summaryOverride || c.summary || (c.id as string),
      primary: Boolean(c.primary),
      backgroundColor: c.backgroundColor || "#6366f1",
      accessRole: c.accessRole || "reader",
      timeZone: c.timeZone || "",
    }))
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.summary.localeCompare(b.summary);
    });
}

export async function listEvents(
  auth: OAuth2Client,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<AppEvent[]> {
  const { data } = await api(auth).events.list({
    calendarId,
    timeMin,
    timeMax,
    // Expands each series into its instances, which is what a grid needs.
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });
  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => toAppEvent(e, calendarId));
}

export async function getEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
): Promise<AppEvent> {
  const { data } = await api(auth).events.get({ calendarId, eventId });
  return toAppEvent(data, calendarId);
}

export async function createEvent(
  auth: OAuth2Client,
  calendarId: string,
  input: EventInput,
): Promise<AppEvent> {
  const { data } = await api(auth).events.insert({
    calendarId,
    requestBody: toGoogleEvent(input),
  });
  return toAppEvent(data, calendarId);
}

export async function updateEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
  input: EventInput,
): Promise<AppEvent> {
  const { data } = await api(auth).events.patch({
    calendarId,
    eventId,
    requestBody: toGoogleEvent(input),
  });
  return toAppEvent(data, calendarId);
}

export async function deleteEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await api(auth).events.delete({ calendarId, eventId });
}
