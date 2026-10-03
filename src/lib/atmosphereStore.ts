/**
 * The Atmosphere's settings, shared by the page, its backdrop, the Home box,
 * and Settings: the city, whether the Living Sky shows weather effects and
 * the aurora, the background image, and how much that image is blurred.
 * With no image of the user's own, a bundled misty forest lake is shown. The
 * settings persist in localStorage, a chosen image in IndexedDB
 * (atmosphereImage.ts); every change applies at once.
 */

import { useSyncExternalStore } from "react";
import { isCityId } from "@/hooks/useWeather";
import defaultImageSrc from "@/assets/atmosphere-backdrop.webp";
import {
  DEFAULT_IMAGE_BLUR,
  blurImage,
  checkImage,
  deleteImage,
  loadImage,
  prepareImage,
  saveImage,
} from "@/lib/atmosphereImage";

export const CITY_KEY = "crystal-os-weather-city";
export const WEATHER_EFFECTS_KEY = "crystal-os-atmosphere-weather-effects";
export const AURORA_KEY = "crystal-os-atmosphere-aurora";
export const IMAGE_BLUR_KEY = "crystal-os-atmosphere-image-blur";

export const DEFAULT_CITY = "on-85";

export interface AtmosphereSettings {
  cityId: string;
  /** Clouds, and rain, snow, fog or lightning that follow the current conditions. */
  weatherEffects: boolean;
  /** Aurora ribbons over a pine treeline, bending toward the cursor. */
  aurora: boolean;
  /**
   * Object URL of the background as chosen (the user's own, else the bundled
   * default), for the Settings preview. Null until the default has loaded,
   * and if it cannot be read.
   */
  imageUrl: string | null;
  /** Whether the background is the user's own image rather than the default. */
  customImage: boolean;
  /**
   * Object URL of the blurred copy the page and Home box show, with the sky's
   * effects drawn over it. Null until it is baked, and with no image.
   */
  backdropUrl: string | null;
  /** How much the background image is blurred, 0 (sharp) to 100. */
  imageBlur: number;
}

/** Whole number 0–100. Anything unreadable falls back to the default. */
export function clampImageBlur(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_IMAGE_BLUR;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the change still applies for this session.
  }
}

function load(): AtmosphereSettings {
  const city = read(CITY_KEY);
  return {
    cityId: isCityId(city) ? city : DEFAULT_CITY,
    // Both on unless turned off.
    weatherEffects: read(WEATHER_EFFECTS_KEY) !== "0",
    aurora: read(AURORA_KEY) !== "0",
    imageUrl: null,
    customImage: false,
    backdropUrl: null,
    imageBlur: clampImageBlur(read(IMAGE_BLUR_KEY)),
  };
}

let state: AtmosphereSettings = load();
const listeners = new Set<() => void>();

function set(next: AtmosphereSettings) {
  state = next;
  listeners.forEach((l) => l());
}

// The user's image, kept so a new blur can be baked from it.
let imageBlob: Blob | null = null;
// The bundled default, fetched the first time there is no image of the user's own.
let defaultBlob: Blob | null = null;
let defaultLoading = false;

/** The image shown: the user's own, else the default once it has loaded. */
const shownBlob = () => imageBlob ?? defaultBlob;

// Bumped by every set or clear, so a slow startup read never overwrites a
// newer choice.
let imageVersion = 0;
// Bumped by every bake, so only the latest blur is shown.
let bakeVersion = 0;

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

/** Bakes the blurred copy for the current image and blur, then swaps it in. */
function bake() {
  const blob = shownBlob();
  const version = ++bakeVersion;
  if (!blob) return;
  blurImage(blob, state.imageBlur)
    .catch(() => blob)
    .then((blurred) => {
      if (version !== bakeVersion || blob !== shownBlob()) return;
      revoke(state.backdropUrl);
      set({ ...state, backdropUrl: URL.createObjectURL(blurred) });
    });
}

function showImage(blob: Blob | null) {
  imageBlob = blob;
  revoke(state.imageUrl);
  revoke(state.backdropUrl);
  const shown = shownBlob();
  set({ ...state, imageUrl: shown ? URL.createObjectURL(shown) : null, customImage: !!blob, backdropUrl: null });
  if (!shown) loadDefault();
  bake();
}

function loadDefault() {
  if (defaultBlob || defaultLoading) return;
  defaultLoading = true;
  fetch(defaultImageSrc)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      defaultBlob = blob;
      if (!imageBlob) showImage(null);
    })
    .catch(() => {
      // No default: fall back to the plain sky.
    })
    .finally(() => {
      defaultLoading = false;
    });
}

/**
 * Shows the saved image, or the default if there is none. The default waits
 * for the saved image's read, so a saved image never flashes the default first.
 */
function restoreImage() {
  const version = imageVersion;
  loadImage()
    .then((blob) => {
      if (blob && version === imageVersion) showImage(blob);
    })
    .catch(() => {
      // Unreadable store: fall back to the default.
    })
    .finally(() => {
      if (!imageBlob) loadDefault();
    });
}

restoreImage();

export const atmosphere = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setCity(cityId: string) {
    if (!isCityId(cityId) || cityId === state.cityId) return;
    write(CITY_KEY, cityId);
    set({ ...state, cityId });
  },

  setWeatherEffects(on: boolean) {
    if (on === state.weatherEffects) return;
    write(WEATHER_EFFECTS_KEY, on ? "1" : "0");
    set({ ...state, weatherEffects: on });
  },

  setAurora(on: boolean) {
    if (on === state.aurora) return;
    write(AURORA_KEY, on ? "1" : "0");
    set({ ...state, aurora: on });
  },

  /** Sets the image blur (0–100) and re-bakes the blurred copy. */
  setImageBlur(value: unknown) {
    const imageBlur = clampImageBlur(value);
    if (imageBlur === state.imageBlur) return;
    write(IMAGE_BLUR_KEY, String(imageBlur));
    set({ ...state, imageBlur });
    bake();
  },

  /**
   * Checks, scales, and stores a PNG or JPEG as the background. Rejects with
   * a readable message if the file cannot be used or saved; the current
   * background is kept in that case.
   */
  async setImage(file: File) {
    const problem = checkImage(file);
    if (problem) throw new Error(problem);
    const version = ++imageVersion;
    const blob = await prepareImage(file);
    try {
      await saveImage(blob);
    } catch (err) {
      throw new Error(err instanceof Error && err.message ? err.message : "The image could not be saved.");
    }
    if (version === imageVersion) showImage(blob);
  },

  /** Removes the user's image and goes back to the default. */
  async clearImage() {
    ++imageVersion;
    showImage(null);
    await deleteImage().catch(() => undefined);
  },

  /** Test hook: reload from storage. */
  _reset() {
    imageBlob = null;
    revoke(state.imageUrl);
    revoke(state.backdropUrl);
    set(load());
  },
};

export function useAtmosphere() {
  return useSyncExternalStore(atmosphere.subscribe, atmosphere.getState);
}
