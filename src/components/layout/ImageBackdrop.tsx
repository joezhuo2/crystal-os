import { useState } from "react";
import { isBackdropReady, useImageBackdrop, type BackdropImage } from "@/lib/imageBackdrop";

/**
 * Full-screen background for The Portal, The Horizon, The Engine or The Orbit: its black hole,
 * or the image chosen in Settings, blurred and faded as set there (see
 * imageBackdrop.ts), fading in once baked.
 * An image baked on an earlier visit shows at once, without the fade.
 * Sits behind the page (the parent must create a stacking context) and never
 * takes pointer events.
 */
export default function ImageBackdrop({ image }: { image: BackdropImage }) {
  const { url, opacity } = useImageBackdrop(image, "page");
  const [instant] = useState(() => isBackdropReady(image, "page"));
  return (
    <div aria-hidden="true" className="image-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {url && (
        <div
          key={url}
          className="image-backdrop-image"
          data-instant={instant ? "" : undefined}
          style={{ backgroundImage: `url("${url}")`, opacity }}
        />
      )}
    </div>
  );
}
