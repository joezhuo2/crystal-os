import { useEffect, useRef } from "react";
import { appActivity } from "@/lib/appActivity";
import { useBackdropStill } from "@/lib/backdropSlot";
import { onBackdropFpsChange, startFrameLoop } from "@/lib/frameLoop";
import { backdropFps } from "@/lib/perfSettings";

const FPS = 20;
const PIXEL = 4;
const MAX_DPR = 1.5;

/**
 * Full-screen black backdrop for the Terminal tab: white pixels flash in at
 * random spots and fade out, with the odd short burst. Sits behind the page
 * (the parent must create a stacking context) and never takes pointer events.
 */
export default function TerminalStatic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const still = useBackdropStill();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (still) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let frames = 1;
    const tick = () => {
      // Fade what was drawn before, so each pixel flashes then dies away.
      ctx.fillStyle = "#000";
      ctx.globalAlpha = 1 - 0.65 ** frames;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const size = PIXEL * Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const burst = Math.random() < 1 - 0.94 ** frames;
      const count = burst ? 120 + Math.random() * 120 : (10 + Math.floor(Math.random() * 20)) * frames;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < count; i++) {
        ctx.globalAlpha = 0.4 + Math.random() * 0.6;
        ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, size, size);
      }
      ctx.globalAlpha = 1;
    };
    // The loop only runs while the window can be seen.
    let stopLoop: () => void = () => undefined;
    const run = () => {
      stopLoop();
      const fps = backdropFps(FPS);
      frames = FPS / fps;
      if (appActivity.getState().visible) stopLoop = startFrameLoop(fps, tick);
    };
    run();
    const unsubscribe = appActivity.subscribe(run);
    const unsubscribeFps = onBackdropFpsChange(FPS, run);

    return () => {
      unsubscribe();
      unsubscribeFps();
      stopLoop();
      window.removeEventListener("resize", resize);
    };
  }, [still]);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 h-full w-full pointer-events-none bg-black" />;
}
