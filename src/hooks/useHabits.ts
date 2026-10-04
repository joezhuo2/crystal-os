import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { HABIT_NAME_MAX, sortHabits, type Habit, type HabitCheck } from "@/lib/habits";
import { toLocalDateStr } from "@/lib/utils";

/** Under ["app"], so signing out clears it with the tasks and transactions. */
export const HABITS_QUERY_KEY = ["app", "habits"] as const;

export interface HabitsData {
  /** Every habit, archived ones included, in manager order. */
  habits: Habit[];
  checks: HabitCheck[];
}

/** Postgres "relation does not exist", or PostgREST's "table not in schema cache". */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

export class HabitsError extends Error {
  constructor(
    message: string,
    /** 0004_habits.sql has not been applied. */
    readonly missingTables: boolean,
  ) {
    super(message);
    this.name = "HabitsError";
  }
}

interface HabitRow {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  archived_at: string | null;
}

const fromRow = (r: HabitRow): Habit => ({
  id: r.id,
  name: r.name,
  color: r.color,
  position: r.position,
  createdAt: r.created_at,
  archivedAt: r.archived_at,
});

async function fetchHabits(): Promise<HabitsData> {
  const [habits, checks] = await Promise.all([
    supabase.from("habits").select("id, name, color, position, created_at, archived_at"),
    // A few habits a day for years is still well under this.
    supabase.from("habit_checks").select("habit_id, day").order("day").limit(50_000),
  ]);
  const error = habits.error ?? checks.error;
  if (error) throw new HabitsError(error.message, isMissingTable(error));
  return {
    habits: sortHabits(((habits.data ?? []) as HabitRow[]).map(fromRow)),
    checks: (checks.data ?? []).map((r) => ({ habitId: r.habit_id as string, day: r.day as string })),
  };
}

/** Every habit and check-off, shared by the Today card and the reviews. */
export function useHabitsData() {
  const { user } = useAuth();
  return useQuery<HabitsData, Error>({
    queryKey: HABITS_QUERY_KEY,
    queryFn: fetchHabits,
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => !(error instanceof HabitsError && error.missingTables) && count < 2,
    enabled: !!user,
  });
}

function fail(action: string, error: { message: string }) {
  console.error(`[crystal-os] ${action} failed:`, error.message);
  toast.error(`Could not ${action}`, { description: error.message });
}

/**
 * Writes for habits. Each one updates the cache first and puts it back if the
 * write fails, so ticks and edits show at once.
 */
export function useHabitActions() {
  const queryClient = useQueryClient();

  const patch = useCallback(
    (fn: (data: HabitsData) => HabitsData) => {
      const before = queryClient.getQueryData<HabitsData>(HABITS_QUERY_KEY);
      if (before) queryClient.setQueryData<HabitsData>(HABITS_QUERY_KEY, fn(before));
      return () => {
        if (before) queryClient.setQueryData(HABITS_QUERY_KEY, before);
      };
    },
    [queryClient],
  );

  const refetch = useCallback(() => queryClient.invalidateQueries({ queryKey: HABITS_QUERY_KEY }), [queryClient]);

  /** Tick or untick a habit for today. Only today can be changed. */
  const setToday = useCallback(
    async (habitId: string, done: boolean) => {
      const day = toLocalDateStr();
      const undo = patch((d) => ({
        ...d,
        checks: done
          ? d.checks.some((c) => c.habitId === habitId && c.day === day)
            ? d.checks
            : [...d.checks, { habitId, day }]
          : d.checks.filter((c) => !(c.habitId === habitId && c.day === day)),
      }));
      const { error } = done
        ? await supabase.from("habit_checks").upsert({ habit_id: habitId, day }, { onConflict: "habit_id,day", ignoreDuplicates: true })
        : await supabase.from("habit_checks").delete().eq("habit_id", habitId).eq("day", day);
      if (error) {
        undo();
        fail(done ? "tick the habit" : "untick the habit", error);
      }
    },
    [patch],
  );

  const addHabit = useCallback(
    async (name: string, color: string) => {
      const clean = name.trim().slice(0, HABIT_NAME_MAX);
      if (!clean) return;
      const data = queryClient.getQueryData<HabitsData>(HABITS_QUERY_KEY);
      const position = Math.max(-1, ...(data?.habits ?? []).filter((h) => !h.archivedAt).map((h) => h.position)) + 1;
      const { data: row, error } = await supabase
        .from("habits")
        .insert({ name: clean, color, position })
        .select("id, name, color, position, created_at, archived_at")
        .single();
      if (error || !row) {
        if (error) fail("add the habit", error);
        return;
      }
      patch((d) => ({ ...d, habits: sortHabits([...d.habits, fromRow(row as HabitRow)]) }));
    },
    [patch, queryClient],
  );

  const updateHabit = useCallback(
    async (id: string, changes: { name?: string; color?: string }) => {
      const next = { ...changes };
      if (next.name !== undefined) {
        next.name = next.name.trim().slice(0, HABIT_NAME_MAX);
        if (!next.name) return;
      }
      const undo = patch((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, ...next } : h)) }));
      const { error } = await supabase.from("habits").update(next).eq("id", id);
      if (error) {
        undo();
        fail("update the habit", error);
      }
    },
    [patch],
  );

  /** Hides the habit from today on; its past check-offs stay in the reviews. */
  const archiveHabit = useCallback(
    async (id: string) => {
      const archivedAt = new Date().toISOString();
      const undo = patch((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, archivedAt } : h)) }));
      const { error } = await supabase.from("habits").update({ archived_at: archivedAt }).eq("id", id);
      if (error) {
        undo();
        fail("remove the habit", error);
      }
    },
    [patch],
  );

  /** Saves a new order for the active habits: `ids` top to bottom. */
  const reorderHabits = useCallback(
    async (ids: string[]) => {
      const data = queryClient.getQueryData<HabitsData>(HABITS_QUERY_KEY);
      const changed = ids.filter((id, i) => data?.habits.find((h) => h.id === id)?.position !== i);
      if (!changed.length) return;
      const undo = patch((d) => ({
        ...d,
        habits: sortHabits(d.habits.map((h) => (ids.includes(h.id) ? { ...h, position: ids.indexOf(h.id) } : h))),
      }));
      const results = await Promise.all(
        changed.map((id) => supabase.from("habits").update({ position: ids.indexOf(id) }).eq("id", id)),
      );
      const error = results.find((r) => r.error)?.error;
      if (error) {
        undo();
        fail("reorder the habits", error);
        void refetch();
      }
    },
    [patch, queryClient, refetch],
  );

  return useMemo(
    () => ({ setToday, addHabit, updateHabit, archiveHabit, reorderHabits }),
    [setToday, addHabit, updateHabit, archiveHabit, reorderHabits],
  );
}
