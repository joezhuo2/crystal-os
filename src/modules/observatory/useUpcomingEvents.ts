import { useMemo } from "react";
import { calendarWasConnected, useCalendarEvents, useCalendarStatus } from "@/hooks/useGoogleCalendar";
import { pickedCalendarId } from "@/hooks/useTodayCapacity";
import { usesSidecar } from "@/lib/platform";

const DAYS_BACK = 30;
const DAYS_AHEAD = 200;

export function useUpcomingEvents(enabled = true) {
  const status = useCalendarStatus(enabled && (!usesSidecar() || calendarWasConnected()));
  const connected = status.data?.connected === true;
  const range = useMemo(() => {
    const now = new Date();
    return {
      calendarId: pickedCalendarId(),
      timeMin: new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_BACK).toISOString(),
      timeMax: new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD).toISOString(),
    };
  }, []);
  const query = useCalendarEvents(range, enabled && connected);
  return { events: query.data?.events ?? [], connected, loading: status.isLoading || (connected && query.isLoading) };
}
