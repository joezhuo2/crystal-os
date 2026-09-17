import { describe, expect, it, vi } from "vitest";
import type { OAuth2Client } from "google-auth-library";
import {
  buildRecurrence,
  deleteEvent,
  getPrimaryCalendarId,
  listCalendars,
  listEvents,
  parseRecurrence,
  toAppEvent,
  toGoogleEvent,
  updateEvent,
} from "./events";
import { CalendarError } from "./errors";

/** An OAuth2Client whose `request` answers with `data` and records each call. */
function fakeAuth(data: unknown = {}) {
  const request = vi.fn().mockResolvedValue({ data });
  return { auth: { request } as unknown as OAuth2Client, request };
}

describe("Calendar API requests", () => {
  const holidays = "en.usa#holiday@group.v.calendar.google.com";

  it("lists expanded instances with the calendar id escaped", async () => {
    const { auth, request } = fakeAuth({
      items: [
        { id: "a", summary: "Kept", start: { date: "2026-09-07" }, end: { date: "2026-09-08" } },
        { id: "b", status: "cancelled" },
      ],
    });

    const events = await listEvents(auth, holidays, "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z");

    expect(events.map((e) => e.id)).toEqual(["a"]);
    expect(request).toHaveBeenCalledWith({
      url: "https://www.googleapis.com/calendar/v3/calendars/en.usa%23holiday%40group.v.calendar.google.com/events",
      method: "GET",
      params: {
        timeMin: "2026-09-01T00:00:00Z",
        timeMax: "2026-10-01T00:00:00Z",
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
      },
      data: undefined,
      retry: true,
    });
  });

  it("patches an event with the Google-shaped body", async () => {
    const { auth, request } = fakeAuth({ id: "evt_1", start: { date: "2026-09-07" } });

    await updateEvent(auth, "primary", "evt_1", {
      summary: "Holiday",
      allDay: true,
      startDate: "2026-09-07",
      endDate: "2026-09-07",
      recurrence: null,
    });

    const [opts] = request.mock.calls[0];
    expect(opts.method).toBe("PATCH");
    expect(opts.url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/evt_1");
    // null has to survive into the body: it is what clears a series.
    expect(opts.data).toMatchObject({
      summary: "Holiday",
      start: { date: "2026-09-07" },
      end: { date: "2026-09-08" },
      recurrence: null,
    });
  });

  it("deletes by escaped event id", async () => {
    const { auth, request } = fakeAuth("");

    await deleteEvent(auth, "primary", "a/b");

    expect(request.mock.calls[0][0]).toMatchObject({
      method: "DELETE",
      url: "https://www.googleapis.com/calendar/v3/calendars/primary/events/a%2Fb",
    });
  });

  it("lists calendars primary first, then by name", async () => {
    const { auth, request } = fakeAuth({
      items: [
        { id: "z@x", summary: "Zeta" },
        { id: "me@x", summary: "Me", primary: true },
        { id: "a@x", summary: "Ignored", summaryOverride: "Alpha" },
        { summary: "No id" },
      ],
    });

    const calendars = await listCalendars(auth);

    expect(calendars.map((c) => c.summary)).toEqual(["Me", "Alpha", "Zeta"]);
    expect(request.mock.calls[0][0]).toMatchObject({
      url: "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      params: { maxResults: 250 },
    });
  });

  it("reads the account address from the primary calendar", async () => {
    const { auth, request } = fakeAuth({ id: "me@example.com" });

    expect(await getPrimaryCalendarId(auth)).toBe("me@example.com");
    expect(request.mock.calls[0][0].url).toBe(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
    );
  });
});

describe("toAppEvent", () => {
  it("flattens a timed event to wall-clock strings", () => {
    const event = toAppEvent(
      {
        id: "abc",
        summary: "Standup",
        location: "Room 2",
        start: { dateTime: "2026-09-07T09:30:00-04:00", timeZone: "America/Toronto" },
        end: { dateTime: "2026-09-07T10:00:00-04:00", timeZone: "America/Toronto" },
        htmlLink: "https://calendar.google.com/event?eid=abc",
      },
      "primary",
    );

    expect(event).toMatchObject({
      id: "abc",
      calendarId: "primary",
      summary: "Standup",
      location: "Room 2",
      allDay: false,
      startDate: "2026-09-07",
      startTime: "09:30",
      endDate: "2026-09-07",
      endTime: "10:00",
    });
  });

  it("reads the calendar's own offset, not the server's timezone", () => {
    // A machine in UTC would render this as 22:00 the previous day if it went
    // through Date. The wall clock Google reported is what the user should see.
    const event = toAppEvent(
      {
        id: "tz",
        start: { dateTime: "2026-09-07T18:00:00+09:00" },
        end: { dateTime: "2026-09-07T19:00:00+09:00" },
      },
      "primary",
    );

    expect(event.startDate).toBe("2026-09-07");
    expect(event.startTime).toBe("18:00");
  });

  it("makes an all-day event's end date inclusive", () => {
    const event = toAppEvent(
      {
        id: "holiday",
        summary: "Long weekend",
        start: { date: "2026-09-05" },
        // Google's end is exclusive: this is a 3-day event.
        end: { date: "2026-09-08" },
      },
      "primary",
    );

    expect(event.allDay).toBe(true);
    expect(event.startDate).toBe("2026-09-05");
    expect(event.endDate).toBe("2026-09-07");
    expect(event.startTime).toBe("");
  });

  it("carries the series pointer on an instance", () => {
    const event = toAppEvent(
      {
        id: "series_20260907T130000Z",
        recurringEventId: "series",
        start: { dateTime: "2026-09-07T09:00:00-04:00" },
        end: { dateTime: "2026-09-07T09:30:00-04:00" },
      },
      "primary",
    );

    expect(event.recurringEventId).toBe("series");
  });

  it("falls back to a placeholder title", () => {
    const event = toAppEvent(
      { id: "x", start: { date: "2026-09-07" }, end: { date: "2026-09-08" } },
      "primary",
    );
    expect(event.summary).toBe("(no title)");
  });
});

describe("toGoogleEvent", () => {
  it("sends a timed event as a zone-qualified dateTime with no offset", () => {
    const body = toGoogleEvent({
      summary: "Review",
      allDay: false,
      startDate: "2026-09-07",
      startTime: "14:00",
      endDate: "2026-09-07",
      endTime: "15:00",
      timeZone: "America/Toronto",
    });

    expect(body.start).toEqual({
      dateTime: "2026-09-07T14:00:00",
      timeZone: "America/Toronto",
    });
    expect(body.end).toEqual({
      dateTime: "2026-09-07T15:00:00",
      timeZone: "America/Toronto",
    });
  });

  it("pushes an all-day end date out by one, matching Google's exclusive end", () => {
    const body = toGoogleEvent({
      summary: "Offsite",
      allDay: true,
      startDate: "2026-09-07",
      endDate: "2026-09-07",
    });

    expect(body.start).toEqual({ date: "2026-09-07" });
    expect(body.end).toEqual({ date: "2026-09-08" });
  });

  it("round-trips an all-day event through toAppEvent unchanged", () => {
    const input = {
      summary: "Trip",
      allDay: true,
      startDate: "2026-09-05",
      endDate: "2026-09-07",
    };
    const back = toAppEvent({ id: "t", ...toGoogleEvent(input) }, "primary");

    expect(back.startDate).toBe(input.startDate);
    expect(back.endDate).toBe(input.endDate);
    expect(back.allDay).toBe(true);
  });

  it("drops empty optional fields rather than writing blanks", () => {
    const body = toGoogleEvent({
      summary: "Bare",
      description: "   ",
      location: "",
      allDay: true,
      startDate: "2026-09-07",
      endDate: "2026-09-07",
    });

    expect(body.description).toBeUndefined();
    expect(body.location).toBeUndefined();
  });

  it("leaves recurrence untouched when the field is absent", () => {
    const body = toGoogleEvent({
      summary: "Instance edit",
      allDay: true,
      startDate: "2026-09-07",
      endDate: "2026-09-07",
    });
    expect("recurrence" in body).toBe(false);
  });

  it("clears the series when recurrence is explicitly null", () => {
    const body = toGoogleEvent({
      summary: "No longer repeating",
      allDay: true,
      startDate: "2026-09-07",
      endDate: "2026-09-07",
      recurrence: null,
    });
    expect(body.recurrence).toBeNull();
  });

  it("rejects a missing title", () => {
    expect(() =>
      toGoogleEvent({
        summary: "  ",
        allDay: true,
        startDate: "2026-09-07",
        endDate: "2026-09-07",
      }),
    ).toThrow(CalendarError);
  });

  it("rejects an end that is not after the start", () => {
    expect(() =>
      toGoogleEvent({
        summary: "Backwards",
        allDay: false,
        startDate: "2026-09-07",
        startTime: "15:00",
        endDate: "2026-09-07",
        endTime: "14:00",
      }),
    ).toThrow(/end time is not after/i);
  });

  it("rejects an all-day range that ends before it starts", () => {
    expect(() =>
      toGoogleEvent({
        summary: "Backwards",
        allDay: true,
        startDate: "2026-09-07",
        endDate: "2026-09-05",
      }),
    ).toThrow(/end date is before/i);
  });
});

describe("recurrence", () => {
  it("builds an open-ended rule", () => {
    expect(buildRecurrence("WEEKLY")).toEqual(["RRULE:FREQ=WEEKLY"]);
  });

  it("builds a bounded rule with a UTC UNTIL", () => {
    expect(buildRecurrence("DAILY", "2026-12-31")).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20261231T235959Z",
    ]);
  });

  it("treats NONE as no recurrence", () => {
    expect(buildRecurrence("NONE")).toBeNull();
    expect(buildRecurrence(null)).toBeNull();
  });

  it("round-trips through parseRecurrence", () => {
    const rule = buildRecurrence("MONTHLY", "2027-01-15");
    expect(parseRecurrence(rule)).toEqual({
      freq: "MONTHLY",
      until: "2027-01-15",
    });
  });

  it("reads a rule that has no UNTIL", () => {
    expect(parseRecurrence(["RRULE:FREQ=YEARLY"])).toEqual({
      freq: "YEARLY",
      until: "",
    });
  });

  it("ignores EXDATE-only or unrecognised recurrence arrays", () => {
    expect(parseRecurrence(["EXDATE;VALUE=DATE:20260907"])).toEqual({
      freq: "NONE",
      until: "",
    });
    expect(parseRecurrence(null)).toEqual({ freq: "NONE", until: "" });
  });

  it("falls back to NONE on a frequency it cannot render", () => {
    expect(parseRecurrence(["RRULE:FREQ=HOURLY"]).freq).toBe("NONE");
  });
});
