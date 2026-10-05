import { describe, expect, it } from "vitest";
import {
  dayLengthChangeSeconds,
  dayLengthMinutes,
  daylightState,
  formatDayLengthChange,
  formatDuration,
} from "./daylight";

const RISE = "2026-10-05T11:19:00Z";
const SET = "2026-10-05T22:51:00Z";

describe("daylightState", () => {
  it("by day: progress through the day and time to sunset", () => {
    const s = daylightState(RISE, SET, new Date("2026-10-05T17:05:00Z"));
    expect(s?.phase).toBe("day");
    expect(s?.progress).toBeCloseTo(0.5, 5);
    expect(s?.remainingMs).toBe((5 * 60 + 46) * 60_000);
  });

  it("before sunrise: the night since the previous sunset", () => {
    const s = daylightState(RISE, SET, new Date("2026-10-05T05:19:00Z"));
    expect(s?.phase).toBe("night");
    expect(s?.remainingMs).toBe(6 * 60 * 60_000);
    // Night ran from 22:51 the day before; 6.47 h of 12.47 h have passed.
    expect(s?.progress).toBeCloseTo(388 / 748, 5);
  });

  it("after sunset with today's times still cached: counts to tomorrow's sunrise", () => {
    const s = daylightState(RISE, SET, new Date("2026-10-06T00:51:00Z"));
    expect(s?.phase).toBe("night");
    expect(s?.remainingMs).toBe((10 * 60 + 28) * 60_000);
  });

  it("returns null for missing or backwards times", () => {
    expect(daylightState("", SET, new Date())).toBeNull();
    expect(daylightState(SET, RISE, new Date())).toBeNull();
  });
});

describe("formatDuration", () => {
  it("reads as hours and minutes", () => {
    expect(formatDuration(3 * 3600_000 + 12 * 60_000 + 59_000)).toBe("3h 12m");
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(30_000)).toBe("under 1m");
  });
});

describe("dayLengthMinutes", () => {
  it("matches Toronto's published day length within a few minutes", () => {
    // Toronto, 21 June: about 15 h 26 m; 21 December: about 9 h.
    expect(dayLengthMinutes(new Date(2026, 5, 21), 43.65, -79.38)).toBeGreaterThan(15 * 60 + 20);
    expect(dayLengthMinutes(new Date(2026, 5, 21), 43.65, -79.38)).toBeLessThan(15 * 60 + 32);
    expect(dayLengthMinutes(new Date(2026, 11, 21), 43.65, -79.38)).toBeGreaterThan(8 * 60 + 55);
    expect(dayLengthMinutes(new Date(2026, 11, 21), 43.65, -79.38)).toBeLessThan(9 * 60 + 8);
  });

  it("is 0 in a polar night and a full day under the midnight sun", () => {
    expect(dayLengthMinutes(new Date(2026, 11, 21), 82.5, -62.3)).toBe(0);
    expect(dayLengthMinutes(new Date(2026, 5, 21), 82.5, -62.3)).toBe(24 * 60);
  });
});

describe("dayLengthChangeSeconds", () => {
  it("loses about 2–3 minutes a day in early October in Toronto, and gains in spring", () => {
    const fall = dayLengthChangeSeconds(new Date(2026, 9, 5), 43.65, -79.38);
    expect(fall).toBeLessThan(-120);
    expect(fall).toBeGreaterThan(-190);
    expect(dayLengthChangeSeconds(new Date(2026, 2, 20), 43.65, -79.38)).toBeGreaterThan(120);
  });
});

describe("formatDayLengthChange", () => {
  it("says how much and which way", () => {
    expect(formatDayLengthChange(-161)).toBe("2m 41s shorter than yesterday");
    expect(formatDayLengthChange(45)).toBe("45s longer than yesterday");
    expect(formatDayLengthChange(0)).toBe("Same length as yesterday");
  });
});
