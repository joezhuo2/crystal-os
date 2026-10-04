import { useEffect, useRef } from "react";
import { appActivity } from "@/lib/appActivity";
import { useBackdropStill } from "@/lib/backdropSlot";
import { startFrameLoop } from "@/lib/frameLoop";

const STAR_FPS = 12;
const STARS_PER_PIXEL = 1 / 4500;

/**
 * Full-screen twinkling star specks, used by the Portal's Stargate theme and
 * the Atmosphere's night sky. `rgb` is a space-separated colour ("224 242
 * 254"); `opacity` scales every star. Runs at 12 fps only while the window
 * can be seen, and draws one still frame in reduced motion.
 */
export default function StarCanvas({ rgb, opacity = 0.95, className = "" }: { rgb: string; opacity?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const still = useBackdropStill();

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
        ctx.fillStyle = `rgb(${rgb} / ${opacity * twinkle})`;
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

    let stopLoop: () => void = () => undefined;
    // The loop only runs while the window can be seen.
    const run = () => {
      stopLoop();
      if (appActivity.getState().visible) stopLoop = startFrameLoop(STAR_FPS, draw);
    };
    run();
    const unsubscribe = appActivity.subscribe(run);
    return () => {
      unsubscribe();
      stopLoop();
      window.removeEventListener("resize", onResize);
    };
  }, [still, rgb, opacity]);

  return <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full ${className}`} />;
}
