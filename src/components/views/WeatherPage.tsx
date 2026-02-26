import { useState } from "react";
import { motion } from "framer-motion";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  Moon,
  MoonStar,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  AlertTriangle,
} from "lucide-react";
import {
  useWeather,
  getMoonPhase,
  AVAILABLE_CITIES,
  type DayForecast,
  type HourlyForecast,
} from "@/hooks/useWeather";

// ── Weather icon mapping ──

function WeatherIcon({ code, className = "w-6 h-6" }: { code: number; className?: string }) {
  const props = { className };
  if (code === 0 || code === 1) return <Sun {...props} />;
  if (code === 2) return <CloudSun {...props} />;
  if (code >= 3 && code <= 4) return <Cloud {...props} />;
  if (code === 5 || code === 27) return <CloudDrizzle {...props} />;
  if (code === 6 || code === 11 || code === 12 || code === 36) return <CloudRain {...props} />;
  if (code === 7 || code === 8 || code === 28 || code === 37) return <CloudSnow {...props} />;
  if (code === 9 || code === 18 || code === 19 || code === 39) return <CloudLightning {...props} />;
  if (code === 10 || code === 33 || code === 34) return <Cloud {...props} />;
  if (code >= 13 && code <= 17) return <CloudSnow {...props} />;
  if (code === 22 || code === 23) return <CloudFog {...props} />;
  if (code === 24 || code === 25 || code === 26) return <CloudHail {...props} />;
  if (code === 30 || code === 31) return <MoonStar {...props} />;
  if (code === 32) return <Moon {...props} />;
  if (code === 38) return <CloudSnow {...props} />;
  return <Cloud {...props} />;
}

function formatTime(isoString: string): string {
  if (!isoString) return "--";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  });
}

function formatHour(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone: "America/Toronto",
  });
}

// ── Current Conditions Card ──

