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
      .catch(() => src);
    baked.set(key, url);
  }
  return url;
}

/** Object URL of `image` blurred by `amount`, or null while it bakes. */
export function useImageBackdrop(image: BackdropImage, amount: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    bake(image, amount).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [image, amount]);
  return url;
}
