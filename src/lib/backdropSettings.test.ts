import { beforeEach, describe, expect, it } from "vitest";
import {
  CARD_BACKDROP_BLUR,
  DEFAULT_BACKDROP_OPACITY,
  PAGE_BACKDROP_BLUR,
  backdropSettings,
  clampAmount,
  settingsKey,
} from "./backdropSettings";

beforeEach(() => {
  localStorage.clear();
  backdropSettings._reset();
});

describe("backdrop settings", () => {
  it("defaults every page to the bundled image and default amounts", () => {
    expect(backdropSettings.getState().engine).toEqual({
      customUrl: null,
      pageBlur: PAGE_BACKDROP_BLUR,
      cardBlur: CARD_BACKDROP_BLUR,
      opacity: DEFAULT_BACKDROP_OPACITY,
    });
  });

  it("persists each page's amounts on their own", () => {
    backdropSettings.setAmount("horizon", "pageBlur", 40);
    backdropSettings.setAmount("horizon", "opacity", 55);
    backdropSettings._reset();
    expect(backdropSettings.getState().horizon).toMatchObject({ pageBlur: 40, cardBlur: CARD_BACKDROP_BLUR, opacity: 55 });
    expect(backdropSettings.getState().orbit.pageBlur).toBe(PAGE_BACKDROP_BLUR);
  });

  it("clamps values and ignores unreadable storage", () => {
    backdropSettings.setAmount("orbit", "cardBlur", 250);
    expect(backdropSettings.getState().orbit.cardBlur).toBe(100);
    localStorage.setItem(settingsKey("portal"), "not json");
    backdropSettings._reset();
    expect(backdropSettings.getState().portal.opacity).toBe(DEFAULT_BACKDROP_OPACITY);
    expect(clampAmount("x", 7)).toBe(7);
    expect(clampAmount(-3, 7)).toBe(0);
  });

  it("resets amounts to the defaults", () => {
    backdropSettings.setAmount("archive", "opacity", 10);
    backdropSettings.resetAmounts("archive");
    expect(backdropSettings.getState().archive.opacity).toBe(DEFAULT_BACKDROP_OPACITY);
  });

  it("rejects files that are not PNG or JPEG", async () => {
    const file = new File(["x"], "a.gif", { type: "image/gif" });
    await expect(backdropSettings.setImage("engine", file)).rejects.toThrow("Choose a PNG or JPEG image.");
    expect(backdropSettings.getState().engine.customUrl).toBeNull();
  });
});
