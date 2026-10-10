import { useQuery } from "@tanstack/react-query";

const API_BASE = "https://api.weather.gc.ca/collections/citypageweather-realtime/items";

export interface CityOption {
  id: string;
  name: string;
  /** Forecast region, e.g. "City of Toronto"; only on cities from the full list. */
  region?: string;
  /** Where the forecast is for; only on cities from the full list. */
  lat?: number;
  lon?: number;
}

/** Location ids are a province or territory code and a number, e.g. "on-85". */
const CITY_ID = /^(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt)-\d+$/;

export function isCityId(id: unknown): id is string {
  return typeof id === "string" && CITY_ID.test(id);
}

/** Suggested before anything is searched; any of the ~840 locations can be picked. */
export const AVAILABLE_CITIES: CityOption[] = [
  { id: "on-85", name: "Markham" },
  { id: "on-143", name: "Toronto" },
  { id: "on-64", name: "Vaughan" },
  { id: "on-59", name: "Richmond Hill" },
  { id: "on-82", name: "Mississauga" },
  { id: "on-24", name: "Brampton" },
  { id: "on-100", name: "Ottawa (Kanata - Orléans)" },
  { id: "on-118", name: "Hamilton" },
  { id: "on-48", name: "London" },
];

/**
 * The suggestions with ids taken from the live list by name, since a
 * hard-coded id can point at another place (on-82 is not Mississauga). A name
 * the list lacks keeps its id but takes the list's name for it, so a row never
 * shows one city and picks another.
 */
export function resolveSuggestions(cities: CityOption[] | undefined): CityOption[] {
  if (!cities) return AVAILABLE_CITIES;
  return AVAILABLE_CITIES.map(
    (s) =>
      cities.find((c) => c.name === s.name && c.id.startsWith("on-")) ??
      cities.find((c) => c.id === s.id) ??
      s,
  );
}

export interface CurrentConditions {
  temperature: number;
  condition: string;
  iconCode: number;
  windSpeed: number;
  windGust: number | null;
  windDirection: string;
  humidity: number;
  pressure: number;
  dewpoint: number;
  windChill: number | null;
}

export interface ForecastPeriod {
  name: string;
  isNight: boolean;
  high: number | null;
  low: number | null;
  temperature: number;
  tempClass: "high" | "low";
  summary: string;
  iconCode: number;
  iconUrl: string;
  windSummary: string;
  windChill: string | null;
  humidity: number;
  precipitation: string | null;
  uv: string | null;
  /** The period's UV index; only daytime periods have one. */
  uvIndex: number | null;
}

export interface DayForecast {
  dayName: string;
  high: number | null;
  low: number | null;
  dayCondition: string;
  nightCondition: string;
  dayIcon: number;
  nightIcon: number;
  dayWindSummary: string;
  dayPrecipitation: string | null;
  nightPrecipitation: string | null;
  dayHumidity: number;
  dayUv: string | null;
  dayWindChill: string | null;
  nightWindChill: string | null;
}

export interface HourlyForecast {
  timestamp: string;
  temperature: number;
  condition: string;
  iconCode: number;
  windChill: number | null;
  windSpeed: number;
  windDirection: string;
  lop: number;
  uv?: number | null;
}

export interface SunTimes {
  sunrise: string;
  sunset: string;
}

export interface WeatherData {
  cityName: string;
  cityId: string;
  /** Where the forecast is for, or null if the feed has no point. */
  lat: number | null;
  lon: number | null;
  current: CurrentConditions;
  forecasts: ForecastPeriod[];
  dailyForecasts: DayForecast[];
  hourly: HourlyForecast[];
  sunTimes: SunTimes;
  regionalNormals: { high: number; low: number };
  warnings: Record<string, unknown>[];
  lastUpdated: string;
}

// ── Moon phase calculation ──

export function getMoonPhase(date: Date = new Date()): {
  phase: string;
  illumination: number;
  emoji: string;
} {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Conway's algorithm for moon phase approximation
  let r = year % 100;
  r %= 19;
  if (r > 9) r -= 19;
  r = ((r * 11) % 30) + month + day;
  if (month < 3) r += 2;
  r -= year < 2000 ? 4 : 8.3;
  r = Math.floor(r + 0.5) % 30;
  if (r < 0) r += 30;

  const illumination = r <= 15 ? (r / 15) * 100 : ((30 - r) / 15) * 100;

  let phase: string;
  let emoji: string;
  if (r === 0) { phase = "New Moon"; emoji = "🌑"; }
  else if (r < 7) { phase = "Waxing Crescent"; emoji = "🌒"; }
  else if (r === 7) { phase = "First Quarter"; emoji = "🌓"; }
  else if (r < 15) { phase = "Waxing Gibbous"; emoji = "🌔"; }
  else if (r === 15) { phase = "Full Moon"; emoji = "🌕"; }
  else if (r < 22) { phase = "Waning Gibbous"; emoji = "🌖"; }
  else if (r === 22) { phase = "Last Quarter"; emoji = "🌗"; }
  else { phase = "Waning Crescent"; emoji = "🌘"; }

  return { phase, illumination: Math.round(illumination), emoji };
}

