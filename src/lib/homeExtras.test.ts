import { describe, expect, it } from "vitest";
import { isTimeZone, journalPrompt, newMailCount, runningTotal, sparklinePath, zoneClock } from "./homeExtras";

describe("home extras", () => {
  it("gives one prompt per day and changes the next day", () => {
    const a = journalPrompt(new Date(2026, 10, 16, 8));
    expect(journalPrompt(new Date(2026, 10, 16, 23))).toBe(a);
    expect(journalPrompt(new Date(2026, 10, 17, 8))).not.toBe(a);
  });

  it("formats a second time zone, or nothing for a bad one", () => {
    expect(isTimeZone("Asia/Tokyo")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(zoneClock(new Date("2026-11-16T12:00:00Z"), "Asia/Tokyo")).toEqual({ city: "Tokyo", time: "09:00 PM" });
    expect(zoneClock(new Date("2026-11-16T12:00:00Z"), "America/New_York")?.city).toBe("New York");
    expect(zoneClock(new Date(), "")).toBeNull();
  });

  it("draws a sparkline across the box", () => {
    expect(runningTotal([10, -4, 6])).toEqual([10, 6, 12]);
    expect(sparklinePath([0, 10, 5], 100, 20)).toBe("M0.0 20.0 L50.0 0.0 L100.0 10.0");
    expect(sparklinePath([3, 3], 10, 10)).toBe("M0.0 10.0 L10.0 10.0");
    expect(sparklinePath([1], 10, 10)).toBe("");
  });

  it("counts mail newer than the last visit", () => {
    const items = [{ receivedAt: "2026-11-16T10:00:00.000Z" }, { receivedAt: "2026-11-15T10:00:00.000Z" }];
    expect(newMailCount(items, "2026-11-16T00:00:00.000Z")).toBe(1);
    expect(newMailCount(items, "")).toBe(2);
  });
});
