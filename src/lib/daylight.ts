/**
 * Daylight for The Atmosphere: where now falls between sunrise and sunset,
 * and how the day's length is changing, from the sunrise equation.
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const RAD = Math.PI / 180;

export interface DaylightState {
  /** "day" between sunrise and sunset, "night" otherwise. */
  phase: "day" | "night";
  /** 0–1 through the current day (sunrise to sunset) or night (sunset to sunrise). */
  progress: number;
  /** Milliseconds until the next sunset (by day) or sunrise (by night). */
  remainingMs: number;
}

/**
 * Where `now` falls given the city page's sunrise and sunset. By day the
 * feed gives today's times; after sunset it gives tomorrow's, so the night
 * before a sunrise starts 24 h before that day's sunset. Null for unusable times.
 */
export function daylightState(sunriseIso: string, sunsetIso: string, now: Date): DaylightState | null {
  let rise = Date.parse(sunriseIso);
  let set = Date.parse(sunsetIso);
  if (!Number.isFinite(rise) || !Number.isFinite(set) || set <= rise) return null;
  const t = now.getTime();
  // Stale times from an earlier day: move them forward a day at a time.
  while (t >= set) {
    rise += DAY_MS;
    set += DAY_MS;
  }
  if (t >= rise) {
    return { phase: "day", progress: (t - rise) / (set - rise), remainingMs: set - t };
  }
  const lastSet = set - DAY_MS;
  const nightMs = rise - lastSet;
  return { phase: "night", progress: Math.min(1, Math.max(0, (t - lastSet) / nightMs)), remainingMs: rise - t };
}

/** "3h 12m", "45m" or "under 1m". */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / MINUTE_MS);
  if (totalMin < 1) return "under 1m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Minutes of daylight on the local calendar day of `date` at a point, from
 * the sunrise equation (within a minute or two of published times). 0 in a
 * polar night, 1440 in a midnight sun.
 */
export function dayLengthMinutes(date: Date, lat: number, lon: number): number {
  // Julian day number at noon UTC of the calendar day, then days since J2000.
  const n = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) / DAY_MS + 2440587.5 - 2451545;
  const meanNoon = n - lon / 360;
  const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
  const m = anomaly * RAD;
  const center = 1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m);
  const eclipticLon = ((anomaly + center + 180 + 102.9372) % 360) * RAD;
  const sinDecl = Math.sin(eclipticLon) * Math.sin(23.4397 * RAD);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const phi = lat * RAD;
  const cosHour = (Math.sin(-0.833 * RAD) - Math.sin(phi) * sinDecl) / (Math.cos(phi) * cosDecl);
  if (cosHour >= 1) return 0;
  if (cosHour <= -1) return 24 * 60;
  return (2 * Math.acos(cosHour)) / RAD / 360 * 24 * 60;
}

/** Seconds of daylight gained (positive) or lost since yesterday. */
export function dayLengthChangeSeconds(date: Date, lat: number, lon: number): number {
  const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  return Math.round((dayLengthMinutes(date, lat, lon) - dayLengthMinutes(yesterday, lat, lon)) * 60);
}

/** "2m 41s shorter than yesterday", "1m 5s longer than yesterday", "Same as yesterday". */
export function formatDayLengthChange(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 1) return "Same length as yesterday";
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const amount = m > 0 ? `${m}m ${s}s` : `${s}s`;
  return `${amount} ${seconds > 0 ? "longer" : "shorter"} than yesterday`;
}
