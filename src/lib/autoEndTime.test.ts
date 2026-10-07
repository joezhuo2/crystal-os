import { describe, expect, it } from "vitest";
import { endAfterStart, withStartTime } from "./autoEndTime";

describe("endAfterStart", () => {
  it("ends an hour after the start", () => {
    expect(endAfterStart("2026-10-07", "09:00")).toEqual({ endDate: "2026-10-07", endTime: "10:00" });
    expect(endAfterStart("2026-10-07", "09:45")).toEqual({ endDate: "2026-10-07", endTime: "10:45" });
  });

  it("rolls onto the next day past midnight", () => {
    expect(endAfterStart("2026-10-07", "23:30")).toEqual({ endDate: "2026-10-08", endTime: "00:30" });
    expect(endAfterStart("2026-12-31", "23:00")).toEqual({ endDate: "2027-01-01", endTime: "00:00" });
  });

  it("returns null for a cleared start", () => {
    expect(endAfterStart("2026-10-07", "")).toBeNull();
  });
});

describe("withStartTime", () => {
  const form = { startDate: "2026-10-07", startTime: "09:00", endDate: "2026-10-07", endTime: "10:00" };

  it("moves the end with the start", () => {
    expect(withStartTime(form, "14:00")).toEqual({ ...form, startTime: "14:00", endTime: "15:00" });
  });

  it("leaves the end alone when the start is cleared", () => {
    expect(withStartTime(form, "")).toEqual({ ...form, startTime: "" });
  });
});
