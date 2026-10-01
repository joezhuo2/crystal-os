import { describe, expect, it } from "vitest";
import { AVAILABLE_CITIES, resolveSuggestions } from "./useWeather";

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
