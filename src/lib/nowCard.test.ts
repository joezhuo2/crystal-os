import { describe, expect, it } from "vitest";
import { pickNow, type NowInput } from "./nowCard";

const TODAY = "2026-11-16";
const at = (time: string) => new Date(`${TODAY}T${time}:00`);
const event = (time: string, over: Partial<NowInput["events"][number]> = {}) => ({
  summary: "Standup",
  location: "",
  allDay: false,
  startISO: at(time).toISOString(),
  ...over,
});
const task = (name: string, endDate: string, completed = false) => ({ name, endDate, completed });
const input = (over: Partial<NowInput>): NowInput => ({ now: at("09:00"), today: TODAY, events: [], tasks: [], reviewDue: 0, habitsLeft: 0, ...over });

describe("pickNow", () => {
  it("puts an event starting within the hour first", () => {
    const pick = pickNow(input({ events: [event("10:30"), event("09:45")], tasks: [task("Late", "2026-11-10")], reviewDue: 3 }));
    expect(pick).toEqual({ kind: "event", text: "Standup starts in 45 min", tab: "calendar" });
  });

  it("says to leave when the event has a place and starts within half an hour", () => {
    const pick = pickNow(input({ events: [event("09:20", { summary: "Dentist", location: "12 Main St" })] }));
    expect(pick).toEqual({ kind: "leave", text: "Leave now: Dentist at 12 Main St starts in 20 min", tab: "calendar" });
  });

  it("ignores all-day, past and far-off events", () => {
    expect(pickNow(input({ events: [event("08:00"), event("11:00"), event("09:10", { allDay: true })] }))).toBeNull();
  });

  it("falls through overdue tasks, reviews, evening habits and tasks due today", () => {
    const tasks = [task("Taxes", "2026-11-12"), task("Rent", "2026-11-10"), task("Report", TODAY), task("Done", "2026-11-01", true)];
    expect(pickNow(input({ tasks, reviewDue: 2, habitsLeft: 1 }))?.text).toBe("Overdue: Rent and 1 more");
    expect(pickNow(input({ tasks: tasks.slice(2), reviewDue: 1, habitsLeft: 1 }))?.text).toBe("1 card to review in The Observatory");
    expect(pickNow(input({ tasks: tasks.slice(2), habitsLeft: 2 }))?.text).toBe("Due today: Report");
    expect(pickNow(input({ now: at("19:00"), tasks: tasks.slice(2), habitsLeft: 2 }))).toEqual({ kind: "habits", text: "2 habits left to tick today", tab: "orbit" });
    expect(pickNow(input({}))).toBeNull();
  });
});
