import { beforeEach, describe, expect, it } from "vitest";
import { FLUX_LINES_KEY, THEME_KEY, themeSettings } from "./themeSettings";

beforeEach(() => {
  localStorage.clear();
  themeSettings._reset();
});

describe("theme settings", () => {
  it("defaults to the default theme with Flux Lines on", () => {
    expect(themeSettings.getState()).toEqual({ theme: "default", fluxLines: true });
  });

  it("persists the theme and the Flux Lines switch across a reload", () => {
    themeSettings.setTheme("orbit");
    themeSettings.setFluxLines(false);
    expect(localStorage.getItem(THEME_KEY)).toBe("orbit");
    expect(localStorage.getItem(FLUX_LINES_KEY)).toBe("0");
    themeSettings._reset();
    expect(themeSettings.getState()).toEqual({ theme: "orbit", fluxLines: false });
  });

  it("falls back to the default theme for an unknown stored value", () => {
    localStorage.setItem(THEME_KEY, "neon");
    themeSettings._reset();
    expect(themeSettings.getState().theme).toBe("default");
  });
});
