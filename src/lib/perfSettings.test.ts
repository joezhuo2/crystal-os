import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKDROP_FRAME_SCALE_KEY,
  BACKGROUND_REFRESH_KEY,
  CACHE_MINUTES_KEY,
  DEFAULT_CACHE_MINUTES,
  DEFAULT_UNLOAD_DELAY,
  FREE_CACHE_KEY,
  LAZY_VIEWS_KEY,
  MAX_CACHE_MINUTES,
  MAX_UNLOAD_DELAY,
  PERF_MODE_KEY,
  REDUCE_BLUR_KEY,
  STILL_BACKDROPS_KEY,
  UNLOAD_DELAY_KEY,
  backdropFps,
  cacheTimeMs,
  clampBackdropFrameScale,
  clampCacheMinutes,
  clampUnloadDelay,
  perfSettings,
} from "./perfSettings";

const allOff = {
  performanceMode: false,
  lazyViews: false,
  freeCache: false,
  cacheMinutes: DEFAULT_CACHE_MINUTES,
  reduceTransitions: false,
  stillBackdrops: false,
  reduceBlur: false,
  backgroundRefresh: true,
  backdropFrameScale: 1,
  unloadDelay: DEFAULT_UNLOAD_DELAY,
};

beforeEach(() => {
  localStorage.clear();
  perfSettings._reset();
});

