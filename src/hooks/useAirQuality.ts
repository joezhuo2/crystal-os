import { useQuery } from "@tanstack/react-query";
import {
  AQHI_MAX_KM,
  forecastPeak,
  nearestObservation,
  parseObservations,
  upcomingForecast,
  type AqhiForecastHour,
  type AqhiPeak,
  type NearestObservation,
} from "@/lib/airQuality";

const API = "https://api.weather.gc.ca/collections";

export interface AirQuality {
  /** The latest reading at the nearest AQHI station. */
  observation: NearestObservation;
  /** The station's forecast for the next 24 h, empty if it has none. */
  forecast: AqhiForecastHour[];
  peak: AqhiPeak | null;
}

/** Degrees around the city to search for stations: a little over `AQHI_MAX_KM` at Canadian latitudes. */
const BOX_LAT = 0.8;
const BOX_LON = 1.4;

async function fetchAirQuality(lat: number, lon: number): Promise<AirQuality | null> {
  const bbox = [lon - BOX_LON, lat - BOX_LAT, lon + BOX_LON, lat + BOX_LAT].map((v) => v.toFixed(3)).join(",");
  const obsRes = await fetch(
    `${API}/aqhi-observations-realtime/items?f=json&latest=true&limit=100&bbox=${bbox}` +
      "&properties=location_id,location_name_en,observation_datetime,aqhi",
  );
  if (!obsRes.ok) throw new Error(`AQHI API error: ${obsRes.status}`);
  const obsData = await obsRes.json();
  const observation = nearestObservation(parseObservations(obsData.features ?? []), lat, lon, AQHI_MAX_KM);
  if (!observation) return null;

  // A missing forecast still leaves the reading worth showing.
  let forecast: AqhiForecastHour[] = [];
  try {
    const fcRes = await fetch(
      `${API}/aqhi-forecasts-realtime/items?f=json&limit=50&sortby=-publication_datetime` +
        `&location_id=${encodeURIComponent(observation.stationId)}` +
        "&properties=publication_datetime,forecast_datetime,aqhi",
    );
    if (fcRes.ok) forecast = upcomingForecast((await fcRes.json()).features ?? [], new Date());
  } catch {
    forecast = [];
  }
  return { observation, forecast, peak: forecastPeak(forecast) };
}

/**
 * The Air Quality Health Index at the AQHI station nearest a city, with its
 * 24 h forecast peak. Null when no station is within `AQHI_MAX_KM`, so most
 * small and northern locations show "no station nearby" rather than a far
 * city's air. Observations are hourly, so this refreshes every 20 minutes.
 */
export function useAirQuality(lat: number | null | undefined, lon: number | null | undefined) {
  const enabled = lat != null && lon != null;
  return useQuery<AirQuality | null>({
    queryKey: ["aqhi", lat, lon],
    queryFn: () => fetchAirQuality(lat as number, lon as number),
    enabled,
    refetchInterval: 20 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });
}
