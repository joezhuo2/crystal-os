/**
 * The Horizon's background: a black hole, shown behind the Horizon page and
 * the Home tab's "Today on the Horizon" box. Blurred once on a canvas with
 * the Atmosphere's Image blur scale (blurImage, the same bake), so neither
 * place pays for a live CSS blur.
 */
import { useEffect, useState } from "react";
import horizonImage from "@/assets/horizon-backdrop.webp";
import { blurImage } from "@/lib/atmosphereImage";

/** Image blur (0–100) behind the Horizon page. */
export const HORIZON_PAGE_BLUR = 15;
/** Image blur (0–100) behind the Home tab's Horizon box. */
export const HORIZON_CARD_BLUR = 25;

const baked = new Map<number, Promise<string>>();

function bake(amount: number): Promise<string> {
  let url = baked.get(amount);
  if (!url) {
    url = fetch(horizonImage)
      .then((res) => res.blob())
      .then((blob) => blurImage(blob, amount))
      .then((blob) => URL.createObjectURL(blob))
      // No canvas or fetch: show the sharp image rather than nothing.
      .catch(() => horizonImage);
    baked.set(amount, url);
  }
  return url;
}

/** Object URL of the background blurred by `amount`, or null while it bakes. */
export function useHorizonBackdrop(amount: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    bake(amount).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [amount]);
  return url;
}
