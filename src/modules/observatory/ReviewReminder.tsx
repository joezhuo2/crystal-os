import { useEffect, useRef } from "react";
import { deliver } from "@/lib/notifications";
import { reviewReminderAlerts } from "./reminderAlerts";
import { useObservatorySettings } from "./settings";
import { useStudySummary } from "./useStudySummary";

const CHECK_MS = 60_000;

export default function ReviewReminder() {
  const { reminderTime } = useObservatorySettings();
  const { due, loading } = useStudySummary();
  const latest = useRef({ due, loading, reminderTime });
  latest.current = { due, loading, reminderTime };

  useEffect(() => {
    const check = () => {
      const { due: n, loading: busy, reminderTime: time } = latest.current;
      if (!busy) deliver(reviewReminderAlerts(n, time, new Date()));
    };
    check();
    const id = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loading) deliver(reviewReminderAlerts(due, reminderTime, new Date()));
  }, [loading, due, reminderTime]);

  return null;
}
