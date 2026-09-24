import { useEffect, useRef, useState } from "react";
import {
  CRYSTALS,
  CRYSTAL_SHAPES,
  clipPolygon,
  crystalLight,
  makeSparkles,
  svgPoints,
  type Sparkle,
} from "@/lib/obsidianScene";

const BACK_SPARKLES = 80;

function sparkleStyle(s: Sparkle): React.CSSProperties {
  return {
    left: `${s.x}%`,
    top: `${s.y}%`,
    width: s.size,
    height: s.size,
    opacity: s.peak,
    "--twinkle-duration": `${s.duration}s`,
    "--twinkle-delay": `${s.delay}s`,
  } as React.CSSProperties;
}

/**
 * Full-screen amethyst backdrop for The Archive: sharp glass crystals growing
 * in from the corners and edges, twinkling sparkles, and a light that follows
 * the cursor and catches on the crystals.
 *
 * The cursor never touches React state. A pointer listener schedules one
 * animation frame, which reads every crystal's position first and then writes
 * `--obsidian-mx/--obsidian-my` on this element and `--lit/--lx/--ly` on each
 * crystal; the CSS in index.css turns those into transforms and opacity. Sits
 * behind the page (the parent must create a stacking context) and never takes
 * pointer events.
 */
export default function ObsidianBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);
  // Random once per visit; later renders reuse them.
  const [sparkles] = useState(() => ({
    back: makeSparkles(BACK_SPARKLES, Math.random, [10, 22]),
    // One near each crystal's tip, so it sits on top of the glass. Larger
    // than the background ones so the rays read as a glint, not a dot.
    front: CRYSTALS.map(
      () => makeSparkles(1, Math.random, [24, 40], { x: [35, 65], y: [4, 30] })[0],
    ),
  }));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const crystals = Array.from(root.querySelectorAll<HTMLElement>("[data-crystal]"));
    const lastLit = new Array<number>(crystals.length).fill(0);
    let sizes: { width: number; height: number }[] = [];
    let x = -9999;
    let y = -9999;
    let away = true;
    let frame = 0;

    // Layout size ignores transforms, so it stays put while crystals tilt and float.
    const measureSizes = () => {
      sizes = crystals.map((el) => ({ width: el.offsetWidth, height: el.offsetHeight }));
    };

    const apply = () => {
      frame = 0;
      // Read everything before writing anything, so no read forces a style flush.
      const lights = crystals.map((el, i) => {
        const rect = el.getBoundingClientRect();
        return crystalLight(
          {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            width: sizes[i].width,
            height: sizes[i].height,
            angle: CRYSTALS[i].angle,
          },
          x,
          y,
        );
      });

      root.style.setProperty("--obsidian-mx", `${x}px`);
      root.style.setProperty("--obsidian-my", `${y}px`);
      root.dataset.cursor = away ? "away" : "on";
      lights.forEach((light, i) => {
        // Unlit and staying unlit: skip the style write entirely.
        if (light.lit === 0 && lastLit[i] === 0) return;
        const el = crystals[i];
        el.style.setProperty("--lit", String(light.lit));
        el.style.setProperty("--lx", `${light.x}px`);
        el.style.setProperty("--ly", `${light.y}px`);
        el.toggleAttribute("data-lit", light.lit > 0);
        lastLit[i] = light.lit;
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      away = false;
      schedule();
    };

    const onAway = () => {
      x = -9999;
      y = -9999;
      away = true;
      schedule();
    };

    // relatedTarget is null only when the pointer leaves the window itself.
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) onAway();
    };

    const onResize = () => {
      measureSizes();
      schedule();
    };

    measureSizes();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("blur", onAway);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onAway);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-cursor="away"
      className="obsidian-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden"
    >
      <div className="obsidian-haze" />

      {sparkles.back.map((s, i) => (
        <span key={i} className="obsidian-sparkle" style={sparkleStyle(s)} />
      ))}

      {CRYSTALS.map((c, i) => {
        const shape = CRYSTAL_SHAPES[c.shape];
        const clip = clipPolygon(shape.outline);
        const points = svgPoints(shape.outline);
        return (
          <div
            key={i}
            data-crystal
            data-still={i % 3 === 2 ? "" : undefined}
            className="obsidian-crystal"
            style={
              {
                left: `calc(${c.x}% + ${c.ox}vmin)`,
                top: `calc(${c.y}% + ${c.oy}vmin)`,
                width: `${c.w}vmin`,
                height: `${c.h}vmin`,
                rotate: `${c.angle}deg`,
                "--o": c.opacity,
                "--float-duration": `${c.float}s`,
                "--float-delay": `${c.delay}s`,
                "--emerge-delay": `${c.emerge}ms`,
              } as React.CSSProperties
            }
          >
            <div className="obsidian-crystal-halo" />
            <div className="obsidian-crystal-glass" style={{ clipPath: clip }} />
            <div className="obsidian-crystal-reflect" style={{ clipPath: clip }}>
              <div className="obsidian-crystal-glint" />
            </div>
            <svg className="obsidian-crystal-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points={points} vectorEffect="non-scaling-stroke" />
              <path d={shape.facets} vectorEffect="non-scaling-stroke" />
            </svg>
            <svg
              className="obsidian-crystal-edges obsidian-crystal-edges-lit"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon points={points} vectorEffect="non-scaling-stroke" />
              <path d={shape.facets} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="obsidian-sparkle" style={sparkleStyle(sparkles.front[i])} />
          </div>
        );
      })}

      <div className="obsidian-aura-track">
        <div className="obsidian-aura" />
      </div>
    </div>
  );
}
