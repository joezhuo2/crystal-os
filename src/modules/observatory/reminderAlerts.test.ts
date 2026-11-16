import { describe, expect, it } from "vitest";
import { reviewReminderAlerts } from "./reminderAlerts";

describe("reviewReminderAlerts", () => {
  it("fires once a day after the reminder time when cards are due", () => {
    expect(reviewReminderAlerts(4, "19:00", new Date("2026-11-15T18:59:00"))).toEqual([]);
    expect(reviewReminderAlerts(4, "19:00", new Date("2026-11-15T19:05:00"))).toEqual([
      { key: "observatory-review:2026-11-15", title: "Time to review", body: "4 cards due in The Observatory" },
    ]);
    expect(reviewReminderAlerts(0, "19:00", new Date("2026-11-15T20:00:00"))).toEqual([]);
  });
});
