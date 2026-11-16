import { describe, expect, it } from "vitest";
import { parseSearchFilters, searchEvents, searchMail, taskPasses, wantsType } from "./paletteSearch";
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

describe("search filters", () => {
  const TODAY = "2026-11-16";

  it("splits filters from the text", () => {
    expect(parseSearchFilters("type:task due:<7d #school essay draft", TODAY)).toEqual({
      text: "essay draft",
      type: "task",
      dueBy: "2026-11-23",
      overdue: false,
      tag: "school",
      active: true,
    });
    expect(parseSearchFilters("TYPE:Emails due:2w", TODAY)).toMatchObject({ type: "mail", dueBy: "2026-11-30", text: "" });
    expect(parseSearchFilters("due:overdue", TODAY)).toMatchObject({ overdue: true, dueBy: null, active: true });
    expect(parseSearchFilters("due:tomorrow", TODAY).dueBy).toBe("2026-11-17");
  });

  it("leaves ordinary text and unknown filters alone", () => {
    expect(parseSearchFilters("C# notes type:banana due:soon", TODAY)).toEqual({
      text: "C# notes type:banana due:soon",
      type: null,
      dueBy: null,
      overdue: false,
      tag: null,
      active: false,
    });
  });

  it("limits a due filter to tasks and events", () => {
    const due = parseSearchFilters("due:<7d", TODAY);
    expect(wantsType(due, "task")).toBe(true);
    expect(wantsType(due, "event")).toBe(true);
    expect(wantsType(due, "note")).toBe(false);
    expect(wantsType(parseSearchFilters("type:note due:<7d", TODAY), "task")).toBe(false);
    expect(wantsType(parseSearchFilters("milk", TODAY), "mail")).toBe(true);
  });

  it("filters tasks by due date and category", () => {
    const due = parseSearchFilters("due:<7d #school", TODAY);
    const task = (endDate: string, completed = false) => ({ endDate, completed });
    expect(taskPasses(task("2026-11-20"), "School", due, TODAY)).toBe(true);
    expect(taskPasses(task("2026-11-10"), "School", due, TODAY)).toBe(true);
    expect(taskPasses(task("2026-11-24"), "School", due, TODAY)).toBe(false);
    expect(taskPasses(task("2026-11-20", true), "School", due, TODAY)).toBe(false);
    expect(taskPasses(task("2026-11-20"), "Work", due, TODAY)).toBe(false);
    const overdue = parseSearchFilters("due:overdue", TODAY);
    expect(taskPasses(task("2026-11-15"), undefined, overdue, TODAY)).toBe(true);
    expect(taskPasses(task("2026-11-16"), undefined, overdue, TODAY)).toBe(false);
  });
});
