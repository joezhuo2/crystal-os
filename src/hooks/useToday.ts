import { useEffect, useState } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { msUntilMidnight } from "@/lib/snooze";

/**
 * Today's local date ("YYYY-MM-DD"), updated at local midnight and whenever
 * the window comes back into focus (a timer can run late while the app sleeps
 * in the tray). Snoozed tasks wake on it without a reload.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toLocalDateStr());
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timeout);
      setToday(toLocalDateStr());
      // A second past midnight, so the new date is already in.
      timeout = setTimeout(refresh, msUntilMidnight(new Date()) + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return today;
}
