import type { RepeatRule } from "@/lib/utils";

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

export function repeatInterval(rule: RepeatRule): number {
  switch (rule.kind) {
    case "days":
    case "after":
      return Math.max(1, rule.every);
    case "monthly":
      return 31;
    case "weekly": {
      const days = [...new Set(rule.weekdays)].sort((a, b) => a - b);
      if (!days.length) return 7;
      return Math.max(...days.map((d, i) => (i ? d - days[i - 1] : d + 7 - days[days.length - 1])));
    }
  }
}

export function completionStreak(dates: string[], interval: number, today: string): number {
  const days = [...new Set(dates)].sort().reverse();
  if (!days.length || day(today) - day(days[0]) > interval) return 0;
  let streak = 1;
  while (streak < days.length && day(days[streak - 1]) - day(days[streak]) <= interval) streak++;
  return streak;
}
