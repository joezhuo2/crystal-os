import { useEffect, useMemo, useState } from "react";
import { getMoonPhase, useWeather, type WeatherData } from "@/hooks/useWeather";
import { useAtmosphere } from "@/lib/atmosphereStore";
import { isWaxing, skyPhase, skyWeather, type SkyPhase, type SkyWeather } from "@/lib/atmosphereScene";

export interface SkyScene {
  phase: SkyPhase;
  weather: SkyWeather;
  moon: { illumination: number; waxing: boolean };
  data: WeatherData | undefined;
}

/**
 * What the Living Sky shows right now, for the chosen city. Re-reads the time
 * of day once a minute. Before the weather loads (or if it fails) the sky is
 * clear and sunrise and sunset fall back to 6:30 and 19:30. The weather query
 * is shared with the page and the Home box, so this adds no request.
 */
export function useSkyScene(): SkyScene {
  const { cityId } = useAtmosphere();
  const { data } = useWeather(cityId);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const phase = skyPhase(now, data?.sunTimes.sunrise, data?.sunTimes.sunset);
  const iconCode = data?.current.iconCode;
  const weather = useMemo(() => (iconCode === undefined ? skyWeather(0) : skyWeather(iconCode)), [iconCode]);
  const day = now.toDateString();
  const moon = useMemo(() => {
    const m = getMoonPhase(new Date(day));
    return { illumination: m.illumination, waxing: isWaxing(m.phase) };
  }, [day]);

  return { phase, weather, moon, data };
}
