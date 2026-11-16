import type { PlannedAlert } from "@/lib/notifications";
import { toLocalDateStr } from "@/lib/utils";

export function reviewReminderAlerts(due: number, time: string, now: Date): PlannedAlert[] {
  const today = toLocalDateStr(now);
  if (due <= 0 || now.getTime() < new Date(`${today}T${time}:00`).getTime()) return [];
  return [{ key: `observatory-review:${today}`, title: "Time to review", body: `${due} card${due === 1 ? "" : "s"} due in The Observatory` }];
}
