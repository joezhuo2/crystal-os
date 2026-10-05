import { useEffect, useMemo, useState } from "react";
import { useTasks } from "@/contexts/AppContext";
import { calendarWasConnected, useCalendarEvents, useCalendarStatus } from "@/hooks/useGoogleCalendar";
import { todayCapacity, type TodayCapacity } from "@/lib/capacity";
import { capacityWindow, useCapacitySettings } from "@/lib/capacitySettings";
import { usesSidecar } from "@/lib/platform";
import { toLocalDateStr } from "@/lib/utils";

/** Matches CalendarPage's key, so free time follows the calendar picked in The Horizon. */
const CALENDAR_STORAGE_KEY = "crystal-os-google-calendar";

function pickedCalendarId(): string {
  try {
    return localStorage.getItem(CALENDAR_STORAGE_KEY) ?? "primary";
  } catch {
    return "primary";
  }
}

/** The device clock, ticking at the start of each minute. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const next = new Date();
      setNow(next);
      timeout = setTimeout(schedule, 60_000 - (next.getSeconds() * 1000 + next.getMilliseconds()));
    };
    timeout = setTimeout(schedule, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts once; `now` only seeds the first wait
  }, []);
  return now;
}

export type TodayCapacityState = TodayCapacity & {
  /** Whether events came off the calendar. False means free time is the window alone. */
  calendarConnected: boolean;
  /** Still waiting on the calendar for today's events. */
  loadingEvents: boolean;
  /** Today's date and the current hour ("2026-10-05T14"), for things that change hourly. */
  hourKey: string;
};

/**
 * Today's capacity for the "fits today?" bar: the estimates of today's open
 * tasks against the work window (Settings → The Engine) left from now, minus
 * the timed events in the Google calendar picked in The Horizon. Without a
 * connected calendar, free time is the window alone.
 */
export function useTodayCapacity(): TodayCapacityState {
  const tasks = useTasks();
  const settings = useCapacitySettings();
  const now = useMinuteClock();
  const today = toLocalDateStr(now);

  // Same as the Home Horizon card: on desktop, asking for the status starts
  // the sidecar, so only ask once the calendar has been connected.
  const status = useCalendarStatus(!usesSidecar() || calendarWasConnected());
  const connected = status.data?.connected === true;

  // Local midnight today through local midnight tomorrow; the same range as
  // the Horizon card, so both read one cached query.
  const range = useMemo(() => {
    const startOfDay = new Date(`${today}T00:00:00`);
    return {
      timeMin: startOfDay.toISOString(),
      timeMax: new Date(startOfDay.getTime() + 86400000).toISOString(),
    };
  }, [today]);
  const eventsQuery = useCalendarEvents({ calendarId: pickedCalendarId(), ...range }, connected);
  const events = eventsQuery.data?.events;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const capacity = useMemo(
    () => todayCapacity({ tasks, events: events ?? [], today, nowMinutes, window: capacityWindow(settings) }),
    [tasks, events, today, nowMinutes, settings],
  );

  return {
    ...capacity,
    calendarConnected: connected && events !== undefined,
    loadingEvents: status.isLoading || (connected && eventsQuery.isLoading),
    hourKey: `${today}T${now.getHours()}`,
  };
}
