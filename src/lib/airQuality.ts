import { distanceKm, type ForecastPeriod, type HourlyForecast } from "@/hooks/useWeather";

/**
 * Air Quality Health Index and UV index for The Atmosphere: risk bands and
 * advice from Environment Canada's published scales, the nearest AQHI
 * station to a city, and the peak of its hourly forecast.
 */

export type RiskLevel = "low" | "moderate" | "high" | "very-high" | "extreme";

export interface Risk {
  level: RiskLevel;
  label: string;
  advice: string;
}

/** Farthest an AQHI station can be from the city and still stand for it. */
export const AQHI_MAX_KM = 75;
/** Hours of AQHI forecast to look through for the peak. */
export const AQHI_FORECAST_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** The AQHI as Environment Canada shows it: a whole number, "10+" above 10. */
export function formatAqhi(value: number): string {
  const rounded = Math.max(1, Math.round(value));
  return rounded > 10 ? "10+" : String(rounded);
}

/** The AQHI risk band (1–3 low, 4–6 moderate, 7–10 high, above 10 very high). */
export function aqhiRisk(value: number): Risk {
  const v = Math.max(1, Math.round(value));
  if (v <= 3) return { level: "low", label: "Low risk", advice: "Ideal air for outdoor activities." };
  if (v <= 6) {
    return {
      level: "moderate",
      label: "Moderate risk",
      advice: "No need to change outdoor plans unless you notice coughing or throat irritation.",
    };
  }
  if (v <= 10) {
    return {
      level: "high",
      label: "High risk",
      advice: "Consider cutting back strenuous outdoor activity if you notice symptoms.",
    };
  }
  return {
    level: "very-high",
    label: "Very high risk",
    advice: "Reduce or reschedule strenuous outdoor activity, especially if you notice symptoms.",
  };
}

/** The UV index band (0–2 low, 3–5 moderate, 6–7 high, 8–10 very high, 11+ extreme). */
export function uvRisk(index: number): Risk {
  const v = Math.max(0, Math.round(index));
  if (v <= 2) return { level: "low", label: "Low", advice: "Little sun protection needed." };
  if (v <= 5) return { level: "moderate", label: "Moderate", advice: "Sunscreen and a hat if you're out for long; shade at midday." };
  if (v <= 7) return { level: "high", label: "High", advice: "Cover up, wear sunscreen, and limit time in the sun from 11 to 3." };
  if (v <= 10) return { level: "very-high", label: "Very high", advice: "Extra protection; avoid the sun from 11 to 3." };
  return { level: "extreme", label: "Extreme", advice: "Full protection; avoid the sun from 11 to 3. Unprotected skin burns in minutes." };
}

// ── AQHI stations ──

export interface AqhiObservation {
  stationId: string;
  stationName: string;
  lat: number;
  lon: number;
  aqhi: number;
  observedAt: string;
}

export interface NearestObservation extends AqhiObservation {
  distanceKm: number;
}

/** The observation from the station closest to a point, or null if none is within `maxKm`. */
export function nearestObservation(
  observations: AqhiObservation[],
  lat: number,
  lon: number,
  maxKm = AQHI_MAX_KM,
): NearestObservation | null {
  let best: NearestObservation | null = null;
  for (const obs of observations) {
    const km = distanceKm(lat, lon, obs.lat, obs.lon);
    if (km <= maxKm && (!best || km < best.distanceKm)) best = { ...obs, distanceKm: km };
  }
  return best;
}

/** Reads the GeoJSON features of `aqhi-observations-realtime`, skipping any without a value or point. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseObservations(features: Record<string, any>[]): AqhiObservation[] {
  const out: AqhiObservation[] = [];
  for (const f of features) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof p.aqhi !== "number" || !p.location_id) continue;
    out.push({
      stationId: p.location_id,
      stationName: p.location_name_en ?? p.location_id,
      lat,
      lon,
      aqhi: p.aqhi,
      observedAt: p.observation_datetime ?? "",
    });
  }
  return out;
}

export interface AqhiForecastHour {
  at: string;
  aqhi: number;
}

export interface AqhiPeak {
  aqhi: number;
  at: string;
}

/**
 * The hours of the newest AQHI forecast from `now` (the hour under way
 * included) up to `hours` ahead, in order. Older publications are ignored, so
 * a stale run never mixes with the current one.
 */
export function upcomingForecast(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: Record<string, any>[],
  now: Date,
  hours = AQHI_FORECAST_HOURS,
): AqhiForecastHour[] {
  let newest = "";
  for (const f of features) {
    const pub = f.properties?.publication_datetime ?? "";
    if (pub > newest) newest = pub;
  }
  const from = now.getTime() - HOUR_MS;
  const to = now.getTime() + hours * HOUR_MS;
  return features
    .map((f) => f.properties ?? {})
    .filter((p) => p.publication_datetime === newest && typeof p.aqhi === "number")
    .map((p) => ({ at: p.forecast_datetime as string, aqhi: p.aqhi as number }))
    .filter((h) => {
      const t = Date.parse(h.at);
      return t > from && t <= to;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** The highest forecast hour (the earliest, on a tie), or null for no hours. */
export function forecastPeak(hours: AqhiForecastHour[]): AqhiPeak | null {
  let peak: AqhiPeak | null = null;
  for (const h of hours) {
    if (!peak || h.aqhi > peak.aqhi) peak = { aqhi: h.aqhi, at: h.at };
  }
  return peak;
}

// ── UV ──

export interface UvOutlook {
  /** The forecast's UV index for the next daytime period, e.g. "Today" or "Monday". */
  day: { name: string; index: number } | null;
  /** The hour under way, when the hourly forecast has a UV value for it. */
  now: number | null;
  /** The hourly forecast's highest UV hour on the same day as `day` (or in the next 24 h). */
  peak: { index: number; at: string } | null;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * What the forecast says about UV: the next daytime period's index, the
 * current hour's value and the hour it peaks. Night periods carry no UV, so
 * after dark `day` is tomorrow's.
 */
export function uvOutlook(forecasts: ForecastPeriod[], hourly: HourlyForecast[], now: Date): UvOutlook {
  const period = forecasts.find((f) => f.uvIndex != null);
  const day = period && period.uvIndex != null ? { name: period.name, index: period.uvIndex } : null;

  const nowMs = now.getTime();
  let current: number | null = null;
  let peak: { index: number; at: string } | null = null;
  // The peak is looked for on the day `day` is for: tomorrow once the forecast starts with "Tonight".
  const peakDay = forecasts[0]?.isNight ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : now;

  for (const h of hourly) {
    if (h.uv == null) continue;
    const t = Date.parse(h.timestamp);
    if (t <= nowMs && nowMs < t + HOUR_MS) current = h.uv;
    if (t + HOUR_MS <= nowMs || t > nowMs + 24 * HOUR_MS) continue;
    if (!sameLocalDay(new Date(t), peakDay)) continue;
    if (!peak || h.uv > peak.index) peak = { index: h.uv, at: h.timestamp };
  }
  return { day, now: current, peak };
}
