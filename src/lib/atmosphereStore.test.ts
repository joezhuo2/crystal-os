import { beforeEach, describe, expect, it } from "vitest";
import { AURORA_KEY, CITY_KEY, DEFAULT_CITY, IMAGE_BLUR_KEY, WEATHER_EFFECTS_KEY, atmosphere, clampImageBlur } from "./atmosphereStore";
import { DEFAULT_IMAGE_BLUR } from "./atmosphereImage";

beforeEach(() => {
  localStorage.clear();
  atmosphere._reset();
});

describe("atmosphere settings", () => {
  it("defaults to Markham with both effects on", () => {
    expect(atmosphere.getState()).toEqual({ cityId: DEFAULT_CITY, weatherEffects: true, aurora: true, imageUrl: null, backdropUrl: null, imageBlur: DEFAULT_IMAGE_BLUR });
  });

  it("keeps the city saved under the old weather key", () => {
    localStorage.setItem(CITY_KEY, "on-143");
    atmosphere._reset();
    expect(atmosphere.getState().cityId).toBe("on-143");
  });

  it("persists every setting across a reload", () => {
    atmosphere.setCity("on-118");
    atmosphere.setWeatherEffects(false);
    atmosphere.setAurora(false);
    atmosphere.setImageBlur(20);
    expect(localStorage.getItem(CITY_KEY)).toBe("on-118");
    expect(localStorage.getItem(IMAGE_BLUR_KEY)).toBe("20");
    expect(localStorage.getItem(WEATHER_EFFECTS_KEY)).toBe("0");
    expect(localStorage.getItem(AURORA_KEY)).toBe("0");
    atmosphere._reset();
    expect(atmosphere.getState()).toEqual({ cityId: "on-118", weatherEffects: false, aurora: false, imageUrl: null, backdropUrl: null, imageBlur: 20 });
  });

  it("ignores unknown cities, stored or set", () => {
    localStorage.setItem(CITY_KEY, "atlantis");
    atmosphere._reset();
    expect(atmosphere.getState().cityId).toBe(DEFAULT_CITY);
    localStorage.clear();
    atmosphere.setCity("atlantis");
    expect(atmosphere.getState().cityId).toBe(DEFAULT_CITY);
    expect(localStorage.getItem(CITY_KEY)).toBeNull();
  });

  it("notifies subscribers only on real changes", () => {
    let calls = 0;
    const off = atmosphere.subscribe(() => calls++);
    atmosphere.setWeatherEffects(true);
    atmosphere.setAurora(true);
    atmosphere.setCity(DEFAULT_CITY);
    expect(calls).toBe(0);
    atmosphere.setAurora(false);
    expect(calls).toBe(1);
    off();
  });

  it("refuses files that are not PNG or JPEG and keeps the plain sky", async () => {
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    await expect(atmosphere.setImage(gif)).rejects.toThrow("PNG or JPEG");
    expect(atmosphere.getState().imageUrl).toBeNull();
  });

  it("clamps the image blur to whole numbers 0–100", () => {
    expect(clampImageBlur(-4)).toBe(0);
    expect(clampImageBlur(33.6)).toBe(34);
    expect(clampImageBlur(250)).toBe(100);
    expect(clampImageBlur("70")).toBe(70);
    expect(clampImageBlur("lots")).toBe(DEFAULT_IMAGE_BLUR);
    localStorage.setItem(IMAGE_BLUR_KEY, "junk");
    atmosphere._reset();
    expect(atmosphere.getState().imageBlur).toBe(DEFAULT_IMAGE_BLUR);
  });
});
