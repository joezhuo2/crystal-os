/**
 * Image backgrounds for the Horizon (a blue black hole), the Engine (a red
 * one), the Orbit (a pale tilted one) and the Portal (a warm, peach and rose
 * one), shown behind each page and behind its box on the Home tab. Each image
 * is blurred once on a canvas with the Atmosphere's Image blur scale
 * (blurImage, the same bake), so no place pays for a live CSS blur. Each
 * page's image, blurs and opacity can be changed in Settings
 * (backdropSettings.ts).
 */
import { useEffect, useState } from "react";
import homeImage from "@/assets/home-backdrop.webp";
import settingsImage from "@/assets/settings-backdrop.jpg";
import horizonImage from "@/assets/horizon-backdrop.webp";
import engineImage from "@/assets/engine-backdrop.webp";
import orbitImage from "@/assets/orbit-backdrop.webp";
import portalImage from "@/assets/portal-backdrop.webp";
import archiveImage from "@/assets/archive-backdrop.jpg";
import { blurImage } from "@/lib/atmosphereImage";
import { backdropSettings, useBackdropSettings, type BackdropImage } from "@/lib/backdropSettings";

export type { BackdropImage };

/** Where an image is shown: behind its page, or behind its box on the Home tab. */
export type BackdropPlace = "page" | "card";

const IMAGES: Record<BackdropImage, string> = {
  // Behind the whole Home tab, a white-gold black hole edge-on in deep navy.
  home: homeImage,
  // Behind Settings, a star torn by a rose and indigo black hole.
  settings: settingsImage,
  horizon: horizonImage,
  engine: engineImage,
  orbit: orbitImage,
  portal: portalImage,
  // Home box only; The Archive page keeps its amethyst cave.
  archive: archiveImage,
};

const baked = new Map<string, Promise<string>>();
/** Bakes that have finished, and decoded, so a remount can show them at once. */
const ready = new Map<string, string>();

/** Decodes `url` off the main thread, so the first paint that uses it doesn't. */
function decoded(url: string): Promise<string> {
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => url,
    () => url,
  );
}

function bake(src: string, amount: number): Promise<string> {
  const key = `${src}:${amount}`;
  let url = baked.get(key);
  if (!url) {
    url = fetch(src)
      .then((res) => res.blob())
      .then((blob) => blurImage(blob, amount))
      .then((blob) => URL.createObjectURL(blob))
      // No canvas or fetch: show the sharp image rather than nothing.
      .catch(() => src)
      .then(decoded)
      .then((u) => {
        ready.set(key, u);
        return u;
      });
    baked.set(key, url);
  }
  return url;
}

function source(image: BackdropImage, place: BackdropPlace) {
  const c = backdropSettings.getState()[image];
  return { src: c.customUrl ?? IMAGES[image], amount: place === "page" ? c.pageBlur : c.cardBlur, opacity: c.opacity };
}

/** True once `image` has been baked and decoded for `place` under the current settings. */
export function isBackdropReady(image: BackdropImage, place: BackdropPlace): boolean {
  const { src, amount } = source(image, place);
  return ready.has(`${src}:${amount}`);
}

/**
 * Object URL of `image` blurred for `place` (null while it bakes), and the
 * opacity (0–1) to show it at. A bake that already finished is returned on
 * the first render, so revisiting a tab does not flash an empty backdrop.
 */
export function useImageBackdrop(image: BackdropImage, place: BackdropPlace): { url: string | null; opacity: number } {
  useBackdropSettings();
  const { src, amount, opacity } = source(image, place);
  const key = `${src}:${amount}`;
  const [state, setState] = useState(() => ({ key, url: ready.get(key) ?? null }));
  let current = state;
  if (state.key !== key) {
    current = { key, url: ready.get(key) ?? null };
    setState(current);
  }
  useEffect(() => {
    if (ready.has(key)) return;
    let live = true;
    bake(src, amount).then((u) => live && setState({ key, url: u }));
    return () => {
      live = false;
    };
  }, [key, src, amount]);
  return { url: current.url, opacity: opacity / 100 };
}
