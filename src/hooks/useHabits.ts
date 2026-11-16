import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/localDb";
import { useAuth } from "@/contexts/AuthContext";
import { HABIT_NAME_MAX, HABIT_UNIT_MAX, isPartial, sortHabits, type Habit, type HabitCheck } from "@/lib/habits";
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
  weekdays?: number[] | null;
  weekly_target?: number | null;
  target?: number | null;
  unit?: string | null;
}

const HABIT_COLUMNS = "id, name, color, position, created_at, archived_at, weekdays, weekly_target, target, unit";

const fromRow = (r: HabitRow): Habit => ({
  id: r.id,
  name: r.name,
  color: r.color,
  position: r.position,
  createdAt: r.created_at,
  archivedAt: r.archived_at,
  weekdays: r.weekdays ?? null,
  weeklyTarget: r.weekly_target ?? null,
  target: r.target ?? null,
  unit: r.unit ?? null,
});

const toCheck = (habitId: string, day: string, amount: unknown, target: number | null | undefined): HabitCheck =>
  typeof amount === "number" ? { habitId, day, amount, partial: isPartial(target, amount) } : { habitId, day };

async function fetchHabits(): Promise<HabitsData> {
  const [habits, checks] = await Promise.all([
    db.from("habits").select(HABIT_COLUMNS),
    // A few habits a day for years is still well under this.
    db.from("habit_checks").select("habit_id, day, amount").order("day").limit(50_000),
  ]);
  const error = habits.error ?? checks.error;
  if (error) throw new HabitsError(error.message, isMissingTable(error));
  const list = sortHabits(((habits.data ?? []) as HabitRow[]).map(fromRow));
  const targets = new Map(list.map((h) => [h.id, h.target]));
  return {
    habits: list,
    checks: (checks.data ?? []).map((r) => toCheck(r.habit_id as string, r.day as string, r.amount, targets.get(r.habit_id as string))),
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
        ? await db.from("habit_checks").upsert({ habit_id: habitId, day }, { onConflict: "habit_id,day", ignoreDuplicates: true })
        : await db.from("habit_checks").delete().eq("habit_id", habitId).eq("day", day);
      if (error) {
        undo();
        fail(done ? "tick the habit" : "untick the habit", error);
      }
    },
    [patch],
  );

  /** Logs today's amount for a habit with a target; 0 clears it. */
  const setAmount = useCallback(
    async (habitId: string, amount: number) => {
      const day = toLocalDateStr();
      const logged = Math.max(0, Math.round(amount));
      const undo = patch((d) => {
        const rest = d.checks.filter((c) => !(c.habitId === habitId && c.day === day));
        const target = d.habits.find((h) => h.id === habitId)?.target;
        return { ...d, checks: logged ? [...rest, toCheck(habitId, day, logged, target)] : rest };
      });
      const { error } = logged
        ? await db.from("habit_checks").upsert({ habit_id: habitId, day, amount: logged }, { onConflict: "habit_id,day" })
        : await db.from("habit_checks").delete().eq("habit_id", habitId).eq("day", day);
      if (error) {
        undo();
        fail("log the habit", error);
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
      const { data: row, error } = await db
        .from("habits")
        .insert({ name: clean, color, position })
        .select(HABIT_COLUMNS)
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
    async (
      id: string,
      changes: {
        name?: string;
        color?: string;
        weekdays?: number[] | null;
        weeklyTarget?: number | null;
        target?: number | null;
        unit?: string | null;
      },
    ) => {
      const next = { ...changes };
      if (next.name !== undefined) {
        next.name = next.name.trim().slice(0, HABIT_NAME_MAX);
        if (!next.name) return;
      }
      if (next.unit != null) next.unit = next.unit.trim().slice(0, HABIT_UNIT_MAX) || null;
      const undo = patch((d) => ({
        habits: d.habits.map((h) => (h.id === id ? { ...h, ...next } : h)),
        // A new target changes which logged days fall short of it.
        checks:
          next.target === undefined
            ? d.checks
            : d.checks.map((c) => (c.habitId === id ? toCheck(c.habitId, c.day, c.amount, next.target) : c)),
      }));
      const { weeklyTarget, ...row } = next;
      const { error } = await db
        .from("habits")
        .update({ ...row, ...(weeklyTarget !== undefined ? { weekly_target: weeklyTarget } : {}) })
        .eq("id", id);
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
      const { error } = await db.from("habits").update({ archived_at: archivedAt }).eq("id", id);
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
        changed.map((id) => db.from("habits").update({ position: ids.indexOf(id) }).eq("id", id)),
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
    () => ({ setToday, setAmount, addHabit, updateHabit, archiveHabit, reorderHabits }),
    [setToday, setAmount, addHabit, updateHabit, archiveHabit, reorderHabits],
  );
}
