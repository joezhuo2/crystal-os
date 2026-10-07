import { beforeEach, describe, expect, it } from "vitest";
import type { Task } from "@/contexts/AppContext";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { DEFAULT_WORK, DEFAULT_BREAK, type PomodoroState } from "./pomodoro";
import type { PortalState } from "./portalStore";
import {
  TASK_GRACE_MS,
  eventAlerts,
  pomodoroAlert,
  portalAlerts,
  takeUnsent,
  taskDueAlerts,
  taskEndsOnDate,
} from "./notifications";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "File taxes",
    startDate: "2026-10-05",
    startTime: "09:00",
    endDate: "2026-10-05",
    endTime: "17:00",
    priority: "medium",
    categoryId: "work",
    completed: false,
    ...overrides,
  };
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = new Date("2026-10-05T15:00:00");
  return {
    id: "e1",
    calendarId: "primary",
    summary: "Dentist",
    description: "",
    location: "",
    allDay: false,
    startDate: "2026-10-05",
    startTime: "15:00",
    endDate: "2026-10-05",
    endTime: "16:00",
    startISO: start.toISOString(),
    endISO: new Date(start.getTime() + 3600000).toISOString(),
    recurrence: null,
    recurringEventId: null,
    htmlLink: "",
    ...overrides,
  };
}

const at = (local: string) => new Date(local);

describe("taskEndsOnDate", () => {
  it("is the end date for a one-off task", () => {
    const t = task({ startDate: "2026-10-03", endDate: "2026-10-05" });
    expect(taskEndsOnDate(t, "2026-10-05")).toBe(true);
    expect(taskEndsOnDate(t, "2026-10-04")).toBe(false);
  });

  it("follows a weekly repeat, ending each occurrence after the same span", () => {
    // Monday to Tuesday, every Monday.
    const t = task({ startDate: "2026-10-05", endDate: "2026-10-06", repeat: { kind: "weekly", weekdays: [1] } });
    expect(taskEndsOnDate(t, "2026-10-13")).toBe(true);
    expect(taskEndsOnDate(t, "2026-10-12")).toBe(false);
  });

  it("only has the pending occurrence for an after-completion repeat", () => {
    const t = task({ repeat: { kind: "after", every: 3 } });
    expect(taskEndsOnDate(t, "2026-10-05")).toBe(true);
    expect(taskEndsOnDate(t, "2026-10-08")).toBe(false);
  });
});

describe("taskDueAlerts", () => {
  it("announces a task once its end time passes, for the grace period", () => {
    const t = task();
    expect(taskDueAlerts([t], at("2026-10-05T16:59:00"))).toEqual([]);
    const [alert] = taskDueAlerts([t], at("2026-10-05T17:00:30"));
    expect(alert).toEqual({ key: "task:t1:2026-10-05", title: "Due now: File taxes", body: "Due at 5:00 PM" });
    const late = new Date(at("2026-10-05T17:00:00").getTime() + TASK_GRACE_MS + 1000);
    expect(taskDueAlerts([t], late)).toEqual([]);
  });

  it("stays quiet for a snoozed task", () => {
    expect(taskDueAlerts([task({ someday: true })], at("2026-10-05T17:01:00"))).toEqual([]);
    expect(taskDueAlerts([task({ snoozedUntil: "2026-10-06" })], at("2026-10-05T17:01:00"))).toEqual([]);
    expect(taskDueAlerts([task({ snoozedUntil: "2026-10-05" })], at("2026-10-05T17:01:00"))).toHaveLength(1);
  });

  it("skips completed tasks and names high priority", () => {
    expect(taskDueAlerts([task({ completed: true })], at("2026-10-05T17:01:00"))).toEqual([]);
    const [alert] = taskDueAlerts([task({ priority: "urgent" })], at("2026-10-05T17:01:00"));
    expect(alert.body).toBe("Due at 5:00 PM · urgent priority");
  });

  it("keeps a due time just before midnight past the date change", () => {
    const t = task({ endTime: "23:55" });
    const [alert] = taskDueAlerts([t], at("2026-10-06T00:02:00"));
    expect(alert.key).toBe("task:t1:2026-10-05");
  });

  it("gives each repeat its own key", () => {
    const t = task({ repeat: { kind: "days", every: 1 } });
    expect(taskDueAlerts([t], at("2026-10-07T17:01:00"))[0].key).toBe("task:t1:2026-10-07");
  });
});

