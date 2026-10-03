import { PAGE_BACKDROP_BLUR, useImageBackdrop, type BackdropImage } from "@/lib/imageBackdrop";

/**
 * Full-screen background for The Horizon, The Engine or The Orbit: its black hole,
 * blurred at PAGE_BACKDROP_BLUR (see imageBackdrop.ts), fading in once baked.
 * Sits behind the page (the parent must create a stacking context) and never
 * takes pointer events.
 */
export default function ImageBackdrop({ image }: { image: BackdropImage }) {
  const url = useImageBackdrop(image, PAGE_BACKDROP_BLUR);
  return (
    <div aria-hidden="true" className="image-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {url && <div key={image} className="image-backdrop-image" style={{ backgroundImage: `url("${url}")` }} />}
    </div>
  );
}
