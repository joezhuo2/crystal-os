import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTasks } from "@/contexts/AppContext";
import { calendarEventsQuery, calendarWasConnected, useCalendarStatus } from "@/hooks/useGoogleCalendar";
import { useHabitsData } from "@/hooks/useHabits";
import { useHabitReminders } from "@/lib/habitReminders";
import { deliver, eventAlerts, habitReminderAlerts, taskDueAlerts, taskReminderAlerts } from "@/lib/notifications";
import { useNotifySettings } from "@/lib/notifySettings";
import { usesSidecar } from "@/lib/platform";

/** How often due times and reminders are checked. */
const CHECK_MS = 30 * 1000;
/** How often the next day of events is fetched again, window shown or not. */
const EVENTS_REFRESH_MS = 10 * 60 * 1000;
/** Matches CalendarPage's key, so reminders follow the calendar picked in The Horizon. */
const CALENDAR_STORAGE_KEY = "crystal-os-google-calendar";
/** Tags "every launch" reminders, so the sent log repeats them next launch but not within this one. */
const LAUNCH = Date.now().toString(36);

function selectedCalendar(): string {
  try {
    return localStorage.getItem(CALENDAR_STORAGE_KEY) ?? "primary";
  } catch {
    return "primary";
  }
}

/** The current hour, so the events range (and its query key) moves once an hour. */
function useHour(): number {
  const [hour, setHour] = useState(() => Math.floor(Date.now() / 3600000));
  useEffect(() => {
    const id = window.setInterval(() => setHour(Math.floor(Date.now() / 3600000)), CHECK_MS);
    return () => window.clearInterval(id);
  }, []);
  return hour;
}

/**
 * Task due-time, habit and calendar notifications (src/lib/notifications.ts).
 * Renders nothing; mounted while signed in, on every tab.
 */
export default function NotificationScheduler() {
  const settings = useNotifySettings();
  const tasks = useTasks();
  const hour = useHour();
  const habits = useHabitsData();
  const reminders = useHabitReminders();

  // On desktop, asking for the status starts the sidecar, so it is only asked
  // once the calendar has been connected (as the Home card does).
  const wantEvents = settings.calendar && !settings.doNotDisturb;
  const status = useCalendarStatus(wantEvents && (!usesSidecar() || calendarWasConnected()));
  const connected = status.data?.connected === true;

  // From the start of this hour through the next 50, past the longest lead (a day).
  const range = useMemo(
    () => ({
      calendarId: selectedCalendar(),
      timeMin: new Date(hour * 3600000).toISOString(),
      timeMax: new Date((hour + 50) * 3600000).toISOString(),
    }),
    [hour],
  );
  const events = useQuery({
    ...calendarEventsQuery(range),
    enabled: wantEvents && connected,
    refetchInterval: EVENTS_REFRESH_MS,
    // Reminders matter most while the window is hidden in the tray.
    refetchIntervalInBackground: true,
  });

  // The check reads the latest data through refs, so the timer is set up once.
  const current = { settings, tasks, events: events.data?.events ?? [], habits: habits.data, reminders };
  const latest = useRef(current);
  latest.current = current;

  useEffect(() => {
    const check = () => {
      const { settings: s, tasks: t, events: e, habits: h, reminders: r } = latest.current;
      if (s.doNotDisturb) return;
      const now = new Date();
      deliver([
        ...(s.tasks ? taskDueAlerts(t, now) : []),
        ...(s.taskReminders
          ? taskReminderAlerts(t, now, { when: s.taskReminderWhen, lead: s.taskLead }).map((a) =>
              s.taskReminderRepeat === "everyLaunch" ? { ...a, key: `${a.key}:${LAUNCH}` } : a,
            )
          : []),
        ...(s.calendar ? eventAlerts(e, now, s.eventLead) : []),
        ...(h ? habitReminderAlerts(h.habits, h.checks, r, now) : []),
      ]);
    };
    check();
    const id = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
