import { useEffect, useRef } from "react";
import { appActivity, useAppActivity } from "@/lib/appActivity";

const FPS = 20;
const PIXEL = 4;

/**
 * Full-screen black backdrop for the Terminal tab: white pixels flash in at
 * random spots and fade out, with the odd short burst. Sits behind the page
 * (the parent must create a stacking context) and never takes pointer events.
 */
export default function TerminalStatic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { still } = useAppActivity();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (still) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / FPS) return;
      last = now;

      // Fade what was drawn before, so each pixel flashes then dies away.
      ctx.fillStyle = "rgb(0 0 0 / 0.35)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const size = PIXEL * (window.devicePixelRatio || 1);
      const burst = Math.random() < 0.06;
      const count = burst ? 120 + Math.random() * 120 : 10 + Math.floor(Math.random() * 20);
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = `rgb(255 255 255 / ${0.4 + Math.random() * 0.6})`;
        ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, size, size);
      }
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
      window.removeEventListener("resize", resize);
    };
  }, [still]);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 h-full w-full pointer-events-none bg-black" />;
}
