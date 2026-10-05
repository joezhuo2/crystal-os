import { describe, expect, it } from "vitest";
import type { ForecastPeriod, HourlyForecast } from "@/hooks/useWeather";
import {
  aqhiRisk,
  forecastPeak,
  formatAqhi,
  nearestObservation,
  parseObservations,
  upcomingForecast,
  uvOutlook,
  uvRisk,
} from "./airQuality";

describe("formatAqhi", () => {
  it("rounds, never shows below 1, and caps at 10+", () => {
    expect(formatAqhi(2.34)).toBe("2");
    expect(formatAqhi(2.5)).toBe("3");
    expect(formatAqhi(0.4)).toBe("1");
    expect(formatAqhi(10.4)).toBe("10");
    expect(formatAqhi(10.6)).toBe("10+");
  });
});

describe("aqhiRisk", () => {
  it("follows Environment Canada's bands", () => {
    expect(aqhiRisk(1).level).toBe("low");
    expect(aqhiRisk(3.4).level).toBe("low");
    expect(aqhiRisk(3.5).level).toBe("moderate");
    expect(aqhiRisk(6).level).toBe("moderate");
    expect(aqhiRisk(7).level).toBe("high");
    expect(aqhiRisk(10).level).toBe("high");
    expect(aqhiRisk(11).level).toBe("very-high");
  });
});

describe("uvRisk", () => {
  it("follows the UV index bands", () => {
    expect(uvRisk(0).level).toBe("low");
    expect(uvRisk(2).level).toBe("low");
    expect(uvRisk(3).level).toBe("moderate");
    expect(uvRisk(5).level).toBe("moderate");
    expect(uvRisk(6).level).toBe("high");
    expect(uvRisk(7).level).toBe("high");
    expect(uvRisk(8).level).toBe("very-high");
    expect(uvRisk(10).level).toBe("very-high");
    expect(uvRisk(11).level).toBe("extreme");
  });
});

const feature = (id: string, name: string, lon: number, lat: number, aqhi: unknown) => ({
  geometry: { coordinates: [lon, lat] },
  properties: { location_id: id, location_name_en: name, aqhi, observation_datetime: "2026-10-05T01:00:00Z" },
});

describe("parseObservations", () => {
  it("reads stations and skips rows without a value or point", () => {
    const parsed = parseObservations([
      feature("FDQBX", "Toronto North", -79.41, 43.76, 2.13),
      feature("BAD", "No value", -79, 43, null),
      { properties: { location_id: "NOPOINT", aqhi: 2 } },
    ]);
    expect(parsed).toEqual([
      {
        stationId: "FDQBX",
        stationName: "Toronto North",
        lat: 43.76,
        lon: -79.41,
        aqhi: 2.13,
        observedAt: "2026-10-05T01:00:00Z",
      },
    ]);
  });
});

describe("nearestObservation", () => {
  const stations = parseObservations([
    feature("FDQBX", "Toronto North", -79.41, 43.76, 2.13),
    feature("FDGED", "Newmarket", -79.46, 44.06, 2.05),
    feature("FDQBU", "Toronto East", -79.23, 43.76, 2.16),
  ]);

  it("picks the closest station to Markham and says how far it is", () => {
    const near = nearestObservation(stations, 43.88, -79.26);
    expect(near?.stationId).toBe("FDQBU");
    expect(near?.distanceKm).toBeGreaterThan(10);
    expect(near?.distanceKm).toBeLessThan(15);
  });

  it("returns null when no station is in range", () => {
    expect(nearestObservation(stations, 45.42, -75.69)).toBeNull();
    expect(nearestObservation([], 43.88, -79.26)).toBeNull();
  });
});

describe("upcomingForecast and forecastPeak", () => {
  const row = (pub: string, at: string, aqhi: number) => ({
    properties: { publication_datetime: pub, forecast_datetime: at, aqhi },
  });
  const NEW = "2026-10-04T21:00:00Z";
  const OLD = "2026-10-04T10:00:00Z";
  const features = [
    row(OLD, "2026-10-05T03:00:00Z", 9),
    row(NEW, "2026-10-05T00:00:00Z", 2), // already past
    row(NEW, "2026-10-05T01:00:00Z", 3), // the hour under way
    row(NEW, "2026-10-05T04:00:00Z", 4),
    row(NEW, "2026-10-05T02:00:00Z", 4),
    row(NEW, "2026-10-06T03:00:00Z", 7), // more than 24 h out
  ];
  const now = new Date("2026-10-05T01:30:00Z");

  it("keeps only the newest run's hours from now to 24 h ahead, in order", () => {
    expect(upcomingForecast(features, now)).toEqual([
      { at: "2026-10-05T01:00:00Z", aqhi: 3 },
      { at: "2026-10-05T02:00:00Z", aqhi: 4 },
      { at: "2026-10-05T04:00:00Z", aqhi: 4 },
    ]);
  });

  it("peaks on the earliest of the highest hours", () => {
    expect(forecastPeak(upcomingForecast(features, now))).toEqual({ aqhi: 4, at: "2026-10-05T02:00:00Z" });
    expect(forecastPeak([])).toBeNull();
  });
});

describe("uvOutlook", () => {
  const period = (name: string, isNight: boolean, uvIndex: number | null) =>
    ({ name, isNight, uvIndex }) as ForecastPeriod;
  // Built in local time so the tests pass in any time zone.
  const hour = (day: number, h: number, uv: number | null) =>
    ({ timestamp: new Date(2026, 9, day, h).toISOString(), uv }) as HourlyForecast;

  it("by day: today's index, the hour under way and today's highest hour", () => {
    const now = new Date(2026, 9, 5, 11, 30);
    const hourly = [hour(5, 11, 3), hour(5, 12, 4), hour(5, 13, 5), hour(5, 14, 4), hour(5, 20, null), hour(6, 13, 7)];
    const uv = uvOutlook([period("Today", false, 5), period("Tonight", true, null)], hourly, now);
    expect(uv.day).toEqual({ name: "Today", index: 5 });
    expect(uv.now).toBe(3);
    expect(uv.peak).toEqual({ index: 5, at: hour(5, 13, 5).timestamp });
  });

  it("after dark: tomorrow's index and tomorrow's highest hour", () => {
    const now = new Date(2026, 9, 5, 22, 0);
    const hourly = [hour(5, 22, null), hour(6, 12, 3), hour(6, 13, 4)];
    const uv = uvOutlook([period("Tonight", true, null), period("Monday", false, 4)], hourly, now);
    expect(uv.day).toEqual({ name: "Monday", index: 4 });
    expect(uv.now).toBeNull();
    expect(uv.peak).toEqual({ index: 4, at: hour(6, 13, 4).timestamp });
  });

  it("is empty with no UV anywhere", () => {
    expect(uvOutlook([period("Tonight", true, null)], [], new Date())).toEqual({ day: null, now: null, peak: null });
  });
});
