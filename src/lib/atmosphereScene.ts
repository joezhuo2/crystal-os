/**
 * Pure scene logic for The Atmosphere's Living Sky: which part of the day it
 * is, what the current weather looks like, how strong the aurora and stars
 * are, and the shapes (moon, pine ridge) the backdrop and Home box draw.
 * Nothing here touches the DOM, so it is all unit tested.
 */

export type SkyPhase = "dawn" | "day" | "dusk" | "night";

export type Precip = "none" | "rain" | "snow" | "sleet";

export interface SkyWeather {
  /** 0 (clear) to 1 (overcast). */
  cloud: number;
  precip: Precip;
  /** 0 to 1: how much rain or snow falls. 0 when precip is "none". */
  intensity: number;
  fog: boolean;
  lightning: boolean;
}

/** Minutes either side of sunrise and sunset that count as dawn and dusk. */
export const TWILIGHT_MINUTES = 45;

/** Used when the feed has no usable sunrise or sunset. */
const FALLBACK_SUNRISE_HOUR = 6.5;
const FALLBACK_SUNSET_HOUR = 19.5;

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Dawn and dusk run TWILIGHT_MINUTES either side of sunrise and sunset. The
 * feed gives today's times; for another day only the time of day matters, so
 * they are moved onto `now`'s date. Missing or backwards times fall back to
 * 6:30 and 19:30 local.
 */
export function skyPhase(now: Date, sunrise?: string | null, sunset?: string | null): SkyPhase {
  const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const riseT = parseTime(sunrise);
  const setT = parseTime(sunset);
  let rise = riseT === null ? null : minutesOfDay(new Date(riseT));
  let set = setT === null ? null : minutesOfDay(new Date(setT));
  if (rise === null || set === null || set <= rise) {
    rise = FALLBACK_SUNRISE_HOUR * 60;
    set = FALLBACK_SUNSET_HOUR * 60;
  }

  const m = minutesOfDay(now);
  if (Math.abs(m - rise) <= TWILIGHT_MINUTES) return "dawn";
  if (Math.abs(m - set) <= TWILIGHT_MINUTES) return "dusk";
  if (m > rise && m < set) return "day";
  return "night";
}

const CLEAR: SkyWeather = { cloud: 0, precip: "none", intensity: 0, fog: false, lightning: false };

function sky(cloud: number, extra: Partial<SkyWeather> = {}): SkyWeather {
  return { ...CLEAR, cloud, ...extra };
}

/**
 * Environment Canada icon codes (0–29 day, 30–48 night or anytime) to what
 * the sky shows. Unknown codes read as a partly cloudy sky.
 */
export function skyWeather(iconCode: number | null | undefined): SkyWeather {
  switch (iconCode) {
    case 0:
    case 30:
      return sky(0);
    case 1:
    case 31:
      return sky(0.15);
    case 2:
    case 32:
      return sky(0.4);
    case 3:
    case 4:
    case 5:
    case 33:
    case 34:
    case 35:
      return sky(0.65);
    case 10:
      return sky(1);
    case 43: // windy
      return sky(0.3);

    case 28: // drizzle
      return sky(0.9, { precip: "rain", intensity: 0.25 });
    case 6:
    case 36:
      return sky(0.85, { precip: "rain", intensity: 0.4 });
    case 11: // precipitation
      return sky(1, { precip: "rain", intensity: 0.5 });
    case 14: // freezing rain
      return sky(1, { precip: "rain", intensity: 0.6 });
    case 12:
      return sky(1, { precip: "rain", intensity: 0.7 });
    case 27: // hail
      return sky(1, { precip: "rain", intensity: 0.9 });
    case 13:
      return sky(1, { precip: "rain", intensity: 1 });

    case 7:
    case 37:
      return sky(0.9, { precip: "sleet", intensity: 0.45 });
    case 15:
      return sky(1, { precip: "sleet", intensity: 0.7 });

    case 26: // ice crystals
      return sky(0.5, { precip: "snow", intensity: 0.2 });
    case 8:
    case 16:
    case 38:
      return sky(0.9, { precip: "snow", intensity: 0.4 });
    case 17:
      return sky(1, { precip: "snow", intensity: 0.7 });
    case 25: // drifting snow
    case 40: // blowing snow
      return sky(0.8, { precip: "snow", intensity: 0.8 });
    case 18:
      return sky(1, { precip: "snow", intensity: 1 });

    case 9:
    case 19:
    case 39:
    case 41:
    case 42:
    case 46:
    case 47:
    case 48:
      return sky(1, { precip: "rain", intensity: 0.8, lightning: true });

    case 22:
    case 23: // haze
    case 24: // fog
    case 44: // smoke
    case 45: // dust
      return sky(0.5, { fog: true });

    default:
      return sky(0.4);
  }
}

