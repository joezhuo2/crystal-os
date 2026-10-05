import { describe, expect, it } from "vitest";
import type { HourlyForecast } from "@/hooks/useWeather";
import { precipKind, weatherNudge } from "./weatherNudge";

// 1:30 PM local time on 2026-10-04; hours are built in local time so the
// tests pass in any time zone.
const NOW = new Date(2026, 9, 4, 13, 30);

function hour(offset: number, extra: Partial<HourlyForecast> = {}): HourlyForecast {
  const at = new Date(2026, 9, 4, 13 + offset);
  return {
    timestamp: at.toISOString(),
    temperature: 12,
    condition: "Mostly cloudy",
    iconCode: 3,
    windChill: null,
    windSpeed: 10,
    windDirection: "W",
    lop: 0,
    ...extra,
  };
}

/** 24 dry hours starting with the one under way, with overrides by offset. */
function day(overrides: Record<number, Partial<HourlyForecast>> = {}): { hourly: HourlyForecast[] } {
  return { hourly: Array.from({ length: 24 }, (_, i) => hour(i, overrides[i])) };
}

describe("precipKind", () => {
  it("names what falls", () => {
    expect(precipKind("Chance of showers")).toBe("rain");
    expect(precipKind("Periods of drizzle")).toBe("rain");
    expect(precipKind("Flurries")).toBe("snow");
    expect(precipKind("Rain or snow")).toBe("snow");
    expect(precipKind("Freezing rain")).toBe("freezing");
    expect(precipKind("Chance of thunderstorms")).toBe("thunder");
    expect(precipKind("Mainly sunny")).toBeNull();
  });
});

describe("weatherNudge", () => {
  it("says nothing without a forecast or anything worth saying", () => {
    expect(weatherNudge(null, NOW)).toBeNull();
    expect(weatherNudge({ hourly: [] }, NOW)).toBeNull();
    expect(weatherNudge(day(), NOW)).toBeNull();
  });

  it("warns when rain starts later today", () => {
    const at4 = new Date(2026, 9, 4, 16).toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    expect(weatherNudge(day({ 3: { condition: "Rain", lop: 80 } }), NOW)).toBe(`Rain from ${at4}, take an umbrella`);
  });

  it("ignores an unlikely chance of showers", () => {
    expect(weatherNudge(day({ 2: { condition: "Chance of showers", lop: 30 } }), NOW)).toBeNull();
    expect(weatherNudge(day({ 2: { condition: "Chance of showers", lop: 60 } }), NOW)).toMatch(/^Rain from /);
  });

  it("says when rain under way stops", () => {
    const wet = { condition: "Showers", lop: 90 };
    const text = weatherNudge(day({ 0: wet, 1: wet, 2: wet }), NOW);
    const at4 = new Date(2026, 9, 4, 16).toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    expect(text).toBe(`Rain until ${at4}`);
  });

  it("marks a start after midnight as tomorrow", () => {
    // 13:00 + 12 h = 1 AM tomorrow, still inside the 12 h precipitation window.
    expect(weatherNudge(day({ 12: { condition: "Snow", lop: 70 } }), new Date(2026, 9, 4, 14, 30))).toMatch(
      /^Snow from 1 AM tomorrow, wear boots$/,
    );
  });

  it("looks only 12 hours ahead for rain", () => {
    expect(weatherNudge(day({ 20: { condition: "Rain", lop: 90 } }), NOW)).toBeNull();
  });

  it("warns about bitter windchill, naming the part of the day", () => {
    // Offset 19 is 8 AM tomorrow.
    const text = weatherNudge(day({ 18: { windChill: -18 }, 19: { windChill: -23 } }), NOW);
    expect(text).toBe("−23 °C windchill tomorrow morning");
  });

  it("puts cold ahead of rain, but freezing rain ahead of cold", () => {
    const cold = { 19: { windChill: -25 } };
    expect(weatherNudge(day({ ...cold, 3: { condition: "Snow", lop: 80 } }), NOW)).toMatch(/windchill/);
    expect(weatherNudge(day({ ...cold, 3: { condition: "Freezing rain", lop: 80 } }), NOW)).toMatch(
      /^Freezing rain from .*, roads may be icy$/,
    );
  });

  it("warns about heat when nothing else is due", () => {
    expect(weatherNudge(day({ 2: { temperature: 31 }, 3: { temperature: 33 } }), NOW)).toBe(
      "Up to 33 °C this afternoon, drink water",
    );
  });

  it("skips hours already over", () => {
    const past = { hourly: [hour(-3, { condition: "Rain", lop: 90 }), ...day().hourly] };
    expect(weatherNudge(past, NOW)).toBeNull();
  });
});
