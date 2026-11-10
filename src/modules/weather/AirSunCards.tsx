import { Leaf, Sun, Sunrise, Sunset } from "lucide-react";
import type { WeatherData } from "@/hooks/useWeather";
import { useAirQuality } from "@/hooks/useAirQuality";
import { useNow } from "@/hooks/useOrbitReview";
import { AQHI_MAX_KM, aqhiRisk, formatAqhi, uvOutlook, uvRisk, type RiskLevel } from "@/lib/airQuality";
import { dayLengthChangeSeconds, daylightState, formatDayLengthChange, formatDuration } from "@/lib/daylight";

/** One colour per risk band, shared by the AQHI and UV cards. */
const RISK_COLOR: Record<RiskLevel, string> = {
  low: "hsl(142 65% 52%)",
  moderate: "hsl(45 93% 56%)",
  high: "hsl(25 95% 58%)",
  "very-high": "hsl(0 84% 62%)",
  extreme: "hsl(285 70% 68%)",
};

/** Times on these cards use the device clock, like the weather nudge. */
function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hourOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric" });
}

function CardTitle({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">{children}</p>;
}

/** The big number, its band in colour, and the advice under it. */
function Reading({ value, unit, label, color, advice }: { value: string; unit: string; label: string; color: string; advice: string }) {
  return (
    <>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold tracking-tight" style={{ color }}>
          {value}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
        <span
          className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
        >
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground/80">{advice}</p>
    </>
  );
}

/** Ten cells for AQHI 1–10 (the last one also stands for 10+), lit up to the reading. */
function AqhiScale({ value }: { value: number }) {
  const lit = Math.min(10, Math.max(1, Math.round(value)));
  return (
    <div className="mt-4 flex gap-1" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => {
        const color = RISK_COLOR[aqhiRisk(i + 1).level];
        return (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: i < lit ? color : "hsl(var(--background) / 0.5)" }}
          />
        );
      })}
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-9 w-24 rounded bg-primary/10 animate-pulse" />
      <div className="h-4 w-full rounded bg-primary/5 animate-pulse" />
      <div className="h-4 w-2/3 rounded bg-primary/5 animate-pulse" />
    </div>
  );
}

export function AirQualityCard({ data }: { data: WeatherData }) {
  const { data: air, isLoading, error } = useAirQuality(data.lat, data.lon);

  let body: React.ReactNode;
  if (data.lat == null || data.lon == null) {
    body = <p className="text-sm text-muted-foreground">This location has no map point to find an air quality station from.</p>;
  } else if (isLoading) {
    body = <SkeletonLines />;
  } else if (error) {
    body = <p className="text-sm text-muted-foreground">Air quality could not be loaded. It will try again shortly.</p>;
  } else if (!air) {
    body = (
      <p className="text-sm text-muted-foreground">
        No Environment Canada air quality station within {AQHI_MAX_KM} km of {data.cityName}.
      </p>
    );
  } else {
    const { observation: obs, peak } = air;
    const risk = aqhiRisk(obs.aqhi);
    const peakRisk = peak ? aqhiRisk(peak.aqhi) : null;
    body = (
      <>
        <Reading value={formatAqhi(obs.aqhi)} unit="AQHI" label={risk.label} color={RISK_COLOR[risk.level]} advice={risk.advice} />
        <AqhiScale value={obs.aqhi} />
        {peak && peakRisk && (
          <p className="mt-3 text-xs text-muted-foreground">
            Next 24 h: up to{" "}
            <span className="font-medium" style={{ color: RISK_COLOR[peakRisk.level] }}>
              {formatAqhi(peak.aqhi)}
            </span>{" "}
            ({peakRisk.label.toLowerCase()}) around {hourOnly(peak.at)}
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {obs.stationName} station · {Math.round(obs.distanceKm)} km away · measured {clock(obs.observedAt)}
        </p>
      </>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2">
        <Leaf className="w-4 h-4 text-emerald-400 mb-4" />
        <CardTitle>Air Quality</CardTitle>
      </div>
      {body}
    </div>
  );
}

export function UvCard({ data }: { data: WeatherData }) {
  const now = useNow();
  const uv = uvOutlook(data.forecasts, data.hourly, now);

  let body: React.ReactNode;
  if (!uv.day && uv.peak == null) {
    body = <p className="text-sm text-muted-foreground">No UV forecast for the next day.</p>;
  } else {
    const index = uv.day?.index ?? uv.peak!.index;
    const risk = uvRisk(index);
    const when = uv.day ? `${uv.day.name}'s max` : "Max in the next 24 h";
    body = (
      <>
        <Reading value={String(Math.round(index))} unit={when} label={risk.label} color={RISK_COLOR[risk.level]} advice={risk.advice} />
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {uv.now != null && (
            <span>
              Now <span className="font-medium text-foreground">{uv.now}</span>
            </span>
          )}
          {uv.peak && (
            <span>
              Highest hour <span className="font-medium text-foreground">{uv.peak.index}</span> at {hourOnly(uv.peak.at)}
            </span>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2">
        <Sun className="w-4 h-4 text-yellow-400 mb-4" />
        <CardTitle>UV Index</CardTitle>
      </div>
      {body}
    </div>
  );
}

/**
 * How far through the day (or night) it is, with the time to the next
 * sunset or sunrise and how the day's length is changing.
 */
export function DaylightBar({ data }: { data: WeatherData }) {
  const now = useNow();
  const state = daylightState(data.sunTimes.sunrise, data.sunTimes.sunset, now);
  if (!state) return null;
  const change = data.lat != null && data.lon != null ? dayLengthChangeSeconds(now, data.lat, data.lon) : null;
  const isDay = state.phase === "day";
  const pct = Math.round(state.progress * 100);

  return (
    <div className="mt-4 rounded-lg bg-background/20 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          {isDay ? <Sunset className="w-3.5 h-3.5 text-orange-400" /> : <Sunrise className="w-3.5 h-3.5 text-amber-400" />}
          {isDay ? `${formatDuration(state.remainingMs)} of daylight left` : `Sunrise in ${formatDuration(state.remainingMs)}`}
        </span>
        {change != null && <span className="text-muted-foreground">{formatDayLengthChange(change)}</span>}
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-background/50 overflow-hidden"
        role="progressbar"
        aria-label={isDay ? "Daylight elapsed" : "Night elapsed"}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: isDay
              ? "linear-gradient(90deg, hsl(40 95% 60%), hsl(25 95% 58%))"
              : "linear-gradient(90deg, hsl(230 60% 45%), hsl(260 55% 65%))",
          }}
        />
      </div>
    </div>
  );
}
