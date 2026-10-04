import { useState } from "react";
import { isBackdropReady, PAGE_BACKDROP_BLUR, useImageBackdrop, type BackdropImage } from "@/lib/imageBackdrop";

/**
 * Full-screen background for The Horizon, The Engine or The Orbit: its black hole,
 * blurred at PAGE_BACKDROP_BLUR (see imageBackdrop.ts), fading in once baked.
 * An image baked on an earlier visit shows at once, without the fade.
 * Sits behind the page (the parent must create a stacking context) and never
 * takes pointer events.
 */
export default function ImageBackdrop({ image }: { image: BackdropImage }) {
  const url = useImageBackdrop(image, PAGE_BACKDROP_BLUR);
  const [instant] = useState(() => isBackdropReady(image, PAGE_BACKDROP_BLUR));
  return (
    <div aria-hidden="true" className="image-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {url && (
        <div
          key={image}
          className="image-backdrop-image"
          data-instant={instant ? "" : undefined}
          style={{ backgroundImage: `url("${url}")` }}
        />
      )}
    </div>
  );
}
