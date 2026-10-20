const MINUTES_PER_DAY = 24 * 60;

const pad = (n: number) => String(n).padStart(2, "0");

export const toClock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export const QUARTER_HOURS: string[] = Array.from({ length: MINUTES_PER_DAY / 15 }, (_, i) => toClock(i * 15));

/**
 * "HH:mm" from what someone typed: `930`, `9:30`, `9.30pm`, `21:05`, `9a`.
 * A bare 1-12 with no am/pm keeps the AM/PM of `current`. Null when it is not a time.
 */
export function parseTimeInput(text: string, current = ""): string | null {
  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?(?:([ap])m?)?$/.exec(text.trim().toLowerCase().replace(/\s+/g, ""));
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (minute > 59) return null;
  const meridiem = match[3];
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  } else if (hour >= 1 && hour <= 12 && !match[1].startsWith("0")) {
    const pm = Number(current.slice(0, 2)) >= 12;
    hour = hour === 12 ? 12 : hour + (pm ? 12 : 0);
  }
  return `${pad(hour)}:${pad(minute)}`;
}

/** Quarter-hour slots that start with what has been typed, in `label` form or 24-hour form. */
export function suggestTimes(text: string, label: (slot: string) => string): string[] {
  const typed = text.toLowerCase().replace(/[\s:.]/g, "");
  if (!typed) return QUARTER_HOURS;
  return QUARTER_HOURS.filter(
    (slot) => label(slot).toLowerCase().replace(/[\s:.]/g, "").startsWith(typed) || slot.replace(":", "").startsWith(typed),
  );
}
