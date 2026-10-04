import { beforeEach, describe, expect, it } from "vitest";
import { PRELOAD_COUNT, preloadOrder, recordVisit } from "./viewLoader";

beforeEach(() => localStorage.clear());

describe("preloadOrder", () => {
  it("picks the most visited views, never the current one", () => {
    const order = preloadOrder("home", { home: 40, tasks: 3, archive: 9, weather: 1, financials: 5 });
    expect(order).toEqual(["archive", "financials", "tasks"]);
    expect(order).toHaveLength(PRELOAD_COUNT);
  });

  it("falls back to a default pair on a fresh install", () => {
    expect(preloadOrder("home", {})).toEqual(["tasks", "calendar"]);
    expect(preloadOrder("tasks", {})).toEqual(["calendar"]);
  });

  it("ignores unknown or unvisited entries", () => {
    expect(preloadOrder("home", { tasks: 0, bogus: 9 } as never)).toEqual(["tasks", "calendar"]);
  });
});

describe("recordVisit", () => {
  it("counts visits across calls", () => {
    recordVisit("orbit");
    recordVisit("orbit");
    recordVisit("calendar");
    expect(preloadOrder("home")).toEqual(["orbit", "calendar"]);
  });
});
