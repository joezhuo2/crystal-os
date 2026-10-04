/**
 * Image backgrounds for the Horizon (a blue black hole), the Engine (a red
 * one) and the Orbit (a pale tilted one), shown behind each page and behind
 * its box on the Home tab. Each image is blurred once on a canvas with the
 * Atmosphere's Image blur scale (blurImage, the same bake), so no place pays
 * for a live CSS blur.
 */
import { useEffect, useState } from "react";
import horizonImage from "@/assets/horizon-backdrop.webp";
import engineImage from "@/assets/engine-backdrop.webp";
import orbitImage from "@/assets/orbit-backdrop.webp";
import { blurImage } from "@/lib/atmosphereImage";

export type BackdropImage = "horizon" | "engine" | "orbit";

const IMAGES: Record<BackdropImage, string> = {
  horizon: horizonImage,
  engine: engineImage,
  orbit: orbitImage,
};

/** Image blur (0–100) behind a page. */
export const PAGE_BACKDROP_BLUR = 15;
/** Image blur (0–100) behind a page's box on the Home tab. */
export const CARD_BACKDROP_BLUR = 25;

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

function bake(image: BackdropImage, amount: number): Promise<string> {
  const key = `${image}:${amount}`;
  let url = baked.get(key);
  if (!url) {
    const src = IMAGES[image];
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

/** True once `image` at `amount` has been baked and decoded. */
export function isBackdropReady(image: BackdropImage, amount: number): boolean {
  return ready.has(`${image}:${amount}`);
}

/**
 * Object URL of `image` blurred by `amount`, or null while it bakes. A bake
 * that already finished is returned on the first render, so revisiting a tab
 * does not flash an empty backdrop.
 */
export function useImageBackdrop(image: BackdropImage, amount: number): string | null {
  const key = `${image}:${amount}`;
  const [state, setState] = useState(() => ({ key, url: ready.get(key) ?? null }));
  let current = state;
  if (state.key !== key) {
    current = { key, url: ready.get(key) ?? null };
    setState(current);
  }
  useEffect(() => {
    if (ready.has(key)) return;
    let live = true;
    bake(image, amount).then((u) => live && setState({ key, url: u }));
    return () => {
      live = false;
    };
  }, [key, image, amount]);
  return current.url;
}
