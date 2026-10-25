/**
 * Each page's background settings, shared by its backdrop, its box on the
 * Home tab and Settings: an image of the user's own in place of the bundled
 * one, how much it is blurred behind the page and behind the Home box, and
 * how strongly it shows. Settings persist in localStorage, a chosen image in
 * IndexedDB (atmosphereImage.ts); every change applies at once.
 */

import { useSyncExternalStore } from "react";
import { checkImage, deleteImage, loadImage, prepareImage, saveImage } from "@/lib/atmosphereImage";

export type BackdropImage = "home" | "horizon" | "engine" | "orbit" | "portal" | "archive";

export const BACKDROP_IMAGES: readonly BackdropImage[] = ["home", "horizon", "engine", "orbit", "portal", "archive"];

/** Default image blur (0–100) behind a page. */
export const PAGE_BACKDROP_BLUR = 15;
/** Default image blur (0–100) behind a page's box on the Home tab. */
export const CARD_BACKDROP_BLUR = 25;
/** Default image opacity, 0–100. */
export const DEFAULT_BACKDROP_OPACITY = 100;

export interface BackdropConfig {
  /** Object URL of the user's own image, or null for the bundled one. */
  customUrl: string | null;
  /** Blur behind the page, 0–100. */
  pageBlur: number;
  /** Blur behind the Home box, 0–100. */
  cardBlur: number;
  /** How strongly the image shows, 0–100. */
  opacity: number;
}

export type BackdropSettings = Record<BackdropImage, BackdropConfig>;

type Amount = "pageBlur" | "cardBlur" | "opacity";

const DEFAULTS: Record<Amount, number> = {
  pageBlur: PAGE_BACKDROP_BLUR,
  cardBlur: CARD_BACKDROP_BLUR,
  opacity: DEFAULT_BACKDROP_OPACITY,
};

export const settingsKey = (image: BackdropImage) => `crystal-os-backdrop-${image}`;
const imageKey = (image: BackdropImage) => `backdrop-${image}`;

/** Whole number 0–100. Anything unreadable falls back to `fallback`. */
export function clampAmount(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
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

function loadOne(image: BackdropImage): BackdropConfig {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(read(settingsKey(image)) ?? "{}");
    if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
  } catch {
    // Unreadable: defaults.
  }
  return {
    customUrl: null,
    pageBlur: clampAmount(saved.pageBlur, DEFAULTS.pageBlur),
    cardBlur: clampAmount(saved.cardBlur, DEFAULTS.cardBlur),
    opacity: clampAmount(saved.opacity, DEFAULTS.opacity),
  };
}

function load(): BackdropSettings {
  return Object.fromEntries(BACKDROP_IMAGES.map((i) => [i, loadOne(i)])) as BackdropSettings;
}

let state: BackdropSettings = load();
const listeners = new Set<() => void>();

function set(image: BackdropImage, next: BackdropConfig) {
  state = { ...state, [image]: next };
  listeners.forEach((l) => l());
}

function persist(image: BackdropImage, c: BackdropConfig) {
  write(settingsKey(image), JSON.stringify({ pageBlur: c.pageBlur, cardBlur: c.cardBlur, opacity: c.opacity }));
}

// Bumped by every set or clear, so a slow startup read never overwrites a newer choice.
const versions: Record<string, number> = {};
const bump = (image: BackdropImage) => (versions[image] = (versions[image] ?? 0) + 1);

function showImage(image: BackdropImage, blob: Blob | null) {
  const old = state[image].customUrl;
  if (old) URL.revokeObjectURL(old);
  set(image, { ...state[image], customUrl: blob ? URL.createObjectURL(blob) : null });
}

function restoreImages() {
  for (const image of BACKDROP_IMAGES) {
    const version = versions[image] ?? 0;
    loadImage(imageKey(image))
      .then((blob) => {
        if (blob && version === (versions[image] ?? 0)) showImage(image, blob);
      })
      .catch(() => {
        // Unreadable store: keep the bundled image.
      });
  }
}

restoreImages();

export const backdropSettings = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setAmount(image: BackdropImage, key: Amount, value: unknown) {
    const n = clampAmount(value, DEFAULTS[key]);
    if (n === state[image][key]) return;
    const next = { ...state[image], [key]: n };
    persist(image, next);
    set(image, next);
  },

  /**
   * Checks, scales, and stores a PNG or JPEG as the page's background. Rejects
   * with a readable message if the file cannot be used or saved; the current
   * background is kept in that case.
   */
  async setImage(image: BackdropImage, file: File) {
    const problem = checkImage(file);
    if (problem) throw new Error(problem);
    const version = bump(image);
    const blob = await prepareImage(file);
    try {
      await saveImage(blob, imageKey(image));
    } catch (err) {
      throw new Error(err instanceof Error && err.message ? err.message : "The image could not be saved.");
    }
    if (version === versions[image]) showImage(image, blob);
  },

  /** Removes the user's image and goes back to the bundled one. */
  async clearImage(image: BackdropImage) {
    bump(image);
    showImage(image, null);
    await deleteImage(imageKey(image)).catch(() => undefined);
  },

  /** Puts the page's blur and opacity back to their defaults; keeps its image. */
  resetAmounts(image: BackdropImage) {
    const next = { ...state[image], ...DEFAULTS };
    persist(image, next);
    set(image, next);
  },

  /** Test hook: reload from storage. */
  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useBackdropSettings() {
  return useSyncExternalStore(backdropSettings.subscribe, backdropSettings.getState);
}