// ── Parse API response ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseWeatherData(feature: Record<string, any>): WeatherData {
  const props = feature.properties;
  const cc = props.currentConditions;
  const fg = props.forecastGroup;
  const hfg = props.hourlyForecastGroup;
  const rs = props.riseSet;

  const current: CurrentConditions = {
    temperature: cc.temperature?.value?.en ?? 0,
    condition: cc.condition?.en ?? "Unknown",
    iconCode: cc.iconCode?.value ?? 0,
    windSpeed: cc.wind?.speed?.value?.en ?? 0,
    windGust: cc.wind?.gust?.value?.en ?? null,
    windDirection: cc.wind?.direction?.value?.en ?? "",
    humidity: cc.relativeHumidity?.value?.en ?? 0,
    pressure: cc.pressure?.value?.en ?? 0,
    dewpoint: cc.dewpoint?.value?.en ?? 0,
    windChill: cc.windChill?.value?.en ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forecasts: ForecastPeriod[] = (fg?.forecasts ?? []).map((f: Record<string, any>) => {
    const temp = f.temperatures?.temperature?.[0];
    const uvIndex = Number.parseFloat(f.uv?.index?.en ?? f.uv?.index?.value?.en);
    return {
      name: f.period?.textForecastName?.en ?? "",
      isNight: (f.period?.textForecastName?.en ?? "").toLowerCase().includes("night") ||
               (f.period?.textForecastName?.en ?? "").toLowerCase().includes("tonight"),
      high: temp?.class?.en === "high" ? temp?.value?.en : null,
      low: temp?.class?.en === "low" ? temp?.value?.en : null,
      temperature: temp?.value?.en ?? 0,
      tempClass: temp?.class?.en ?? "high",
      summary: f.abbreviatedForecast?.textSummary?.en ?? f.textSummary?.en ?? "",
      iconCode: f.abbreviatedForecast?.icon?.value ?? 0,
      iconUrl: f.abbreviatedForecast?.icon?.url ?? "",
      windSummary: f.winds?.textSummary?.en ?? "",
      windChill: f.windChill?.textSummary?.en ?? null,
      humidity: f.relativeHumidity?.value?.en ?? 0,
      precipitation: f.precipitation?.precipPeriods?.[0]?.value?.en ?? null,
      uv: f.uv ? `${f.uv.index?.en ?? f.uv.index?.value?.en ?? ""} (${f.uv.category?.en ?? ""})` : null,
      uvIndex: Number.isFinite(uvIndex) ? uvIndex : null,
    };
  });

  // Group into daily forecasts (day/night pairs)
  const dailyForecasts: DayForecast[] = [];
  let i = 0;
  const fc = forecasts;
  while (i < fc.length) {
    const current_fc = fc[i];
    if (current_fc.isNight && i === 0) {
      // First entry is tonight — create a standalone night entry
      dailyForecasts.push({
        dayName: "Today",
        high: null,
        low: current_fc.low ?? current_fc.temperature,
        dayCondition: "",
        nightCondition: current_fc.summary,
        dayIcon: 0,
        nightIcon: current_fc.iconCode,
        dayWindSummary: "",
        dayPrecipitation: null,
        nightPrecipitation: current_fc.precipitation,
        dayHumidity: 0,
        dayUv: null,
        dayWindChill: null,
        nightWindChill: current_fc.windChill,
      });
      i++;
      continue;
    }

    const dayPeriod = current_fc;
    const nightPeriod = i + 1 < fc.length && fc[i + 1].isNight ? fc[i + 1] : null;

    dailyForecasts.push({
      dayName: dayPeriod.name,
      high: dayPeriod.high ?? dayPeriod.temperature,
      low: nightPeriod ? (nightPeriod.low ?? nightPeriod.temperature) : null,
      dayCondition: dayPeriod.summary,
      nightCondition: nightPeriod?.summary ?? "",
      dayIcon: dayPeriod.iconCode,
      nightIcon: nightPeriod?.iconCode ?? 0,
      dayWindSummary: dayPeriod.windSummary,
      dayPrecipitation: dayPeriod.precipitation,
      nightPrecipitation: nightPeriod?.precipitation ?? null,
      dayHumidity: dayPeriod.humidity,
      dayUv: dayPeriod.uv,
      dayWindChill: dayPeriod.windChill,
      nightWindChill: nightPeriod?.windChill ?? null,
    });

    i += nightPeriod ? 2 : 1;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hourly: HourlyForecast[] = (hfg?.hourlyForecasts ?? []).map((h: Record<string, any>) => ({
    timestamp: h.timestamp,
    temperature: h.temperature?.value?.en ?? 0,
    condition: h.condition?.en ?? "",
    iconCode: h.iconCode?.value ?? 0,
    windChill: h.windChill?.value?.en ?? null,
    windSpeed: h.wind?.speed?.value?.en ?? 0,
    windDirection: h.wind?.direction?.value?.en ?? "",
    lop: h.lop?.value?.en ?? 0,
    uv: h.uv?.index?.value?.en ?? null,
  }));

  const normals = fg?.regionalNormals?.temperature ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highNormal = normals.find((t: Record<string, any>) => t.class?.en === "high")?.value?.en ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lowNormal = normals.find((t: Record<string, any>) => t.class?.en === "low")?.value?.en ?? 0;

  const [lon, lat] = feature.geometry?.coordinates ?? [];

  return {
    cityName: props.name?.en ?? "Unknown",
    cityId: feature.id,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    current,
    forecasts,
    dailyForecasts,
    hourly,
    sunTimes: {
      sunrise: rs?.sunrise?.en ?? "",
      sunset: rs?.sunset?.en ?? "",
    },
    regionalNormals: { high: highNormal, low: lowNormal },
    warnings: props.warnings ?? [],
    lastUpdated: props.lastUpdated ?? "",
  };
}

async function fetchWeather(cityId: string): Promise<WeatherData> {
  const res = await fetch(`${API_BASE}/${cityId}?f=json&lang=en`);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const data = await res.json();
  return parseWeatherData(data);
}

export function useWeather(cityId: string) {
  return useQuery<WeatherData>({
    queryKey: ["weather", cityId],
    queryFn: () => fetchWeather(cityId),
    refetchInterval: 10 * 60 * 1000, // refresh every 10 minutes
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

// ── Every location the city page API covers ──

async function fetchCities(): Promise<CityOption[]> {
  // Names, regions and points only: the full items are ~33 KB each.
  const res = await fetch(`${API_BASE}?f=json&lang=en&limit=2000&properties=name.en,region.en`);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const data = await res.json();
  return (data.features ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: Record<string, any>) => {
      const [lon, lat] = f.geometry?.coordinates ?? [];
      const city: CityOption = { id: f.id, name: f.properties?.name?.en ?? f.id, region: f.properties?.region?.en };
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        city.lat = lat;
        city.lon = lon;
      }
      return city;
    })
    .filter((c: CityOption) => isCityId(c.id))
    .sort((a: CityOption, b: CityOption) => a.name.localeCompare(b.name));
}

/** The full location list's query, for `useCityList` and `queryClient.fetchQuery`. */
export const cityListQuery = {
  queryKey: ["weather-cities"],
  queryFn: fetchCities,
  staleTime: Infinity,
  gcTime: Infinity,
  retry: 2,
};

/** The full location list, fetched once per session for the city picker. */
export function useCityList(enabled = true) {
  return useQuery<CityOption[]>({ ...cityListQuery, enabled });
}

// ── Use my location ──

/** Farthest a location can be from you and still count as yours. */
export const NEAREST_CITY_MAX_KM = 100;

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The location closest to a point, or null if none is within `maxKm` (e.g.
 * outside Canada) or no location has coordinates.
 */
export function nearestCity(
  cities: CityOption[],
  lat: number,
  lon: number,
  maxKm = NEAREST_CITY_MAX_KM,
): CityOption | null {
  let best: CityOption | null = null;
  let bestKm = maxKm;
  for (const city of cities) {
    if (city.lat === undefined || city.lon === undefined) continue;
    const km = distanceKm(lat, lon, city.lat, city.lon);
    if (km <= bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

/** A readable reason the position could not be had. */
export function locationErrorMessage(err: unknown): string {
  const code = (err as GeolocationPositionError | null)?.code;
  if (code === 1) return "Location access is off. Allow it for Crystal OS in your system settings.";
  if (code === 3) return "Finding your location took too long. Try again.";
  return "Your location could not be found.";
}

/**
 * Asks the system for a rough position (city-level accuracy is plenty).
 * Rejects with a GeolocationPositionError-like object on failure.
 */
export function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject({ code: 2 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
