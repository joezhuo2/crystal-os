import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_LEAD,
  DEFAULT_NOTIFY_SETTINGS,
  MAX_EVENT_LEAD,
  NOTIFY_SETTINGS_KEY,
  clampEventLead,
  clampTaskLead,
  isQuiet,
  notifySettings,
  parseNotifySettings,
} from "./notifySettings";

beforeEach(() => {
  localStorage.clear();
  notifySettings._reset();
});

describe("notify settings", () => {
  it("defaults to everything on, Do Not Disturb off and a 30 minute lead", () => {
    expect(notifySettings.getState()).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(DEFAULT_EVENT_LEAD).toBe(30);
  });

  it("persists changes across a reload", () => {
    notifySettings.setFlag("doNotDisturb", true);
    notifySettings.setFlag("portal", false);
    notifySettings.setEventLead("10");
    notifySettings._reset();
    expect(notifySettings.getState()).toMatchObject({ doNotDisturb: true, portal: false, eventLead: 10 });
  });

  it("clamps the lead to whole minutes within range", () => {
    expect(clampEventLead(-5)).toBe(0);
    expect(clampEventLead(12.6)).toBe(13);
    expect(clampEventLead(99999)).toBe(MAX_EVENT_LEAD);
    expect(clampEventLead("")).toBe(DEFAULT_EVENT_LEAD);
    expect(clampEventLead("abc")).toBe(DEFAULT_EVENT_LEAD);
  });

  it("keeps defaults for missing or malformed fields", () => {
    expect(parseNotifySettings("{oops")).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(parseNotifySettings(JSON.stringify({ tasks: "no", calendar: false }))).toEqual({
      ...DEFAULT_NOTIFY_SETTINGS,
      calendar: false,
    });
    localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify({ eventLead: 5000 }));
    notifySettings._reset();
    expect(notifySettings.getState().eventLead).toBe(MAX_EVENT_LEAD);
  });

  it("stores task reminder options and falls back on bad values", () => {
    notifySettings.setTaskReminderWhen("dayStart");
    notifySettings.setTaskReminderRepeat("everyLaunch");
    notifySettings.setTaskLead("0");
    notifySettings._reset();
    expect(notifySettings.getState()).toMatchObject({ taskReminderWhen: "dayStart", taskReminderRepeat: "everyLaunch", taskLead: 1 });
    expect(parseNotifySettings(JSON.stringify({ taskReminderWhen: "x", taskReminderRepeat: 3 }))).toMatchObject({
      taskReminderWhen: "before",
      taskReminderRepeat: "once",
    });
    expect(clampTaskLead("abc")).toBe(30);
  });
});

describe("Do Not Disturb schedule", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 24, h, m);
  const scheduled = { ...DEFAULT_NOTIFY_SETTINGS, dndSchedule: true };

  it("is quiet from the start up to the end, across midnight", () => {
    expect(isQuiet(scheduled, at(21, 59))).toBe(false);
    expect(isQuiet(scheduled, at(22))).toBe(true);
    expect(isQuiet(scheduled, at(3))).toBe(true);
    expect(isQuiet(scheduled, at(7))).toBe(false);
  });

  it("handles a window within one day, and equal times as none", () => {
    const day = { ...scheduled, dndFrom: "12:00", dndTo: "13:30" };
    expect(isQuiet(day, at(12, 15))).toBe(true);
    expect(isQuiet(day, at(13, 30))).toBe(false);
    expect(isQuiet({ ...scheduled, dndTo: "22:00" }, at(22))).toBe(false);
  });

  it("follows the manual switch, and ignores the times while the schedule is off", () => {
    expect(isQuiet(DEFAULT_NOTIFY_SETTINGS, at(23))).toBe(false);
    expect(isQuiet({ ...DEFAULT_NOTIFY_SETTINGS, doNotDisturb: true }, at(12))).toBe(true);
  });

  it("saves valid times and drops malformed ones", () => {
    notifySettings.setDndTime("dndFrom", "23:15");
    notifySettings.setDndTime("dndTo", "25:00");
    notifySettings._reset();
    expect(notifySettings.getState()).toMatchObject({ dndFrom: "23:15", dndTo: "07:00" });
    expect(parseNotifySettings(JSON.stringify({ dndFrom: "9:00", dndTo: 7 }))).toMatchObject({ dndFrom: "22:00", dndTo: "07:00" });
  });
});
