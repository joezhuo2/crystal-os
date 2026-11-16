import { describe, expect, it } from "vitest";
import { completionStreak, repeatInterval } from "./repeatHistory";

describe("repeatInterval", () => {
  it("is the longest wait between two due days", () => {
    expect(repeatInterval({ kind: "days", every: 3 })).toBe(3);
    expect(repeatInterval({ kind: "after", every: 2 })).toBe(2);
    expect(repeatInterval({ kind: "monthly" })).toBe(31);
    expect(repeatInterval({ kind: "weekly", weekdays: [1, 3, 5] })).toBe(3);
    expect(repeatInterval({ kind: "weekly", weekdays: [2] })).toBe(7);
    expect(repeatInterval({ kind: "weekly", weekdays: [] })).toBe(7);
  });
});

describe("completionStreak", () => {
  it("counts completions in a row, newest first, ignoring a second tick on the same day", () => {
    expect(completionStreak(["2026-11-14", "2026-11-16", "2026-11-15", "2026-11-16"], 1, "2026-11-16")).toBe(3);
  });

  it("stops at the first missed day", () => {
    expect(completionStreak(["2026-11-16", "2026-11-15", "2026-11-13", "2026-11-12"], 1, "2026-11-16")).toBe(2);
  });

  it("is still alive on the day it is next due, and over the day after", () => {
    expect(completionStreak(["2026-11-15", "2026-11-14"], 1, "2026-11-16")).toBe(2);
    expect(completionStreak(["2026-11-15", "2026-11-14"], 1, "2026-11-17")).toBe(0);
  });

  it("is zero with no completions", () => {
    expect(completionStreak([], 7, "2026-11-16")).toBe(0);
  });
});
