import { describe, expect, it } from "vitest";
import { AVAILABLE_CITIES, distanceKm, locationErrorMessage, nearestCity, resolveSuggestions } from "./useWeather";

describe("resolveSuggestions", () => {
  it("returns the hard-coded suggestions before the list loads", () => {
    expect(resolveSuggestions(undefined)).toBe(AVAILABLE_CITIES);
  });

  it("takes each suggestion's id from the list by name", () => {
    const cities = [
      { id: "on-82", name: "Kitchener-Waterloo", region: "Waterloo - Wellington" },
      { id: "on-24", name: "Mississauga", region: "Mississauga - Brampton" },
      { id: "qc-1", name: "Mississauga" },
    ];
    const mississauga = resolveSuggestions(cities).find((c) => c.name === "Mississauga");
    expect(mississauga).toEqual(cities[1]);
  });

  it("names a suggestion missing from the list after its id", () => {
    const cities = [{ id: "on-82", name: "Kitchener-Waterloo" }];
    const names = resolveSuggestions(cities).map((c) => c.name);
    expect(names).toContain("Kitchener-Waterloo");
    expect(names).not.toContain("Mississauga");
  });
});

describe("distanceKm", () => {
  it("measures Toronto to Ottawa at about 350 km", () => {
    expect(distanceKm(43.65, -79.38, 45.42, -75.69)).toBeGreaterThan(340);
    expect(distanceKm(43.65, -79.38, 45.42, -75.69)).toBeLessThan(360);
  });

  it("is 0 for the same point", () => {
    expect(distanceKm(45, -75, 45, -75)).toBe(0);
  });
});

describe("nearestCity", () => {
  const cities = [
    { id: "on-143", name: "Toronto", lat: 43.65, lon: -79.38 },
    { id: "on-85", name: "Markham", lat: 43.88, lon: -79.26 },
    { id: "on-118", name: "Ottawa", lat: 45.42, lon: -75.69 },
    { id: "on-1", name: "No point" },
  ];

  it("picks the closest location", () => {
    expect(nearestCity(cities, 43.86, -79.3)?.id).toBe("on-85");
    expect(nearestCity(cities, 45.3, -75.8)?.id).toBe("on-118");
  });

  it("returns null when nothing is within range", () => {
    // Paris.
    expect(nearestCity(cities, 48.86, 2.35)).toBeNull();
    expect(nearestCity(cities, 43.86, -79.3, 1)).toBeNull();
  });

  it("skips locations without coordinates", () => {
    expect(nearestCity([{ id: "on-1", name: "No point" }], 43.65, -79.38)).toBeNull();
  });
});

describe("locationErrorMessage", () => {
  it("explains a denied permission and a timeout", () => {
    expect(locationErrorMessage({ code: 1 })).toMatch(/off/);
    expect(locationErrorMessage({ code: 3 })).toMatch(/too long/);
    expect(locationErrorMessage(new Error("x"))).toMatch(/could not be found/);
  });
});
