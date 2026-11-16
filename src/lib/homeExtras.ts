import { useSyncExternalStore } from "react";

const PROMPTS = [
  "What would make today a good day?",
  "What is the one thing you must finish today?",
  "What are you avoiding, and what is its first small step?",
  "What did you learn yesterday?",
  "Who could you thank today?",
  "What can you drop from today's list?",
  "What went well this week, and why?",
  "What is taking more energy than it should?",
  "What would you do today if it were easy?",
  "What are you looking forward to?",
  "What did you do recently that you are proud of?",
  "What would future you want you to do today?",
  "Where did your time go yesterday?",
  "What is one habit worth protecting today?",
];

export function journalPrompt(date: Date): string {
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86_400_000);
  return PROMPTS[dayOfYear % PROMPTS.length];
}

export const SECOND_ZONE_KEY = "crystal-os-home-second-zone";

export function isTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function zoneClock(date: Date, zone: string): { city: string; time: string } | null {
  if (!isTimeZone(zone)) return null;
  return {
    city: zone.slice(zone.lastIndexOf("/") + 1).replace(/_/g, " "),
    time: date.toLocaleTimeString("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

function loadZone(): string {
  try {
    return localStorage.getItem(SECOND_ZONE_KEY) ?? "";
  } catch {
    return "";
  }
}

let zone = loadZone();
const listeners = new Set<() => void>();

export const secondZone = {
  getState: () => zone,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(next: string) {
    zone = next;
    try {
      if (next) localStorage.setItem(SECOND_ZONE_KEY, next);
      else localStorage.removeItem(SECOND_ZONE_KEY);
    } catch {
      /* storage blocked: the choice still applies for this session */
    }
    listeners.forEach((l) => l());
  },
};

export function useSecondZone(): string {
  return useSyncExternalStore(secondZone.subscribe, secondZone.getState);
}

export function sparklinePath(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)} ${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");
}

export function runningTotal(values: readonly number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}

export const MAIL_SEEN_KEY = "crystal-os-mail-seen-at";

export function mailSeenAt(): string {
  try {
    return localStorage.getItem(MAIL_SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function markMailSeen(now: Date = new Date()) {
  try {
    localStorage.setItem(MAIL_SEEN_KEY, now.toISOString());
  } catch {
    /* storage blocked: the count just stays */
  }
}

export function newMailCount(items: readonly { receivedAt: string }[], seenAt: string): number {
  return seenAt ? items.filter((m) => m.receivedAt > seenAt).length : items.length;
}
