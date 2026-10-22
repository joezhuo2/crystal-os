import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_NAV_SETTINGS, NAV_SETTINGS_KEY, moveTab, navLayout, navSettings, parseNavSettings } from "./navSettings";

beforeEach(() => {
  localStorage.clear();
  navSettings._reset();
});

describe("parseNavSettings", () => {
  it("defaults to today's sidebar", () => {
    expect(parseNavSettings(null)).toEqual(DEFAULT_NAV_SETTINGS);
    expect(navLayout(DEFAULT_NAV_SETTINGS)).toEqual({
      top: ["home", "orbit", "tasks", "calendar", "financials", "weather"],
      bottom: ["archive", "nebula", "portal", "terminal", "settings"],
    });
  });

  it("drops unknown pages, never hides Settings, and puts missing pages back in their default place", () => {
    const s = parseNavSettings(JSON.stringify({ order: ["weather", "home", "bogus", "home"], hidden: ["orbit", "settings"], bottom: ["home"] }));
    expect(s.order.slice(0, 4)).toEqual(["weather", "archive", "nebula", "portal"]);
    expect(s.order).toContain("orbit");
    expect(s.order).toHaveLength(11);
    expect(s.hidden).toEqual(["orbit"]);
    expect(s.bottom).toEqual(["home"]);
    expect(parseNavSettings("not json")).toEqual(DEFAULT_NAV_SETTINGS);
  });
});

describe("navLayout", () => {
  it("leaves out hidden and unavailable pages", () => {
    const layout = navLayout({ ...DEFAULT_NAV_SETTINGS, hidden: ["weather"] }, (id) => id !== "terminal");
    expect(layout.top).not.toContain("weather");
    expect(layout.bottom).toEqual(["archive", "nebula", "portal", "settings"]);
  });
});

describe("moveTab", () => {
  it("swaps with the neighbour in the same group and stops at the ends", () => {
    const moved = moveTab(DEFAULT_NAV_SETTINGS, "weather", 1);
    expect(moved).toBe(DEFAULT_NAV_SETTINGS);
    expect(navLayout(moveTab(DEFAULT_NAV_SETTINGS, "orbit", -1)).top.slice(0, 2)).toEqual(["orbit", "home"]);
    expect(navLayout(moveTab(DEFAULT_NAV_SETTINGS, "archive", 1)).bottom.slice(0, 2)).toEqual(["nebula", "archive"]);
  });
});

describe("navSettings store", () => {
  it("hides, regroups, saves and resets", () => {
    navSettings.setHidden("financials", true);
    navSettings.setHidden("settings", true);
    navSettings.setBottom("weather", true);
    expect(navLayout(navSettings.getState()).bottom[0]).toBe("weather");
    navSettings.move("weather", 1);
    expect(navLayout(navSettings.getState()).bottom).toEqual(["archive", "weather", "nebula", "portal", "terminal", "settings"]);
    expect(navSettings.getState().hidden).toEqual(["financials"]);
    expect(parseNavSettings(localStorage.getItem(NAV_SETTINGS_KEY))).toEqual(navSettings.getState());
    navSettings.reset();
    expect(navSettings.getState()).toEqual(DEFAULT_NAV_SETTINGS);
  });
});
