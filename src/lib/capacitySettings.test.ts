import { beforeEach, describe, expect, it } from "vitest";
import {
  CAPACITY_SETTINGS_KEY,
  DEFAULT_CAPACITY_SETTINGS,
  capacitySettings,
  capacityWindow,
  parseCapacitySettings,
} from "./capacitySettings";

beforeEach(() => {
  localStorage.clear();
  capacitySettings._reset();
});

describe("capacity settings", () => {
  it("defaults to a 9 to 5 work day", () => {
    expect(capacitySettings.getState()).toEqual(DEFAULT_CAPACITY_SETTINGS);
    expect(capacityWindow(DEFAULT_CAPACITY_SETTINGS)).toEqual({ start: 540, end: 1020 });
  });

  it("persists changes across a reload", () => {
    expect(capacitySettings.setTime("dayStart", "08:30")).toBe(true);
    expect(capacitySettings.setTime("dayEnd", "18:00")).toBe(true);
    capacitySettings._reset();
    expect(capacitySettings.getState()).toEqual({ dayStart: "08:30", dayEnd: "18:00" });
    expect(JSON.parse(localStorage.getItem(CAPACITY_SETTINGS_KEY) ?? "null")).toEqual({
      dayStart: "08:30",
      dayEnd: "18:00",
    });
  });

  it("refuses a window that does not end after it starts", () => {
    expect(capacitySettings.setTime("dayEnd", "09:00")).toBe(false);
    expect(capacitySettings.setTime("dayStart", "17:15")).toBe(false);
    expect(capacitySettings.setTime("dayStart", "nonsense")).toBe(false);
    expect(capacitySettings.getState()).toEqual(DEFAULT_CAPACITY_SETTINGS);
  });

  it("falls back to the default window for anything malformed", () => {
    expect(parseCapacitySettings(null)).toEqual(DEFAULT_CAPACITY_SETTINGS);
    expect(parseCapacitySettings("not json")).toEqual(DEFAULT_CAPACITY_SETTINGS);
    expect(parseCapacitySettings(JSON.stringify({ dayStart: "10:00" }))).toEqual(DEFAULT_CAPACITY_SETTINGS);
    expect(parseCapacitySettings(JSON.stringify({ dayStart: "18:00", dayEnd: "08:00" }))).toEqual(
      DEFAULT_CAPACITY_SETTINGS,
    );
    expect(parseCapacitySettings(JSON.stringify({ dayStart: "07:00", dayEnd: "15:30" }))).toEqual({
      dayStart: "07:00",
      dayEnd: "15:30",
    });
  });
});
