import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import type { Task } from "@/contexts/AppContext";
import { db } from "@/lib/localDb";
import { ORBIT_QUERY_KEY } from "@/lib/orbitReview";
import { completionStreak, repeatInterval } from "@/lib/repeatHistory";
import { formatSnoozeDate } from "@/lib/snooze";
import { cleanRepeat, toLocalDateStr } from "@/lib/utils";

const SHOWN = 5;

export function TaskRepeatHistory({ task, today }: { task: Task; today: string }) {
  const rule = cleanRepeat(task.repeat);
  const { data: dates } = useQuery({
    queryKey: [...ORBIT_QUERY_KEY, "task-history", task.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("task_completions")
        .select("completed_at")
        .eq("task_id", task.id)
        .order("completed_at", { ascending: false })
        .limit(400);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => toLocalDateStr(new Date(r.completed_at as string)));
    },
    enabled: !!rule,
  });
  if (!rule || !dates) return null;
  if (!dates.length) return <p className="text-[11px] text-muted-foreground">Not completed yet.</p>;

  const streak = completionStreak(dates, repeatInterval(rule), today);
  return (
    <div className="space-y-0.5 text-[11px] text-muted-foreground" role="group" aria-label="Completion history">
      <p className="flex items-center gap-1">
        <Flame className={`w-3 h-3 ${streak > 1 ? "text-amber-400" : ""}`} />
        <span>
          {streak} in a row · done {dates.length} time{dates.length === 1 ? "" : "s"}
        </span>
      </p>
      <p>Last: {dates.slice(0, SHOWN).map((d) => formatSnoozeDate(d, today)).join(" · ")}</p>
    </div>
  );
}
