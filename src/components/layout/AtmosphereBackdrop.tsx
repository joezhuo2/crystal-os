import { useEffect, useRef } from "react";
import StarCanvas from "@/components/layout/StarCanvas";
import { useSkyScene } from "@/hooks/useSkyScene";
import { appActivity, useAppActivity } from "@/lib/appActivity";
import { useAtmosphere } from "@/lib/atmosphereStore";
import { auroraStrength, moonPath, pineRidge, starVisibility, type SkyWeather } from "@/lib/atmosphereScene";

const PRECIP_FPS = 30;
/** Horizontal drift of a raindrop per pixel it falls. */
const RAIN_SLANT = 0.18;

const RIDGE_BACK = pineRidge(11, 1000, 52);
const RIDGE_FRONT = pineRidge(4, 1000, 70);

/** A wavy aurora curtain in a 1000×300 box: a bright lower hem with rays rising above it. */
function curtainPath(seed: number): string {
  const steps = 40;
  const bottom: [number, number][] = [];
  const top: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 1000;
    const y = 225 + 38 * Math.sin(x / 150 + seed) + 16 * Math.sin(x / 57 + seed * 2.3);
    bottom.push([x, y]);
    top.push([x, y - 150 - 45 * Math.sin(x / 110 + seed * 1.7)]);
  }
  const pts = [...bottom, ...top.reverse()].map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`);
  return `M ${pts.join(" L ")} Z`;
}

type Hue = [top: string, mid: string, hem: string];

const RIBBONS: { top: string; height: string; bend: number; sway: number; delay: number; opacity: number; hue: Hue; seed: number }[] = [
  { top: "6%", height: "58vh", bend: 2.4, sway: 34, delay: 0, opacity: 0.95, hue: ["#0d9488", "#10b981", "#a7f3d0"], seed: 0.4 },
  { top: "0%", height: "50vh", bend: 1.6, sway: 42, delay: -14, opacity: 0.7, hue: ["#0891b2", "#2dd4bf", "#99f6e4"], seed: 2.1 },
  { top: "-6%", height: "46vh", bend: 1, sway: 51, delay: -27, opacity: 0.55, hue: ["#6d28d9", "#c084fc", "#f5d0fe"], seed: 4.6 },
];
const CURTAINS = RIBBONS.map((r) => curtainPath(r.seed));

/**
 * Rain, snow, and lightning for the current weather, on one canvas at 30 fps.
 * A strike flashes the sky, draws a bolt, and sets `data-flash` on the
 * backdrop so the aurora and clouds light up with it. Pauses while nobody can
 * see the window; reduced motion draws one still frame and no lightning.
 */
function PrecipCanvas({ weather, rootRef }: { weather: SkyWeather; rootRef: React.RefObject<HTMLDivElement> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { still } = useAppActivity();
  const { precip, intensity, lightning } = weather;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    type Drop = { snow: boolean; x: number; y: number; len: number; speed: number; sway: number; phase: number };
    let drops: Drop[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;

    const spawn = (snow: boolean, y: number): Drop =>
      snow
        ? {
            snow,
            x: Math.random() * w,
            y,
            len: (0.8 + Math.random() * 2) * dpr,
            speed: (25 + Math.random() * 55) * dpr,
            sway: (10 + Math.random() * 25) * dpr,
            phase: Math.random() * Math.PI * 2,
          }
        : {
            snow,
            // Drops drift right as they fall, so some start left of the screen.
            x: Math.random() * (w + h * RAIN_SLANT) - h * RAIN_SLANT,
            y,
            len: (10 + Math.random() * 16) * dpr,
            speed: (900 + Math.random() * 500) * dpr,
            sway: 0,
            phase: 0,
          };

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      w = canvas.width = Math.floor(window.innerWidth * dpr);
      h = canvas.height = Math.floor(window.innerHeight * dpr);
      const area = window.innerWidth * window.innerHeight;
      const rainShare = precip === "rain" ? 1 : precip === "sleet" ? 0.5 : 0;
      const snowShare = precip === "snow" ? 1 : precip === "sleet" ? 0.5 : 0;
      const rain = Math.round((area / 4200) * intensity * rainShare);
      const snow = Math.round((area / 7000) * intensity * snowShare);
      drops = [
        ...Array.from({ length: rain }, () => spawn(false, Math.random() * h)),
        ...Array.from({ length: snow }, () => spawn(true, Math.random() * h)),
      ];
    };

    let flash = 0;
    let bolt: [number, number][] | null = null;
    let nextStrike = performance.now() + 2500 + Math.random() * 6000;
    let flicker = 0;

    const setFlash = (on: boolean) => {
      const root = rootRef.current;
      if (!root) return;
      if (on) root.dataset.flash = "";
      else delete root.dataset.flash;
    };

    const strike = (now: number) => {
      flash = 1;
      flicker = now + 110 + Math.random() * 90;
      nextStrike = now + 5000 + Math.random() * 9000;
      const end = h * (0.3 + Math.random() * 0.25);
      let x = w * (0.15 + Math.random() * 0.7);
      let y = 0;
      bolt = [[x, y]];
      while (y < end) {
        y += (18 + Math.random() * 30) * dpr;
        x += (Math.random() - 0.5) * 44 * dpr;
        bolt.push([x, y]);
      }
      setFlash(true);
    };

    const step = (dt: number) => {
      for (const d of drops) {
        d.y += d.speed * dt;
        if (d.snow) d.phase += dt * 0.8;
        else d.x += d.speed * dt * RAIN_SLANT;
        if (d.y - d.len > h) Object.assign(d, spawn(d.snow, -d.len - Math.random() * h * 0.2));
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      if (flash > 0) {
        ctx.fillStyle = `rgb(200 215 255 / ${flash * 0.22})`;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.strokeStyle = "rgb(190 215 255 / 0.32)";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (const d of drops) {
        if (d.snow) continue;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * RAIN_SLANT, d.y - d.len);
      }
      ctx.stroke();

      ctx.fillStyle = "rgb(240 248 255 / 0.8)";
      ctx.beginPath();
      for (const d of drops) {
        if (!d.snow) continue;
        const x = d.x + Math.sin(d.phase) * d.sway;
        ctx.moveTo(x + d.len, d.y);
        ctx.arc(x, d.y, d.len, 0, Math.PI * 2);
      }
      ctx.fill();

      if (bolt && flash > 0.05) {
        ctx.save();
        ctx.strokeStyle = `rgb(235 240 255 / ${flash})`;
        ctx.lineWidth = 2 * dpr;
        ctx.shadowColor = "rgb(165 180 252)";
        ctx.shadowBlur = 18 * dpr;
        ctx.beginPath();
        bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.restore();
      }
    };

    resize();
    draw();
    const onResize = () => {
      resize();
      draw();
    };
    window.addEventListener("resize", onResize);
    if (still) return () => window.removeEventListener("resize", onResize);

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / PRECIP_FPS) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;

      if (lightning) {
        if (now >= nextStrike) strike(now);
        // A second, weaker flicker right after the first flash.
        if (flicker && now >= flicker) {
          flash = Math.max(flash, 0.75);
          flicker = 0;
        }
        if (flash > 0) {
          flash *= Math.exp(-dt * 6);
          if (flash < 0.03 && !flicker) {
            flash = 0;
            bolt = null;
            setFlash(false);
          }
        }
      }
      step(dt);
      draw();
    };
    const run = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (appActivity.getState().visible) frame = requestAnimationFrame(tick);
    };
    run();
    const unsubscribe = appActivity.subscribe(run);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      setFlash(false);
    };
  }, [still, precip, intensity, lightning, rootRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/**
 * Aurora ribbons that sway on their own and bend toward the cursor. The
 * cursor never touches React state: a pointer listener schedules one frame
 * that writes `--bend-x` (-1 to 1) on the field, and the CSS turns it into a
 * transform on each ribbon.
 */
function Aurora() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const { still } = useAppActivity();

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || still) return;
    let frame = 0;
    let bend = 0;
    const apply = () => {
      frame = 0;
      field.style.setProperty("--bend-x", bend.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      bend = (e.clientX / window.innerWidth) * 2 - 1;
      schedule();
    };
    const onAway = () => {
      bend = 0;
      schedule();
    };
    // relatedTarget is null only when the pointer leaves the window itself.
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) onAway();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("blur", onAway);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onAway);
      field.style.removeProperty("--bend-x");
    };
  }, [still]);

  return (
    <div ref={fieldRef} className="atmo-aurora-field">
      {RIBBONS.map((r, i) => (
        <div
          key={i}
          className="atmo-ribbon-track"
          style={{ top: r.top, height: r.height, "--bend": r.bend } as React.CSSProperties}
        >
          <div
            className="atmo-ribbon"
            style={{ opacity: r.opacity, "--sway": `${r.sway}s`, "--sway-delay": `${r.delay}s` } as React.CSSProperties}
          >
            <svg viewBox="0 0 1000 300" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`atmo-aurora-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={r.hue[0]} stopOpacity="0" />
                  <stop offset="0.5" stopColor={r.hue[0]} stopOpacity="0.35" />
                  <stop offset="0.85" stopColor={r.hue[1]} stopOpacity="0.85" />
                  <stop offset="1" stopColor={r.hue[2]} stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <path d={CURTAINS[i]} fill={`url(#atmo-aurora-${i})`} />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Full-screen Living Sky for The Atmosphere. The base is always on: a sky for
 * the time of day (from the city's sunrise and sunset), the sun or the moon in
 * its current phase, and stars at night. With a custom background image set,
 * its pre-blurred copy (atmosphereStore bakes it) sits at the bottom and the
 * sky becomes a light tint over it; everything else draws on top. Two layers switch on in Settings:
 *
 * - Weather effects: clouds, overcast, fog, rain, snow and lightning from the
 *   current conditions.
 * - Aurora: ribbons (behind the clouds) over a pine treeline, full strength at
 *   night and faint by day.
 *
 * Colours for each phase live in index.css under `[data-phase]`. Sits behind
 * the page (the parent must create a stacking context) and never takes
 * pointer events.
 */
export default function AtmosphereBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { weatherEffects, aurora, backdropUrl } = useAtmosphere();
  const { phase, weather, moon } = useSkyScene();
  const cloud = weatherEffects ? weather.cloud : 0;
  const stars = starVisibility(phase, cloud);
  const precipitating = weatherEffects && (weather.precip !== "none" || weather.lightning);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-phase={phase}
      data-image={backdropUrl ? "" : undefined}
      className="atmo-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden"
      style={{ "--cloud": cloud, "--aurora": auroraStrength(phase) } as React.CSSProperties}
    >
      {backdropUrl && <div className="atmo-image" style={{ backgroundImage: `url("${backdropUrl}")` }} />}
      <div className="atmo-sky atmo-sky-night" />
      <div className="atmo-sky atmo-sky-dawn" />
      <div className="atmo-sky atmo-sky-day" />
      <div className="atmo-sky atmo-sky-dusk" />
      <div className="atmo-sun" />
      <svg className="atmo-moon" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" className="atmo-moon-dark" />
        <path d={moonPath(moon.illumination, moon.waxing)} className="atmo-moon-lit" />
      </svg>
      {stars > 0 && <StarCanvas rgb="226 232 255" opacity={0.9 * stars} />}

      {aurora && <Aurora />}

      {cloud > 0 && (
        <>
          <div className="atmo-overcast" />
          <div className="atmo-clouds">
            <div className="atmo-cloud-band atmo-cloud-band-high" />
            <div className="atmo-cloud-band atmo-cloud-band-low" />
          </div>
        </>
      )}

      {aurora && (
        <>
          <svg className="atmo-ridge atmo-ridge-back" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path d={RIDGE_BACK} />
          </svg>
          <svg className="atmo-ridge atmo-ridge-front" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path d={RIDGE_FRONT} />
          </svg>
        </>
      )}

      {weatherEffects && weather.fog && <div className="atmo-fog" />}
      {precipitating && <PrecipCanvas weather={weather} rootRef={rootRef} />}
    </div>
  );
}
