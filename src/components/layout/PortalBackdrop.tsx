import { useEffect, useRef } from "react";
import { appActivity, useAppActivity } from "@/lib/appActivity";
import type { PortalTheme } from "@/lib/portalStore";

const STAR_FPS = 12;
const STARS_PER_PIXEL = 1 / 4500;

/** Faint twinkling star specks for the Stargate theme. */
function Stars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { still } = useAppActivity();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let stars: { x: number; y: number; r: number; phase: number; speed: number }[] = [];
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      const count = Math.round(window.innerWidth * window.innerHeight * STARS_PER_PIXEL);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (0.5 + Math.random() * 1.2) * dpr,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
      }));
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const star of stars) {
        const twinkle = still ? 0.6 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 1000 * star.speed + star.phase));
        ctx.fillStyle = `rgb(224 242 254 / ${0.95 * twinkle})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    resize();
    draw(0);
    const onResize = () => {
      resize();
      draw(performance.now());
    };
    window.addEventListener("resize", onResize);
    if (still) return () => window.removeEventListener("resize", onResize);

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / STAR_FPS) return;
      last = now;
      draw(now);
    };
    // The loop only runs while the window can be seen.
    const run = () => {
      cancelAnimationFrame(frame);
      if (appActivity.getState().visible) frame = requestAnimationFrame(tick);
    };
    run();
    const unsubscribe = appActivity.subscribe(run);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [still]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/**
 * Full-screen themed backdrop for the Portal tab. The theme's colours come
 * from the `portal-theme-*` class on an ancestor (see index.css). Sits behind
 * the page (the parent must create a stacking context) and never takes
 * pointer events.
 */
export default function PortalBackdrop({ theme }: { theme: PortalTheme }) {
  return (
    <div aria-hidden="true" className="portal-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="portal-backdrop-glow" />
      {theme === "stargate" && <Stars />}
    </div>
  );
}
