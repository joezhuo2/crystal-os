import type { HourlyForecast, WeatherData } from "@/hooks/useWeather";

/**
 * One short, actionable line for the Pulse weather box, drawn from the
 * Environment Canada hourly forecast: "Rain from 4 PM, take an umbrella",
 * "−22 °C windchill tomorrow morning". Times are in the device's time zone.
 */

/** Hours ahead to look for rain or snow starting or stopping. */
export const PRECIP_HOURS = 12;
/** Hours ahead to look for bitter cold or heat (the whole hourly forecast). */
export const TEMP_HOURS = 24;
/** Windchill (or temperature) at or below this gets a nudge. */
export const COLD_LIMIT = -20;
/** Temperature at or above this gets a nudge. */
export const HEAT_LIMIT = 30;
/** Below this chance of precipitation, a "Chance of …" hour counts as dry. */
export const LOP_LIMIT = 40;

export type PrecipKind = "thunder" | "freezing" | "snow" | "rain";

const HOUR_MS = 60 * 60 * 1000;

/** What falls in an hour described by `condition`, if anything. */
export function precipKind(condition: string): PrecipKind | null {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return "thunder";
  if (c.includes("freezing")) return "freezing";
  if (c.includes("snow") || c.includes("flurr") || c.includes("ice pellet")) return "snow";
  if (c.includes("rain") || c.includes("shower") || c.includes("drizzle")) return "rain";
  return null;
}

/** The kind of precipitation expected in `h`, or null when it is likely dry. */
function wetHour(h: HourlyForecast): PrecipKind | null {
  const kind = precipKind(h.condition);
  if (!kind) return null;
  // "Chance of showers" at 30% is not worth an umbrella; plain "Rain" is.
  if (/chance/i.test(h.condition) && h.lop < LOP_LIMIT) return null;
  return kind;
}

/** "4 PM" */
function clock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 0 for today, 1 for tomorrow, by the device's calendar. */
function dayOffset(d: Date, now: Date): number {
  return Math.round((startOfDay(d) - startOfDay(now)) / (24 * HOUR_MS));
}

/** "4 PM" today, "4 AM tomorrow" after midnight. */
function at(d: Date, now: Date): string {
  return dayOffset(d, now) === 0 ? clock(d) : `${clock(d)} tomorrow`;
}

/** "tonight", "this afternoon", "tomorrow morning". The small hours count as tonight. */
function partOfDay(d: Date, now: Date): string {
  const h = d.getHours();
  const offset = dayOffset(d, now);
  if (h < 5 && offset === 1) return "tonight";
  if (h >= 21 || h < 5) return offset === 0 ? "tonight" : "tomorrow night";
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return offset === 0 ? `this ${part}` : `tomorrow ${part}`;
}

/** Unicode minus, as in "−20 °C". */
function degrees(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "−" : ""}${Math.abs(r)} °C`;
}

const PRECIP_NAME: Record<PrecipKind, string> = {
  thunder: "Thunderstorms",
  freezing: "Freezing rain",
  snow: "Snow",
  rain: "Rain",
};

const PRECIP_TIP: Record<PrecipKind, string> = {
  thunder: "take an umbrella",
  freezing: "roads may be icy",
  snow: "wear boots",
  rain: "take an umbrella",
};

interface Hour {
  at: Date;
  h: HourlyForecast;
}

/** Rain or snow starting, or stopping, in the next few hours. */
function precipNudge(hours: Hour[], now: Date): { kind: PrecipKind; text: string } | null {
  const soon = hours.filter((x) => x.at.getTime() < now.getTime() + PRECIP_HOURS * HOUR_MS);
  if (soon.length === 0) return null;
  const nowKind = wetHour(soon[0].h);
  if (nowKind) {
    const dry = soon.find((x) => !wetHour(x.h));
    const name = PRECIP_NAME[nowKind];
    return dry
      ? { kind: nowKind, text: `${name} until ${at(dry.at, now)}` }
      : { kind: nowKind, text: `${name} for the next ${PRECIP_HOURS} h, ${PRECIP_TIP[nowKind]}` };
  }
  for (const x of soon) {
    const kind = wetHour(x.h);
    if (kind) return { kind, text: `${PRECIP_NAME[kind]} from ${at(x.at, now)}, ${PRECIP_TIP[kind]}` };
  }
  return null;
}

/** The coldest windchill (or temperature) at or below the cold limit. */
function coldNudge(hours: Hour[], now: Date): string | null {
  let coldest: { at: Date; value: number; chill: boolean } | null = null;
  for (const x of hours) {
    const chill = x.h.windChill !== null;
    const value = x.h.windChill ?? x.h.temperature;
    if (value <= COLD_LIMIT && (!coldest || value < coldest.value)) coldest = { at: x.at, value, chill };
  }
  if (!coldest) return null;
  const when = coldest.at.getTime() <= now.getTime() ? "now" : partOfDay(coldest.at, now);
  return coldest.chill
    ? `${degrees(coldest.value)} windchill ${when}`
    : `${degrees(coldest.value)} ${when}, bundle up`;
}

/** The hottest hour at or above the heat limit. */
function heatNudge(hours: Hour[], now: Date): string | null {
  let hottest: Hour | null = null;
  for (const x of hours) {
    if (x.h.temperature >= HEAT_LIMIT && (!hottest || x.h.temperature > hottest.h.temperature)) hottest = x;
  }
  if (!hottest) return null;
  const when = hottest.at.getTime() <= now.getTime() ? "now" : partOfDay(hottest.at, now);
  return `Up to ${degrees(hottest.h.temperature)} ${when}, drink water`;
}

/**
 * The most useful nudge for the hours ahead, or null when there is nothing
 * worth saying. Thunderstorms and freezing rain come first, then bitter
 * cold, then ordinary rain or snow, then heat.
 */
export function weatherNudge(data: Pick<WeatherData, "hourly"> | null | undefined, now: Date = new Date()): string | null {
  if (!data?.hourly?.length) return null;
  const hours: Hour[] = data.hourly
    .map((h) => ({ at: new Date(h.timestamp), h }))
    .filter((x) => !Number.isNaN(x.at.getTime()))
    // Keep the hour under way now; drop the ones already over.
    .filter((x) => x.at.getTime() + HOUR_MS > now.getTime() && x.at.getTime() < now.getTime() + TEMP_HOURS * HOUR_MS)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (hours.length === 0) return null;

  const precip = precipNudge(hours, now);
  if (precip && (precip.kind === "thunder" || precip.kind === "freezing")) return precip.text;
  return coldNudge(hours, now) ?? precip?.text ?? heatNudge(hours, now);
}
