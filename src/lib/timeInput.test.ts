import { describe, expect, it } from "vitest";
import { parseTimeInput, suggestTimes } from "@/lib/timeInput";

const label = (slot: string) => {
  const h = Number(slot.slice(0, 2));
  return `${h % 12 || 12}:${slot.slice(3)} ${h < 12 ? "AM" : "PM"}`;
};

describe("parseTimeInput", () => {
  it("reads exact minutes", () => {
    expect(parseTimeInput("9:07pm")).toBe("21:07");
    expect(parseTimeInput("0930")).toBe("09:30");
    expect(parseTimeInput("930", "15:00")).toBe("21:30");
    expect(parseTimeInput("21:05")).toBe("21:05");
    expect(parseTimeInput("12am")).toBe("00:00");
    expect(parseTimeInput("12")).toBe("12:00");
  });

  it("keeps the current AM/PM for a bare hour", () => {
    expect(parseTimeInput("8", "09:00")).toBe("08:00");
    expect(parseTimeInput("8", "14:00")).toBe("20:00");
  });

  it("rejects non-times", () => {
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("9:60")).toBeNull();
    expect(parseTimeInput("13pm")).toBeNull();
    expect(parseTimeInput("soon")).toBeNull();
  });
});

describe("suggestTimes", () => {
  it("lists every quarter hour when nothing is typed", () => {
    expect(suggestTimes("", label)).toHaveLength(96);
  });

  it("offers the quarter hours of a typed hour", () => {
    expect(suggestTimes("9", label).slice(0, 4)).toEqual(["09:00", "09:15", "09:30", "09:45"]);
    expect(suggestTimes("9", label)).toContain("21:45");
    expect(suggestTimes("9:3", label)).toEqual(["09:30", "21:30"]);
  });
});
