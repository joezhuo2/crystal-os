/**
 * Pulse reminders: travel time from where you are now to a calendar event's
 * location, so its reminder can say when to leave (issue #45).
 *
 * The address is found with OpenStreetMap's Nominatim and the drive timed by
 * the public OSRM server; neither needs a key. Places are cached for the
 * session and drives worked out again every half hour. Anything that cannot
 * be timed (no location, a meeting link, no position, a failed lookup) is left
 * out, and its reminder uses the default lead.
 */

import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/hooks/useGoogleCalendar";
import { getPosition } from "@/hooks/useWeather";

export interface LatLon {
  lat: number;
  lon: number;
}

/** How often travel times are worked out again. */
export const TRAVEL_REFRESH_MS = 30 * 60 * 1000;
/** Only events starting this soon are timed. */
const LOOKAHEAD_MS = 6 * 60 * 60 * 1000;
/** Nominatim allows one request a second. */
const GEOCODE_GAP_MS = 1100;

const places = new Map<string, Promise<LatLon | null>>();
let nextGeocodeAt = 0;

async function geocode(query: string): Promise<LatLon | null> {
  const at = Math.max(Date.now(), nextGeocodeAt);
  nextGeocodeAt = at + GEOCODE_GAP_MS;
  if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()));
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

function place(query: string): Promise<LatLon | null> {
  let found = places.get(query);
  if (!found) {
    found = geocode(query);
    // A failed request is tried again next time; "not found" is kept.
    found.catch(() => places.delete(query));
    places.set(query, found);
  }
  return found;
}

/** Driving minutes from `origin` to `location`, or null when it cannot be timed. */
export async function travelMinutes(origin: LatLon, location: string): Promise<number | null> {
  const to = await place(location);
  if (!to) return null;
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${to.lon},${to.lat}?overview=false`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { code?: string; routes?: { duration: number }[] };
  const seconds = data.code === "Ok" ? data.routes?.[0]?.duration : undefined;
  return typeof seconds === "number" ? Math.ceil(seconds / 60) : null;
}

/** Distinct locations of timed events starting within the lookahead, links left out. */
export function upcomingLocations(events: CalendarEvent[], now: number): string[] {
  const found = new Set<string>();
  for (const event of events) {
    const location = event.location?.trim();
    if (event.allDay || !location || /^https?:\/\//i.test(location)) continue;
    const start = Date.parse(event.startISO);
    if (start > now && start - now <= LOOKAHEAD_MS) found.add(location);
  }
  return [...found];
}

/** Driving minutes by event location, for the events starting soon. Empty while `enabled` is false. */
export function useTravelTimes(events: CalendarEvent[], enabled: boolean): Record<string, number> {
  const [times, setTimes] = useState<Record<string, number>>({});
  const key = enabled ? upcomingLocations(events, Date.now()).join("\n") : "";

  useEffect(() => {
    if (!key) return;
    let live = true;
    const run = async () => {
      let origin: LatLon;
      try {
        origin = await getPosition();
      } catch {
        return;
      }
      const next: Record<string, number> = {};
      for (const location of key.split("\n")) {
        const minutes = await travelMinutes(origin, location).catch(() => null);
        if (minutes !== null) next[location] = minutes;
      }
      if (live) setTimes(next);
    };
    void run();
    const id = window.setInterval(run, TRAVEL_REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [key]);

  return key ? times : {};
}

/** Test hook: forget cached places. */
export function _resetPlaces() {
  places.clear();
  nextGeocodeAt = 0;
}
