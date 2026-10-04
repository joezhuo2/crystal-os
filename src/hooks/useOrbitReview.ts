import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAppLoading, useTasks, useTransactions } from "@/contexts/AppContext";
import { useVaultNotes } from "@/hooks/useVault";
import { useCalendarEvents, useCalendarStatus } from "@/hooks/useGoogleCalendar";
import {
  ORBIT_QUERY_KEY,
  buildReview,
  dataStart,
  latestReadyPeriod,
  periodContaining,
  periodStats,
  shiftPeriod,
  type CompletionRecord,
  type FocusRecord,
  type ReviewData,
  type ReviewKind,
  type ReviewPeriod,
} from "@/lib/orbitReview";
import { useOrbitStore } from "@/lib/orbitStore";
import { addDays, toLocalDateStr } from "@/lib/utils";

/** Matches CalendarPage's key, so the review reads the calendar picked there. */
const CALENDAR_STORAGE_KEY = "crystal-os-google-calendar";

function calendarId(): string {
  try {
    return localStorage.getItem(CALENDAR_STORAGE_KEY) ?? "primary";
  } catch {
    return "primary";
  }
}

/** Local midnight at the start of `day`, as an ISO instant. */
const startOfDay = (day: string) => new Date(`${day}T00:00:00`).toISOString();

/** Postgres "relation does not exist", or PostgREST's "table not in schema cache". */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

export class OrbitHistoryError extends Error {
  constructor(
    message: string,
    readonly missingTables: boolean,
  ) {
    super(message);
    this.name = "OrbitHistoryError";
  }
}

interface History {
  completions: CompletionRecord[];
  focus: FocusRecord[];
}

/** Completions and focus runs from `from` through `to` (local days, inclusive). */
async function fetchHistory(from: string, to: string): Promise<History> {
  const min = startOfDay(from);
  const max = startOfDay(addDays(to, 1));
  const [completions, focus] = await Promise.all([
    supabase
      .from("task_completions")
      .select("title, completed_at")
      .gte("completed_at", min)
      .lt("completed_at", max)
      .order("completed_at")
      .limit(10_000),
    supabase
      .from("focus_sessions")
      .select("ended_at, seconds")
      .gte("ended_at", min)
      .lt("ended_at", max)
      .order("ended_at")
      .limit(10_000),
  ]);
  const error = completions.error ?? focus.error;
  if (error) throw new OrbitHistoryError(error.message, isMissingTable(error));
  return {
    completions: (completions.data ?? []).map((r) => ({ title: r.title as string, completedAt: r.completed_at as string })),
    focus: (focus.data ?? []).map((r) => ({ endedAt: r.ended_at as string, seconds: Number(r.seconds) })),
  };
}

function useHistory(from: string, to: string, enabled = true) {
  return useQuery<History, Error>({
    queryKey: [...ORBIT_QUERY_KEY, "history", from, to],
    queryFn: () => fetchHistory(from, to),
    staleTime: 60 * 1000,
    retry: (count, error) => !(error instanceof OrbitHistoryError && error.missingTables) && count < 2,
    enabled,
  });
}

/** Every note in the vault, for counting new ones. Fails quietly when no vault is set up. */
function useAllNotes() {
  return useVaultNotes({ limit: 1_000_000 });
}

/** The current time, refreshed every minute, so ready times pass on their own. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface OrbitReviewResult {
  review: ReturnType<typeof buildReview> | null;
  loading: boolean;
  /** The history query failed; `missingTables` means 0003_orbit_review.sql is not applied. */
  historyError: OrbitHistoryError | Error | null;
  vaultUnavailable: boolean;
  calendarConnected: boolean;
}

/** Everything a review of `period` needs, assembled. */
export function useOrbitReview(period: ReviewPeriod): OrbitReviewResult {
  const tasks = useTasks();
  const transactions = useTransactions();
  const appLoading = useAppLoading();
  const history = useHistory(dataStart(period), period.end);
  const notes = useAllNotes();
  const status = useCalendarStatus();
  const connected = status.data?.connected === true;

  const next = shiftPeriod(period, 1);
  const range = useMemo(
    () => ({ calendarId: calendarId(), timeMin: startOfDay(next.start), timeMax: startOfDay(addDays(next.end, 1)) }),
    [next.start, next.end],
  );
  const events = useCalendarEvents(range, connected);

  const review = useMemo(() => {
    // Without the history tables the rest of the review still works.
    if (!history.data && !history.error) return null;
    const data: ReviewData = {
      completions: history.data?.completions ?? [],
      focus: history.data?.focus ?? [],
      tasks,
      transactions,
      notes: (notes.data?.notes ?? []).map((n) => ({ title: n.title, path: n.path, created: n.created ?? null })),
      events: events.data?.events ?? [],
    };
    return buildReview(period, data);
    // A period is a value: its key names it, so a fresh object with the same
    // key must not rebuild the review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.data, history.error, tasks, transactions, notes.data, events.data, period.kind, period.key]);

  return {
    review,
    loading:
      appLoading ||
      history.isLoading ||
      notes.isLoading ||
      status.isLoading ||
      (connected && events.isLoading),
    historyError: history.error ?? null,
    vaultUnavailable: notes.isError,
    calendarConnected: connected,
  };
}

/** Which reviews are ready and not yet opened, for the nav dot and Home chip. */
export function useOrbitReady(now: Date = new Date()): { weekly: ReviewPeriod; monthly: ReviewPeriod; unseen: ReviewKind[] } {
  const { seen } = useOrbitStore();
  const weekly = latestReadyPeriod("weekly", now);
  const monthly = latestReadyPeriod("monthly", now);
  const unseen: ReviewKind[] = [];
  if (seen.weekly !== weekly.key) unseen.push("weekly");
  if (seen.monthly !== monthly.key) unseen.push("monthly");
  return { weekly, monthly, unseen };
}

/** This week so far, for the Home card's one-line teaser. */
export function useOrbitTeaser(now: Date) {
  const tasks = useTasks();
  const transactions = useTransactions();
  const week = periodContaining("weekly", toLocalDateStr(now));
  const history = useHistory(week.start, week.end);
  if (!history.data && !history.error) return null;
  const { completions = [], focus = [] } = history.data ?? {};
  return periodStats(week, { completions, focus, tasks, transactions, notes: [], events: [] });
}
