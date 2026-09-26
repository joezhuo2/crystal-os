import { HORIZON_PAGE_BLUR, useHorizonBackdrop } from "@/lib/horizonBackdrop";

/**
 * Full-screen background for The Horizon: the black hole, blurred at HORIZON_PAGE_BLUR
 * (see horizonBackdrop.ts), fading in once baked. Sits behind the page (the
 * parent must create a stacking context) and never takes pointer events.
 */
export default function HorizonBackdrop() {
  const url = useHorizonBackdrop(HORIZON_PAGE_BLUR);
  return (
    <div aria-hidden="true" className="horizon-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {url && <div className="horizon-image" style={{ backgroundImage: `url("${url}")` }} />}
    </div>
  );
}
