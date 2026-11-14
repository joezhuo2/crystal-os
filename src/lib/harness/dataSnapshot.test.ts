import { describe, expect, it } from "vitest";
import { buildDataSnapshot, SNAPSHOT_PREAMBLE, type SnapshotInput } from "./dataSnapshot";
import type { Task, Transaction } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";

const task = (over: Partial<Task>): Task => ({
  id: "t", name: "Task", startDate: "2026-11-13", startTime: "", endDate: "2026-11-13", endTime: "", priority: "medium", categoryId: "c1", completed: false, ...over,
});
const event = (over: Partial<CalendarEvent>): CalendarEvent =>
  ({ id: "e", calendarId: "primary", summary: "Event", description: "", location: "", allDay: false, startDate: "2026-11-14", startTime: "10:00", endDate: "2026-11-14", endTime: "11:00", startISO: "2026-11-14T10:00:00", endISO: "2026-11-14T11:00:00", ...over }) as CalendarEvent;
const txn = (over: Partial<Transaction>): Transaction => ({ id: "x", name: "Lunch", amount: 12.5, type: "expense", categoryId: "f1", date: "2026-11-10", ...over });

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  now: new Date(2026, 10, 13, 9, 5),
  today: "2026-11-13",
  tasks: [],
  taskCategories: [{ id: "c1", name: "Work", color: "" }],
  events: [],
  transactions: [],
  financialCategories: [{ id: "f1", name: "Food", color: "" }],
  notes: [],
  ...over,
});

describe("buildDataSnapshot", () => {
  it("lists open tasks by due date and marks overdue ones", () => {
    const text = buildDataSnapshot(
      input({
        tasks: [
          task({ name: "Later", endDate: "2026-11-20", priority: "low" }),
          task({ name: "Late", endDate: "2026-11-01", priority: "urgent", estimateMinutes: 30 }),
          task({ name: "Done", completed: true }),
        ],
      }),
    );
    expect(text.startsWith(SNAPSHOT_PREAMBLE)).toBe(true);
    expect(text).toContain("Now: Friday 2026-11-13 09:05");
    expect(text).toContain("## Open tasks (2)");
    expect(text).toContain("- Late (due 2026-11-01, overdue, urgent, Work, 30 min)");
    expect(text.indexOf("- Late")).toBeLessThan(text.indexOf("- Later"));
    expect(text).not.toContain("Done");
  });

  it("keeps events to the next 14 days and says when the calendar is not connected", () => {
    const text = buildDataSnapshot(
      input({
        events: [
          event({ summary: "Dentist", location: "Main St" }),
          event({ summary: "Trip", allDay: true, startDate: "2026-11-16", endDate: "2026-11-18", startISO: "2026-11-16T00:00:00" }),
          event({ summary: "Far", startDate: "2026-12-25", endDate: "2026-12-25", startISO: "2026-12-25T10:00:00" }),
          event({ summary: "Past", startDate: "2026-11-01", endDate: "2026-11-01", startISO: "2026-11-01T10:00:00" }),
        ],
      }),
    );
    expect(text).toContain("- 2026-11-14 10:00–11:00: Dentist @ Main St");
    expect(text).toContain("- 2026-11-16 all day: Trip");
    expect(text).not.toContain("Far");
    expect(text).not.toContain("Past");
    expect(buildDataSnapshot(input({ events: null }))).toContain("Google Calendar is not connected.");
  });

  it("totals recent money and drops old transactions", () => {
    const text = buildDataSnapshot(
      input({
        transactions: [txn({}), txn({ name: "Pay", amount: 1000, type: "income", date: "2026-11-01" }), txn({ name: "Old", date: "2026-01-01" })],
      }),
    );
    expect(text).toContain("(income 1000.00, spending 12.50)");
    expect(text).toContain("- 2026-11-10: -12.50 Lunch (Food)");
    expect(text).not.toContain("Old");
  });

  it("flattens newlines so data cannot add its own headings", () => {
    const text = buildDataSnapshot(input({ tasks: [task({ name: "Buy milk\n## Fake heading" })] }));
    expect(text).toContain("- Buy milk ## Fake heading (");
  });
});
