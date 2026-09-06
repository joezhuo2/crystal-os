import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = "/api/calendar";

/**
 * Mirrors the server-side AppEvent in server/calendar/events.ts. Re-declared
 * here because that module pulls in `googleapis`, which is Node-only and must
 * never enter the client bundle.
 */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  allDay: boolean;
  /** "YYYY-MM-DD" in the calendar's own timezone. */
  startDate: string;
  /** "HH:MM", or "" when allDay. */
  startTime: string;
  /** Inclusive, unlike Google's exclusive all-day end. */
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

export interface CalendarSummary {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor: string;
  accessRole: string;
  timeZone: string;
}

export interface CalendarStatus {
  /** Client id and secret are present in .env.local. */
  configured: boolean;
  /** A refresh token is present and Google accepted it. */
  connected: boolean;
  account?: string;
  error?: string;
}

export type RecurrenceFreq = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  allDay: boolean;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  timeZone?: string;
  recurrence?: string[] | null;
}

/** Which occurrences of a recurring event an edit or delete applies to. */
export type EventScope = "single" | "all";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    // The middleware always replies with { error } — surface that instead of a
    // bare status code, since "GOOGLE_CLIENT_ID is not set" is actionable.
    let message = `Calendar API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON response, keep the status message */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** The browser's IANA zone, so events land on the wall clock the user typed. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** Compose the single RRULE line the event form supports. */
export function buildRecurrence(
  freq: RecurrenceFreq,
  until?: string,
): string[] | null {
  if (freq === "NONE") return null;
  let rule = `RRULE:FREQ=${freq}`;
  if (until) rule += `;UNTIL=${until.replace(/-/g, "")}T235959Z`;
  return [rule];
}

/** Pull the form's two fields back out of an RRULE line. */
export function parseRecurrence(recurrence: string[] | null): {
  freq: RecurrenceFreq;
  until: string;
} {
  const rule = recurrence?.find((r) => r.startsWith("RRULE:"));
  if (!rule) return { freq: "NONE", until: "" };

  const freq = (/FREQ=([A-Z]+)/.exec(rule)?.[1] ?? "NONE") as RecurrenceFreq;
  const until = /UNTIL=(\d{4})(\d{2})(\d{2})/.exec(rule);

  return {
    freq: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)
      ? freq
      : "NONE",
    until: until ? `${until[1]}-${until[2]}-${until[3]}` : "",
  };
}

/* ── Queries ── */

/** Whether the integration is configured and connected. Drives the whole tab. */
export function useCalendarStatus() {
  return useQuery<CalendarStatus>({
    queryKey: ["gcal", "status"],
    queryFn: () => request<CalendarStatus>(`${API_BASE}/status`),
    staleTime: 60 * 1000,
    retry: 0,
  });
}

export function useCalendarList(enabled: boolean) {
  return useQuery<{ calendars: CalendarSummary[] }>({
    queryKey: ["gcal", "calendars"],
    queryFn: () =>
      request<{ calendars: CalendarSummary[] }>(`${API_BASE}/calendars`),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled,
  });
}

export interface EventsQuery {
  calendarId: string;
  /** RFC3339 lower bound, inclusive. */
  timeMin: string;
  /** RFC3339 upper bound, exclusive. */
  timeMax: string;
}

export function useCalendarEvents(params: EventsQuery, enabled: boolean) {
  return useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["gcal", "events", params],
    queryFn: () => {
      const qs = new URLSearchParams({
        calendarId: params.calendarId,
        timeMin: params.timeMin,
        timeMax: params.timeMax,
      });
      return request<{ events: CalendarEvent[] }>(`${API_BASE}/events?${qs}`);
    },
    staleTime: 30 * 1000,
    retry: 1,
    enabled,
  });
}

/* ── Mutations ── */

export interface CreateEventVars {
  calendarId: string;
  input: EventInput;
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation<{ event: CalendarEvent }, Error, CreateEventVars>({
    mutationFn: ({ calendarId, input }) =>
      request<{ event: CalendarEvent }>(
        `${API_BASE}/events?calendarId=${encodeURIComponent(calendarId)}`,
        jsonInit("POST", input),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gcal", "events"] });
    },
  });
}

export interface UpdateEventVars extends CreateEventVars {
  eventId: string;
  scope: EventScope;
  /** Required for scope "all" on an instance — the series master's id. */
  recurringEventId?: string | null;
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation<{ event: CalendarEvent }, Error, UpdateEventVars>({
    mutationFn: ({ calendarId, eventId, scope, recurringEventId, input }) => {
      const qs = new URLSearchParams({ calendarId, scope });
      return request<{ event: CalendarEvent }>(
        `${API_BASE}/events/${encodeURIComponent(eventId)}?${qs}`,
        jsonInit("PATCH", { ...input, recurringEventId }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gcal", "events"] });
    },
  });
}

export interface DeleteEventVars {
  calendarId: string;
  eventId: string;
  scope: EventScope;
  recurringEventId?: string | null;
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, DeleteEventVars>({
    mutationFn: ({ calendarId, eventId, scope, recurringEventId }) => {
      const qs = new URLSearchParams({ calendarId, scope });
      if (recurringEventId) qs.set("recurringEventId", recurringEventId);
      return request<{ ok: true }>(
        `${API_BASE}/events/${encodeURIComponent(eventId)}?${qs}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gcal", "events"] });
    },
  });
}

/** Revoke the grant and forget the refresh token. */
export function useDisconnectCalendar() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, void>({
    mutationFn: () =>
      request<{ ok: true }>(`${API_BASE}/auth/disconnect`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gcal"] });
    },
  });
}