describe("perf settings", () => {
  it("defaults to everything off, a 1 minute cache and a 60 s unload delay", () => {
    expect(perfSettings.getState()).toEqual(allOff);
  });

  it("the master switch sets all five and persists across a reload", () => {
    perfSettings.setPerformanceMode(true);
    perfSettings.setUnloadDelay("300");
    expect(localStorage.getItem(PERF_MODE_KEY)).toBe("1");
    expect(localStorage.getItem(UNLOAD_DELAY_KEY)).toBe("300");
    perfSettings._reset();
    expect(perfSettings.getState()).toEqual({
      performanceMode: true,
      lazyViews: true,
      freeCache: true,
      cacheMinutes: DEFAULT_CACHE_MINUTES,
      reduceTransitions: true,
      stillBackdrops: true,
      reduceBlur: true,
      backgroundRefresh: true,
      backdropFrameScale: 1,
      unloadDelay: 300,
    });
  });

  it("the master reads on only while every switch is on", () => {
    perfSettings.setPerformanceMode(true);
    perfSettings.setSwitch("stillBackdrops", false);
    expect(perfSettings.getState().performanceMode).toBe(false);
    expect(perfSettings.getState().lazyViews).toBe(true);
    perfSettings.setSwitch("stillBackdrops", true);
    expect(perfSettings.getState().performanceMode).toBe(true);
  });

  it("switching the master off clears every switch", () => {
    perfSettings.setPerformanceMode(true);
    perfSettings.setPerformanceMode(false);
    expect(perfSettings.getState()).toEqual(allOff);
  });

  it("turning the master on from a partial setup turns the rest on", () => {
    perfSettings.setSwitch("freeCache", true);
    perfSettings.setPerformanceMode(true);
    expect(perfSettings.getState().performanceMode).toBe(true);
  });

  it("keeps a single switch across a reload", () => {
    perfSettings.setSwitch("lazyViews", true);
    expect(localStorage.getItem(LAZY_VIEWS_KEY)).toBe("1");
    perfSettings._reset();
    expect(perfSettings.getState()).toEqual({ ...allOff, lazyViews: true });
  });

  it("reads the old single flag as the four switches it held on, leaving blur and background refresh alone", () => {
    localStorage.setItem(PERF_MODE_KEY, "1");
    perfSettings._reset();
    expect(perfSettings.getState()).toMatchObject({
      lazyViews: true,
      freeCache: true,
      reduceTransitions: true,
      stillBackdrops: true,
      reduceBlur: false,
      backgroundRefresh: true,
      performanceMode: false,
    });
    localStorage.setItem(STILL_BACKDROPS_KEY, "0");
    perfSettings._reset();
    expect(perfSettings.getState().stillBackdrops).toBe(false);
    expect(perfSettings.getState().lazyViews).toBe(true);
  });

  it("keeps blur, background refresh and the backdrop frame rate across a reload", () => {
    perfSettings.setSwitch("reduceBlur", true);
    perfSettings.setSwitch("backgroundRefresh", false);
    perfSettings.setBackdropFrameScale("0.5");
    expect(localStorage.getItem(REDUCE_BLUR_KEY)).toBe("1");
    expect(localStorage.getItem(BACKGROUND_REFRESH_KEY)).toBe("0");
    expect(localStorage.getItem(BACKDROP_FRAME_SCALE_KEY)).toBe("0.5");
    perfSettings._reset();
    expect(perfSettings.getState()).toEqual({ ...allOff, reduceBlur: true, backgroundRefresh: false, backdropFrameScale: 0.5 });
  });

  it("the master leaves background refresh and the backdrop frame rate alone", () => {
    perfSettings.setPerformanceMode(true);
    perfSettings.setSwitch("backgroundRefresh", false);
    expect(perfSettings.getState().performanceMode).toBe(true);
    perfSettings.setPerformanceMode(false);
    expect(perfSettings.getState().backgroundRefresh).toBe(false);
    expect(perfSettings.getState().backdropFrameScale).toBe(1);
  });

  it("snaps the backdrop frame scale to full or half", () => {
    expect(clampBackdropFrameScale(1)).toBe(1);
    expect(clampBackdropFrameScale(0.5)).toBe(0.5);
    expect(clampBackdropFrameScale("0.5")).toBe(0.5);
    expect(clampBackdropFrameScale(0.1)).toBe(0.5);
    expect(clampBackdropFrameScale(3)).toBe(1);
    expect(clampBackdropFrameScale("half")).toBe(1);
    expect(clampBackdropFrameScale("")).toBe(1);
  });

  it("scales a backdrop's frame rate, never below 1 fps", () => {
    expect(backdropFps(30)).toBe(30);
    perfSettings.setBackdropFrameScale(0.5);
    expect(backdropFps(30)).toBe(15);
    expect(backdropFps(25)).toBe(13);
    expect(backdropFps(1)).toBe(1);
  });

  it("clamps the delay to whole seconds in range", () => {
    expect(clampUnloadDelay(-5)).toBe(0);
    expect(clampUnloadDelay(0)).toBe(0);
    expect(clampUnloadDelay(12.6)).toBe(13);
    expect(clampUnloadDelay(99999)).toBe(MAX_UNLOAD_DELAY);
    expect(clampUnloadDelay("abc")).toBe(DEFAULT_UNLOAD_DELAY);
    expect(clampUnloadDelay("")).toBe(DEFAULT_UNLOAD_DELAY);
  });

  it("clamps the cache time to whole minutes in range", () => {
    expect(clampCacheMinutes(0)).toBe(1);
    expect(clampCacheMinutes(7.4)).toBe(7);
    expect(clampCacheMinutes(999)).toBe(MAX_CACHE_MINUTES);
    expect(clampCacheMinutes("x")).toBe(DEFAULT_CACHE_MINUTES);
  });

  it("uses the chosen minutes only while freeing cached data is on", () => {
    perfSettings.setCacheMinutes("10");
    expect(localStorage.getItem(CACHE_MINUTES_KEY)).toBe("10");
    expect(cacheTimeMs(perfSettings.getState())).toBe(5 * 60_000);
    perfSettings.setSwitch("freeCache", true);
    expect(localStorage.getItem(FREE_CACHE_KEY)).toBe("1");
    expect(cacheTimeMs(perfSettings.getState())).toBe(10 * 60_000);
  });

  it("falls back to the default when storage holds garbage", () => {
    localStorage.setItem(UNLOAD_DELAY_KEY, "soon");
    localStorage.setItem(CACHE_MINUTES_KEY, "soon");
    perfSettings._reset();
    expect(perfSettings.getState().unloadDelay).toBe(DEFAULT_UNLOAD_DELAY);
    expect(perfSettings.getState().cacheMinutes).toBe(DEFAULT_CACHE_MINUTES);
  });

  it("notifies subscribers only on real changes", () => {
    let calls = 0;
    const off = perfSettings.subscribe(() => calls++);
    perfSettings.setPerformanceMode(false);
    perfSettings.setSwitch("lazyViews", false);
    perfSettings.setCacheMinutes(1);
    perfSettings.setUnloadDelay(60);
    perfSettings.setBackdropFrameScale(1);
    perfSettings.setSwitch("backgroundRefresh", true);
    expect(calls).toBe(0);
    perfSettings.setPerformanceMode(true);
    expect(calls).toBe(1);
    off();
  });
});