/** The aurora at full strength at night, faint in daylight so turning it on always shows something. */
export function auroraStrength(phase: SkyPhase): number {
  return phase === "night" ? 1 : phase === "day" ? 0.22 : 0.5;
}

/** How bright the stars are: none by day, and cloud hides them. */
export function starVisibility(phase: SkyPhase, cloud = 0): number {
  const base = phase === "night" ? 1 : phase === "day" ? 0 : 0.35;
  return base * (1 - 0.85 * Math.min(1, Math.max(0, cloud)));
}

/**
 * The lit part of the moon as an SVG path in a 100×100 box (centre 50,50,
 * radius 40). `illumination` is 0–100. Waxing moons are lit on the right.
 * The outer edge is a half circle; the terminator is a half ellipse whose
 * width shrinks to nothing at the quarters.
 */
export function moonPath(illumination: number, waxing: boolean): string {
  const k = Math.min(1, Math.max(0, illumination / 100));
  const r = 40;
  const rx = Math.round(r * Math.abs(1 - 2 * k) * 100) / 100;
  const outerSweep = waxing ? 1 : 0;
  const termSweep = k > 0.5 === waxing ? 1 : 0;
  return `M 50 10 A ${r} ${r} 0 0 ${outerSweep} 50 90 A ${rx} ${r} 0 0 ${termSweep} 50 10 Z`;
}

/** Waxing from new moon up to (not including) full, from getMoonPhase's name. */
export function isWaxing(phaseName: string): boolean {
  return phaseName.startsWith("Waxing") || phaseName === "First Quarter";
}

/** Small seeded generator so the treeline is the same on every visit. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A pine-tree ridge as a closed SVG path across a `width`×100 box, filled
 * from the bottom edge. Tree tips reach between y=8 and y=60; the ground line
 * sits near y=78. Same seed, same ridge.
 */
export function pineRidge(seed: number, width = 1000, trees = 70): string {
  const rand = mulberry32(seed);
  const step = width / trees;
  const round = (n: number) => Math.round(n * 10) / 10;
  const parts = [`M 0 100 L 0 ${78}`];
  for (let i = 0; i < trees; i++) {
    const x = i * step + rand() * step * 0.4;
    const tip = 8 + rand() * 52;
    const half = step * (0.45 + rand() * 0.35);
    const base = 76 + rand() * 4;
    // Two tiers of branches on the way up and down give the pine its shape.
    const t1 = tip + (base - tip) * 0.4;
    const t2 = tip + (base - tip) * 0.72;
    parts.push(
      `L ${round(x - half)} ${round(base)}`,
      `L ${round(x - half * 0.55)} ${round(t2)}`,
      `L ${round(x - half * 0.7)} ${round(t2)}`,
      `L ${round(x - half * 0.3)} ${round(t1)}`,
      `L ${round(x - half * 0.45)} ${round(t1)}`,
      `L ${round(x)} ${round(tip)}`,
      `L ${round(x + half * 0.45)} ${round(t1)}`,
      `L ${round(x + half * 0.3)} ${round(t1)}`,
      `L ${round(x + half * 0.7)} ${round(t2)}`,
      `L ${round(x + half * 0.55)} ${round(t2)}`,
      `L ${round(x + half)} ${round(base)}`,
    );
  }
  parts.push(`L ${width} 78`, `L ${width} 100`, "Z");
  return parts.join(" ");
}
