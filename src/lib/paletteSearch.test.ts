import { describe, expect, it } from "vitest";
import { searchEvents, searchMail } from "./paletteSearch";
import type { MailItem } from "@/lib/mail";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";

const mail = (over: Partial<MailItem>): MailItem =>
  ({ id: "1", subject: "", from: "", fromAddress: "", snippet: "", receivedAt: "2026-11-01T00:00:00Z", ...over }) as MailItem;

const event = (over: Partial<CalendarEvent>): CalendarEvent =>
  ({ id: "1", summary: "", location: "", description: "", startDate: "", endDate: "", startISO: "", ...over }) as CalendarEvent;

describe("searchMail", () => {
  it("matches subject, sender and company, newest first", () => {
    const items = [
      mail({ id: "a", subject: "Your application", company: "Acme", receivedAt: "2026-11-01T00:00:00Z" }),
      mail({ id: "b", from: "Acme Careers", receivedAt: "2026-11-05T00:00:00Z" }),
      mail({ id: "c", subject: "Hydro bill" }),
    ];
    expect(searchMail(items, "ACME").map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("needs two characters and caps at five", () => {
    const items = Array.from({ length: 8 }, (_, i) => mail({ id: String(i), subject: "invoice" }));
    expect(searchMail(items, "i")).toEqual([]);
    expect(searchMail(items, "invoice")).toHaveLength(5);
  });
});

describe("searchEvents", () => {
  it("lists upcoming matches soonest first, then past ones latest first", () => {
    const events = [
      event({ id: "old", summary: "Dentist", endDate: "2026-10-01", startISO: "2026-10-01T09:00:00Z" }),
      event({ id: "older", summary: "Dentist", endDate: "2026-09-01", startISO: "2026-09-01T09:00:00Z" }),
      event({ id: "later", summary: "Dentist", endDate: "2026-12-20", startISO: "2026-12-20T09:00:00Z" }),
      event({ id: "soon", location: "Dentist office", endDate: "2026-11-14", startISO: "2026-11-14T09:00:00Z" }),
      event({ id: "other", summary: "Lunch", endDate: "2026-11-14", startISO: "2026-11-14T12:00:00Z" }),
    ];
    expect(searchEvents(events, "dentist", "2026-11-13").map((e) => e.id)).toEqual(["soon", "later", "old", "older"]);
  });
});