describe("eventAlerts", () => {
  it("reminds within the lead time and not before or after the start", () => {
    const e = event({ location: "Main St" });
    expect(eventAlerts([e], at("2026-10-05T14:29:00"), 30)).toEqual([]);
    const [alert] = eventAlerts([e], at("2026-10-05T14:30:00"), 30);
    expect(alert).toEqual({
      key: `event:primary:e1:${e.startISO}`,
      title: "Dentist",
      body: "In 30 min, at 3:00 PM · Main St",
    });
    expect(eventAlerts([e], at("2026-10-05T15:00:00"), 30)).toEqual([]);
  });

  it("says the time actually left when opened late", () => {
    const [alert] = eventAlerts([event()], at("2026-10-05T14:52:00"), 30);
    expect(alert.body).toBe("In 8 min, at 3:00 PM");
  });

  it("formats long leads in hours", () => {
    const [alert] = eventAlerts([event()], at("2026-10-05T13:30:00"), 120);
    expect(alert.body).toBe("In 1 h 30 min, at 3:00 PM");
  });

  it("reminds at the start with a zero lead", () => {
    expect(eventAlerts([event()], at("2026-10-05T14:59:00"), 0)).toEqual([]);
    expect(eventAlerts([event()], at("2026-10-05T15:00:10"), 0)[0].body).toBe("Now, at 3:00 PM");
  });

  it("skips all-day events", () => {
    expect(eventAlerts([event({ allDay: true })], at("2026-10-05T14:45:00"), 30)).toEqual([]);
  });
});

describe("pomodoroAlert", () => {
  const base: PomodoroState = {
    phase: "focus",
    running: true,
    remaining: 1,
    workDuration: DEFAULT_WORK,
    breakDuration: DEFAULT_BREAK,
    task: null,
  };

  it("announces the end of focus and of a break", () => {
    const afterFocus = { ...base, running: false, phase: "break" as const, remaining: DEFAULT_BREAK };
    expect(pomodoroAlert(base, afterFocus)?.body).toBe("Time for a 5 min break.");
    const breakRunning = { ...afterFocus, running: true };
    const afterBreak = { ...base, running: false, remaining: DEFAULT_WORK };
    expect(pomodoroAlert(breakRunning, afterBreak)?.body).toBe("Ready for 25 min of focus?");
  });

  it("stays quiet for pause, reset and ticks", () => {
    expect(pomodoroAlert(base, { ...base, running: false })).toBeNull();
    expect(pomodoroAlert(base, { ...base, running: false, remaining: DEFAULT_WORK })).toBeNull();
    expect(pomodoroAlert(base, { ...base, remaining: 0 })).toBeNull();
  });
});

describe("portalAlerts", () => {
  const discord = { id: "discord", name: "Discord", url: "https://discord.com/app" };
  const state = (over: Partial<PortalState>): PortalState => ({
    apps: [discord],
    activeId: "discord",
    badges: {},
    reported: { discord: true },
    theme: "void",
    occluders: 0,
    ...over,
  });

  it("counts only the rise", () => {
    const [alert] = portalAlerts(state({ badges: { discord: 2 } }), state({ badges: { discord: 5 } }));
    expect(alert).toEqual({ key: "portal:discord", title: "Discord", body: "3 new · 5 unread" });
    expect(portalAlerts(state({ badges: { discord: 5 } }), state({ badges: { discord: 4 } }))).toEqual([]);
  });

  it("treats the first title after loading as the baseline", () => {
    expect(portalAlerts(state({ reported: {} }), state({ badges: { discord: 7 } }))).toEqual([]);
  });

  it("announces a new dot but not a dot that stays", () => {
    expect(portalAlerts(state({}), state({ badges: { discord: "dot" } }))[0].body).toBe("New activity");
    expect(portalAlerts(state({ badges: { discord: 1 } }), state({ badges: { discord: "dot" } }))).toEqual([]);
  });

  it("skips apps with notifications off", () => {
    const off = { ...discord, notify: false as const };
    expect(portalAlerts(state({ apps: [off] }), state({ apps: [off], badges: { discord: 1 } }))).toEqual([]);
  });
});

describe("takeUnsent", () => {
  beforeEach(() => localStorage.clear());

  it("returns each key once, across reloads, and forgets old keys", () => {
    const a = { key: "task:t1:2026-10-05", title: "a", body: "" };
    expect(takeUnsent([a], 1000)).toEqual([a]);
    expect(takeUnsent([a], 2000)).toEqual([]);
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    expect(takeUnsent([a], 1000 + threeDays)).toEqual([a]);
  });
});