function CurrentConditions({
  data,
  cityId,
  onCityChange,
}: {
  data: ReturnType<typeof useWeather>["data"];
  cityId: string;
  onCityChange: (id: string) => void;
}) {
  if (!data) return null;
  const { current, cityName, sunTimes, regionalNormals } = data;
  const feelsLike = current.windChill ?? current.temperature;
  const moonData = getMoonPhase();

  return (
    <div className="glass-card p-6 col-span-full">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl" style={{ background: "hsl(239 84% 67% / 0.12)" }}>
            <WeatherIcon code={current.iconCode} className="w-10 h-10 text-primary" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight">{Math.round(current.temperature)}°</span>
              <span className="text-lg text-muted-foreground">C</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{current.condition}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Feels like {Math.round(feelsLike)}° · Normal: H {regionalNormals.high}° / L {regionalNormals.low}°
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={cityId}
            onChange={(e) => onCityChange(e.target.value)}
            className="bg-background/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
          >
            {AVAILABLE_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick stats grid - 2 rows of 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <StatChip icon={Wind} label="Wind" value={`${current.windSpeed} km/h ${current.windDirection}`} />
        <StatChip icon={Wind} label="Gusts" value={current.windGust ? `${current.windGust} km/h` : "--"} />
        <StatChip icon={Droplets} label="Humidity" value={`${current.humidity}%`} />
        <StatChip icon={Gauge} label="Pressure" value={`${current.pressure} kPa`} />
        <StatChip icon={Thermometer} label="Dewpoint" value={`${current.dewpoint}°C`} />
        <StatChip icon={Sunrise} label="Sunrise" value={formatTime(sunTimes.sunrise)} />
        <StatChip icon={Sunset} label="Sunset" value={formatTime(sunTimes.sunset)} />
        <MoonChip moonData={moonData} />
      </div>

      {data.warnings.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            {data.warnings.map((w: Record<string, unknown>, i: number) => (
              <p key={i}>{(w.event as Record<string, string>)?.en ?? "Weather Warning"}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-background/30">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function MoonChip({ moonData }: { moonData: { phase: string; illumination: number; emoji: string } }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-background/30">
      <span className="text-lg">{moonData.emoji}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Moon</p>
        <p className="text-sm font-medium truncate">{moonData.phase}</p>
      </div>
    </div>
  );
}

// ── 7-Day Forecast ──

function SevenDayForecast({ forecasts }: { forecasts: DayForecast[] }) {
  return (
    <div className="glass-card p-6 col-span-full">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Extended Forecast</p>
      <div className="space-y-1">
        {forecasts.map((day, i) => (
          <motion.div
            key={day.dayName}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-background/30 transition-colors"
          >
            {/* Day name */}
            <span className="text-sm font-medium w-24 shrink-0">{day.dayName}</span>

            {/* Temps */}
            <div className="flex items-center gap-1 shrink-0 w-20">
              {day.high !== null && (
                <span className="text-sm font-semibold w-9 text-right">{day.high}°</span>
              )}
              {day.low !== null && (
                <span className="text-sm text-muted-foreground w-9 text-right">{day.low}°</span>
              )}
            </div>
            <TempBar high={day.high} low={day.low} />

            {/* Weather type (precipitation) + condition description */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <WeatherIcon code={day.dayIcon || day.nightIcon} className="w-5 h-5 text-primary shrink-0" />
              {(day.dayPrecipitation || day.nightPrecipitation) && (
                <span className="text-xs font-medium text-blue-400 shrink-0 flex items-center gap-1">
                  <Droplets className="w-3 h-3" />
                  {day.dayPrecipitation || day.nightPrecipitation}
                </span>
              )}
              <span className="text-xs text-muted-foreground truncate hidden sm:block">
                {day.dayCondition || day.nightCondition}
              </span>
            </div>

            {/* Details: wind, humidity, UV */}
            <div className="hidden lg:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
              {day.dayWindSummary && (
                <span className="flex items-center gap-1 max-w-[180px] truncate">
                  <Wind className="w-3 h-3 shrink-0" />
                  {day.dayWindSummary}
                </span>
              )}
              {day.dayUv && (
                <span className="flex items-center gap-1">
                  <Sun className="w-3 h-3 shrink-0" />
                  UV {day.dayUv}
                </span>
              )}
              {day.dayHumidity > 0 && (
                <span className="flex items-center gap-1">
                  <Droplets className="w-3 h-3 shrink-0" />
                  {day.dayHumidity}%
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TempBar({ high, low }: { high: number | null; low: number | null }) {
  // Normalize temp to a visual range (-30 to 40)
  const min = -30;
  const max = 40;
  const range = max - min;

  const normalize = (v: number) => Math.max(0, Math.min(100, ((v - min) / range) * 100));

  const left = low !== null ? normalize(low) : high !== null ? normalize(high) - 5 : 30;
  const right = high !== null ? normalize(high) : low !== null ? normalize(low) + 5 : 35;

  return (
    <div className="hidden sm:block w-24 h-1.5 rounded-full bg-background/50 relative overflow-hidden shrink-0">
      <div
        className="absolute h-full rounded-full"
        style={{
          left: `${left}%`,
          width: `${Math.max(right - left, 3)}%`,
          background: "linear-gradient(90deg, hsl(210 80% 60%), hsl(30 90% 55%))",
        }}
      />
    </div>
  );
}

// ── Hourly Forecast ──

function HourlyForecastSection({ hourly }: { hourly: HourlyForecast[] }) {
  const display = hourly.slice(0, 24);
  const row1 = display.slice(0, 12);
  const row2 = display.slice(12, 24);

  const renderHourCard = (h: HourlyForecast, i: number) => (
    <motion.div
      key={h.timestamp}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.02 }}
      className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-background/20 flex-1 min-w-0"
    >
      <span className="text-[10px] text-muted-foreground">{formatHour(h.timestamp)}</span>
      <WeatherIcon code={h.iconCode} className="w-5 h-5 text-primary" />
      <span className="text-sm font-semibold">{Math.round(h.temperature)}°</span>
      {h.windChill !== null && h.windChill !== h.temperature && (
        <span className="text-[10px] text-muted-foreground">
          FL {Math.round(h.windChill)}°
        </span>
      )}
      {h.lop > 0 && (
        <span className="text-[10px] text-blue-400 flex items-center gap-0.5">
          <Droplets className="w-2.5 h-2.5" />
          {h.lop}%
        </span>
      )}
      <span className="text-[10px] text-muted-foreground">
        {h.windSpeed}<span className="text-[8px]">km/h</span>
      </span>
    </motion.div>
  );

  return (
    <div className="glass-card p-6 col-span-full">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Hourly Forecast</p>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {row1.map((h, i) => renderHourCard(h, i))}
        </div>
        {row2.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {row2.map((h, i) => renderHourCard(h, i + 12))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detailed Info Cards ──

function DetailCards({ data }: { data: ReturnType<typeof useWeather>["data"] }) {
  if (!data) return null;
  const moonData = getMoonPhase();
  const { sunTimes } = data;

  // Calculate day length
  const sunrise = new Date(sunTimes.sunrise);
  const sunset = new Date(sunTimes.sunset);
  const dayLengthMs = sunset.getTime() - sunrise.getTime();
  const dayHours = Math.floor(dayLengthMs / (1000 * 60 * 60));
  const dayMins = Math.floor((dayLengthMs % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-full">
      {/* Sun & Moon */}
      <div className="glass-card p-6">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Sun & Moon</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <Sunrise className="w-6 h-6 text-amber-400" />
            <span className="text-sm font-medium">{formatTime(sunTimes.sunrise)}</span>
            <span className="text-[10px] text-muted-foreground">Sunrise</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <Sunset className="w-6 h-6 text-orange-400" />
            <span className="text-sm font-medium">{formatTime(sunTimes.sunset)}</span>
            <span className="text-[10px] text-muted-foreground">Sunset</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <Sun className="w-6 h-6 text-yellow-400" />
            <span className="text-sm font-medium">{dayHours}h {dayMins}m</span>
            <span className="text-[10px] text-muted-foreground">Day Length</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <span className="text-2xl">{moonData.emoji}</span>
            <span className="text-sm font-medium">{moonData.phase}</span>
            <span className="text-[10px] text-muted-foreground">{moonData.illumination}% illuminated</span>
          </div>
        </div>
      </div>

      {/* Wind Details */}
      <div className="glass-card p-6">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Wind Details</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <Wind className="w-6 h-6 text-blue-400" />
            <span className="text-sm font-medium">{data.current.windSpeed} km/h</span>
            <span className="text-[10px] text-muted-foreground">Speed</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <Wind className="w-6 h-6 text-blue-300" />
            <span className="text-sm font-medium">{data.current.windGust ?? "--"} km/h</span>
            <span className="text-[10px] text-muted-foreground">Gusts</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <Eye className="w-6 h-6 text-muted-foreground" />
            <span className="text-sm font-medium">{data.current.windDirection}</span>
            <span className="text-[10px] text-muted-foreground">Direction</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-background/20">
            <Thermometer className="w-6 h-6 text-cyan-400" />
            <span className="text-sm font-medium">
              {data.current.windChill !== null ? `${data.current.windChill}°C` : "--"}
            </span>
            <span className="text-[10px] text-muted-foreground">Wind Chill</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Weather Page ──

const CITY_STORAGE_KEY = "crystal-os-weather-city";

export default function WeatherPage() {
  const [cityId, setCityId] = useState(() => {
    try {
      return localStorage.getItem(CITY_STORAGE_KEY) ?? "on-85";
    } catch {
      return "on-85";
    }
  });

  const { data, isLoading, error } = useWeather(cityId);

  const handleCityChange = (id: string) => {
    setCityId(id);
    try {
      localStorage.setItem(CITY_STORAGE_KEY, id);
    } catch { /* ignore localStorage errors */ }
  };

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4">
        <div className="glass-card p-6 col-span-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 animate-pulse" />
            <div className="space-y-2">
              <div className="w-24 h-8 rounded bg-primary/10 animate-pulse" />
              <div className="w-40 h-4 rounded bg-primary/5 animate-pulse" />
            </div>
          </div>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="glass-card p-6 col-span-full h-32 animate-pulse bg-primary/5 rounded-xl" />
        ))}
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <p className="font-medium">Unable to load weather data</p>
            <p className="text-sm text-muted-foreground mt-1">Please check your connection and try again.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-4"
    >
      <CurrentConditions data={data} cityId={cityId} onCityChange={handleCityChange} />
      {data && <HourlyForecastSection hourly={data.hourly} />}
      {data && <SevenDayForecast forecasts={data.dailyForecasts} />}
      {data && <DetailCards data={data} />}

      {data && (
        <p className="text-[10px] text-muted-foreground text-center col-span-full">
          Last updated: {new Date(data.lastUpdated).toLocaleString("en-US", { timeZone: "America/Toronto" })} ·
          Data from Environment and Climate Change Canada
        </p>
      )}
    </motion.div>
  );
}
