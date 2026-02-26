import { useQuery } from "@tanstack/react-query";

const API_BASE = "https://api.weather.gc.ca/collections/citypageweather-realtime/items";

export interface CityOption {
  id: string;
  name: string;
}

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
function parseWeatherData(feature: Record<string, any>): WeatherData {
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

  return {
    cityName: props.name?.en ?? "Unknown",
    cityId: feature.id,
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

// Weather icon mapping to descriptive names
export function getWeatherIconDescription(code: number): string {
  const map: Record<number, string> = {
    0: "Sunny",
    1: "Mainly Sunny",
    2: "Partly Cloudy",
    3: "Mostly Cloudy",
    4: "Overcast",
    5: "Drizzle",
    6: "Rain",
    7: "Rain/Snow Mix",
    8: "Snow/Rain Mix",
    9: "Thunderstorm",
    10: "Cloudy",
    11: "Showers",
    12: "Rain Shower",
    13: "Snow Flurries",
    14: "Light Snow",
    15: "Blowing Snow",
    16: "Moderate Snow",
    17: "Heavy Snow",
    18: "Thunderstorm",
    19: "Thunderstorm with Hail",
    22: "Haze",
    23: "Fog",
    24: "Frost",
    25: "Ice Crystals",
    26: "Freezing Rain",
    27: "Freezing Drizzle",
    28: "Rain/Freezing Rain",
    30: "Clear Night",
    31: "Mainly Clear Night",
    32: "Partly Cloudy Night",
    33: "Mostly Cloudy Night",
    34: "Overcast Night",
    36: "Rain Night",
    37: "Rain/Snow Night",
    38: "Flurries Night",
    39: "Thunderstorm Night",
  };
  return map[code] ?? "Unknown";
}
