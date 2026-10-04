import React, { createContext, useContext, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { pomodoro } from "@/lib/pomodoro";
import { ORBIT_QUERY_KEY } from "@/lib/orbitReview";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cleanRepeat, completionUpdates, normalizeRepeat, toLocalDateStr, type RepeatRule } from "@/lib/utils";
import {
  seedDefaultCategories,
  shouldSeedCategories,
  type CategoryClient,
  type CategoryTable,
} from "@/lib/seedCategories";
import { ascNullsLast, loadInPages, mergePage } from "@/lib/pagedLoad";
import { appUi } from "@/lib/appUi";

export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskCategory = {
  id: string;
  name: string;
  color: string;
};

export type Task = {
  id: string;
  name: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  priority: Priority;
  categoryId: string;
  completed: boolean;
  repeat?: RepeatRule;
  /** When the task was added (ISO). Read-only: set by the database. */
  createdAt?: string;
};

export type Transaction = {
  id: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  categoryId: string;
  date: string;
};

export type FinancialCategory = {
  id: string;
  name: string;
  color: string;
};

/**
 * Every write the app makes to tasks, transactions and categories. Each one is
 * a stable callback, so the context value never changes after mount and
 * reading it never re-renders a component.
 */
export type AppActions = {
  addTask: (task: Omit<Task, "id">) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  /** Marks a task done today, or moves an "after completion" repeat to its next date. */
  completeTask: (task: Task) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addTaskCategory: (cat: Omit<TaskCategory, "id">) => void;
  deleteTaskCategory: (id: string) => void;
  addFinancialCategory: (cat: Omit<FinancialCategory, "id">) => void;
  deleteFinancialCategory: (id: string) => void;
};

const defaultTaskCategories: TaskCategory[] = [
  { id: "work", name: "Work", color: "hsl(239 84% 67%)" },
  { id: "personal", name: "Personal", color: "hsl(160 84% 39%)" },
  { id: "health", name: "Health", color: "hsl(340 82% 52%)" },
  { id: "learning", name: "Learning", color: "hsl(45 93% 47%)" },
];

const defaultFinancialCategories: FinancialCategory[] = [
  { id: "salary", name: "Salary", color: "hsl(160 84% 39%)" },
  { id: "food", name: "Food & Dining", color: "hsl(25 95% 53%)" },
  { id: "transport", name: "Transport", color: "hsl(239 84% 67%)" },
  { id: "entertainment", name: "Entertainment", color: "hsl(340 82% 52%)" },
  { id: "utilities", name: "Utilities", color: "hsl(45 93% 47%)" },
  { id: "coffee", name: "Coffee", color: "hsl(30 60% 40%)" },
];

const AppActionsContext = createContext<AppActions | null>(null);

// ── data lives in the React Query cache ──
//
// Nothing fetches these keys through React Query: AppProvider loads them and
// every write updates them with setQueryData. Views read them with useQuery
// and `select`, so a view re-renders only when the slice it selects changes
// (structural sharing keeps an unchanged slice's reference), not on every
// edit anywhere in the list.

export const APP_DATA_KEYS = {
  tasks: ["app", "tasks"],
  transactions: ["app", "transactions"],
  taskCategories: ["app", "taskCategories"],
  financialCategories: ["app", "financialCategories"],
  loading: ["app", "loading"],
} as const;

const EMPTY_TASKS: Task[] = [];
const EMPTY_TRANSACTIONS: Transaction[] = [];

function useAppData<T, S = T>(key: readonly string[], initial: T, select?: (data: T) => S): S {
  const { data } = useQuery<T, Error, S>({
    queryKey: key,
    enabled: false,
    initialData: initial,
    select,
  });
  return data as S;
}

/** All tasks, or the slice `select` returns. Keep `select` cheap or memoise it. */
export function useTasks(): Task[];
export function useTasks<S>(select: (tasks: Task[]) => S): S;
export function useTasks<S>(select?: (tasks: Task[]) => S) {
  return useAppData(APP_DATA_KEYS.tasks, EMPTY_TASKS, select);
}

/** All transactions (newest first), or the slice `select` returns. */
export function useTransactions(): Transaction[];
export function useTransactions<S>(select: (transactions: Transaction[]) => S): S;
export function useTransactions<S>(select?: (transactions: Transaction[]) => S) {
  return useAppData(APP_DATA_KEYS.transactions, EMPTY_TRANSACTIONS, select);
}

export function useTaskCategories(): TaskCategory[] {
  return useAppData(APP_DATA_KEYS.taskCategories, defaultTaskCategories);
}

export function useFinancialCategories(): FinancialCategory[] {
  return useAppData(APP_DATA_KEYS.financialCategories, defaultFinancialCategories);
}

/** True until the first page of tasks and transactions and the categories are in. */
export function useAppLoading(): boolean {
  return useAppData(APP_DATA_KEYS.loading, true);
}

export function useAppActions(): AppActions {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error("useAppActions must be used within AppProvider");
  return ctx;
}

/**
 * Holds every app key while AppProvider is mounted. The keys have no queryFn,
 * so the cache must never drop them: a moment with no view reading tasks (or
 * performance mode's one-minute gcTime) would otherwise empty the list.
 * Tracks no result fields, so it never re-renders the provider.
 */
function useKeepAppData() {
  const keep = { enabled: false, notifyOnChangeProps: [] };
  useQuery({ queryKey: APP_DATA_KEYS.tasks, initialData: EMPTY_TASKS, ...keep });
  useQuery({ queryKey: APP_DATA_KEYS.transactions, initialData: EMPTY_TRANSACTIONS, ...keep });
  useQuery({ queryKey: APP_DATA_KEYS.taskCategories, initialData: defaultTaskCategories, ...keep });
  useQuery({ queryKey: APP_DATA_KEYS.financialCategories, initialData: defaultFinancialCategories, ...keep });
  useQuery({ queryKey: APP_DATA_KEYS.loading, initialData: true, ...keep });
}

/** setState-style writers over the cache keys. */
function cacheSetters(client: QueryClient) {
  const setter =
    <T,>(key: readonly string[], empty: T) =>
    (next: T | ((prev: T) => T)) =>
      client.setQueryData<T>(key, (prev) =>
        typeof next === "function" ? (next as (prev: T) => T)(prev ?? empty) : next,
      );
  return {
    setTasks: setter<Task[]>(APP_DATA_KEYS.tasks, EMPTY_TASKS),
    setTransactions: setter<Transaction[]>(APP_DATA_KEYS.transactions, EMPTY_TRANSACTIONS),
    setTaskCategories: setter<TaskCategory[]>(APP_DATA_KEYS.taskCategories, defaultTaskCategories),
    setFinancialCategories: setter<FinancialCategory[]>(
      APP_DATA_KEYS.financialCategories,
      defaultFinancialCategories,
    ),
    setLoading: setter<boolean>(APP_DATA_KEYS.loading, true),
  };
}

// ── helpers to map between Supabase snake_case and app camelCase ──

type TaskRow = ReturnType<typeof mapTaskToDb> & { id: string; created_at?: string };
type TransactionRow = ReturnType<typeof mapTransactionToDb> & { id: string };
type CategoryRow = ReturnType<typeof mapCategoryToDb> & { id: string };

function mapTaskFromDb(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    endTime: row.end_time,
    priority: row.priority,
    categoryId: row.category_id,
    completed: row.completed,
    repeat: normalizeRepeat(row.repeat_kind, row.repeat_days, row.repeat_weekdays),
    createdAt: row.created_at,
  };
}

function mapTaskToDb(task: Omit<Task, "id">) {
  return {
    name: task.name,
    start_date: task.startDate,
    start_time: task.startTime,
    end_date: task.endDate,
    end_time: task.endTime,
    priority: task.priority,
    category_id: task.categoryId,
    completed: task.completed,
    ...mapRepeatToDb(task.repeat),
  };
}

/**
 * The three repeat columns for a rule. Every column is always written, nulls
 * included, so switching kinds or turning a repeat off leaves nothing stale
 * behind for the next load to pick up.
 */
function mapRepeatToDb(rule: RepeatRule | undefined) {
  const clean = cleanRepeat(rule);
  return {
    repeat_kind: (clean?.kind ?? null) as RepeatRule["kind"] | null,
    repeat_days: (clean && "every" in clean ? clean.every : null) as number | null,
    repeat_weekdays: (clean?.kind === "weekly" ? clean.weekdays : null) as number[] | null,
  };
}

function mapTransactionFromDb(row: TransactionRow): Transaction {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    type: row.type,
    categoryId: row.category_id,
    date: row.date,
  };
}

function mapTransactionToDb(tx: Omit<Transaction, "id">) {
  return {
    name: tx.name,
    amount: tx.amount,
    type: tx.type,
    category_id: tx.categoryId,
    date: tx.date,
  };
}

function mapCategoryFromDb(row: CategoryRow): TaskCategory | FinancialCategory {
  return { id: row.id, name: row.name, color: row.color };
}

function mapCategoryToDb(cat: Omit<TaskCategory, "id">) {
  return { name: cat.name, color: cat.color };
}

// ── paged initial load ──

type DbRow = { id: string } & Record<string, unknown>;

/** One keyset page of a table: rows after `afterId`, in id order. */
function fetchPage(table: "tasks" | "transactions", afterId: string | null, limit: number) {
  const query = supabase.from(table).select("*");
  return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
}

// Pages arrive in id order, so each merge re-sorts into the order the single
// query used to return: tasks earliest first, transactions newest first.
const byStart = (a: Task, b: Task) =>
  ascNullsLast(a.startDate, b.startDate) || ascNullsLast(a.startTime, b.startTime);
const byDateDesc = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date);

/**
 * Reports a failed write instead of discarding it. Every mutation below used to
 * check `if (!error)` and do nothing when the write was rejected, which is how a
 * rejected insert could close a form and leave no trace anywhere.
 */
function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false;
  console.error(`[crystal-os] ${action} failed:`, error.message);
  toast.error(`Could not ${action}`, { description: error.message });
  return true;
}

/**
 * Returns the user's categories, creating the starter set the first time they
 * sign in. Falls back to the in-memory defaults only if the fetch or seeding
 * fails, so the UI still renders — writes referencing them will fail loudly
 * rather than silently, which is the behaviour this replaced.
 */
async function resolveCategories<T extends TaskCategory | FinancialCategory>(
  res: { data: unknown[] | null; error: { message: string } | null },
  table: CategoryTable,
  defaults: T[],
): Promise<T[]> {
  if (!shouldSeedCategories(res)) {
    if (res.data) return res.data.map(mapCategoryFromDb) as T[];
    // A failed fetch is not an empty table: seeding here duplicated every
    // category on each failed load.
    reportError("load your categories", res.error);
    return defaults;
  }

  const seeded = await seedDefaultCategories(
    supabase as unknown as CategoryClient,
    table,
    defaults.map(({ name, color }) => ({ name, color })),
  );

  if (seeded) return seeded.map(mapCategoryFromDb) as T[];

  toast.error("Could not create your starter categories", {
    description: "Adding items may fail until this is resolved. Check the console.",
  });
  return defaults;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  useKeepAppData();
  const { setTasks, setTransactions, setTaskCategories, setFinancialCategories, setLoading } =
    useMemo(() => cacheSetters(queryClient), [queryClient]);

  // Signing out must not hand the next session this one's data while it
  // loads, or reopen the forms and dialogs it left open.
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: ["app"] });
      appUi.reset();
    },
    [queryClient],
  );

  // ── Fetch all data when a user is present ──
  //
  // No .eq("user_id", …) filters appear anywhere below. RLS does that
  // server-side, and duplicating it here would be a second place to get wrong.
  useEffect(() => {
    if (!user) {
      // Signing out must not leave the previous session's tasks on screen
      // while the login form animates in.
      setTasks([]);
      setTransactions([]);
      setTaskCategories(defaultTaskCategories);
      setFinancialCategories(defaultFinancialCategories);
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      setTasks([]);
      setTransactions([]);

      // Tasks and transactions arrive in pages rather than one query each, so
      // the dashboard renders once the first page is in and fills in behind it.
      const isActive = () => active;
      const tasksLoad = loadInPages<DbRow>(
        (afterId, limit) => fetchPage("tasks", afterId, limit),
        (rows) => setTasks((prev) => mergePage(prev, rows.map(mapTaskFromDb), byStart)),
        { isActive },
      );
      const txLoad = loadInPages<DbRow>(
        (afterId, limit) => fetchPage("transactions", afterId, limit),
        (rows) =>
          setTransactions((prev) => mergePage(prev, rows.map(mapTransactionFromDb), byDateDesc)),
        { isActive },
      );

      const [, , taskCatRes, finCatRes] = await Promise.all([
        tasksLoad.firstPage,
        txLoad.firstPage,
        supabase.from("task_categories").select("*").order("name"),
        supabase.from("financial_categories").select("*").order("name"),
      ]);

      if (!active) return;

      // A category has to be a real row before a task can reference it: the
      // starter set below used to live only in memory with ids like "work",
      // which a uuid column rejects. On an empty table, create them and adopt
      // the ids the database assigns.
      setTaskCategories(
        await resolveCategories(taskCatRes, "task_categories", defaultTaskCategories),
      );
      setFinancialCategories(
        await resolveCategories(
          finCatRes,
          "financial_categories",
          defaultFinancialCategories,
        ),
      );

      setLoading(false);

      // A failed page leaves the list short, which must not pass for "that's
      // everything".
      const [tasksError, txError] = await Promise.all([tasksLoad.done, txLoad.done]);
      if (!active) return;
      reportError("load all of your tasks", tasksError);
      reportError("load all of your transactions", txError);
    }

    void load();
    return () => {
      active = false;
    };
    // Keyed on user.id, not on user. Supabase hands back a new user object on
    // every hourly token refresh, so depending on the object itself would
    // refetch the whole dashboard once an hour for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Focus history for The Orbit ──
  // The Pomodoro store lives outside React; while someone is signed in, each
  // finished focus run is saved as a focus_sessions row.
  useEffect(() => {
    if (!user) return;
    pomodoro.setRecorder(({ startedAt, endedAt, seconds }) => {
      void supabase
        .from("focus_sessions")
        .insert({ started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(), seconds })
        .then(({ error }) => {
          if (reportError("save your focus time", error)) return;
          queryClient.invalidateQueries({ queryKey: ORBIT_QUERY_KEY });
        });
    });
    return () => pomodoro.setRecorder(null);
  }, [user, queryClient]);

  // ── Completion history for The Orbit ──
  const recordCompletion = useCallback(
    async (task: Task) => {
      const { error } = await supabase
        .from("task_completions")
        .insert({ task_id: task.id, title: task.name, category_id: task.categoryId || null });
      if (reportError("record the completion", error)) return;
      queryClient.invalidateQueries({ queryKey: ORBIT_QUERY_KEY });
    },
    [queryClient],
  );

  const forgetCompletion = useCallback(
    async (taskId: string) => {
      const { data, error } = await supabase
        .from("task_completions")
        .select("id")
        .eq("task_id", taskId)
        .order("completed_at", { ascending: false })
        .limit(1);
      if (reportError("update the completion history", error) || !data?.length) return;
      const { error: deleteError } = await supabase.from("task_completions").delete().eq("id", data[0].id);
      if (reportError("update the completion history", deleteError)) return;
      queryClient.invalidateQueries({ queryKey: ORBIT_QUERY_KEY });
    },
    [queryClient],
  );

  // ── Tasks ──
  const addTask = useCallback(async (task: Omit<Task, "id">) => {
    const { data, error } = await supabase.from("tasks").insert(mapTaskToDb(task)).select().single();
    if (reportError("add the task", error) || !data) return;
    setTasks((prev) => [...prev, mapTaskFromDb(data)]);
  }, [setTasks]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const dbUpdates: Partial<TaskRow> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
    if (updates.completed !== undefined) dbUpdates.completed = updates.completed;
    // Unlike the other fields, an explicit `repeat` key is written even when
    // it is undefined: that is how a repeat is turned off, and the columns have
    // to be cleared to null for it to stay off after a reload.
    const repeatChanged = "repeat" in updates;
    const repeat = cleanRepeat(updates.repeat);
    if (repeatChanged) Object.assign(dbUpdates, mapRepeatToDb(repeat));

    const { error } = await supabase.from("tasks").update(dbUpdates).eq("id", id);
    if (reportError("update the task", error)) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, ...(repeatChanged ? { repeat } : {}) } : t)),
    );
    // Unticking takes back the tick's history row, so a misclick is not
    // counted as done in The Orbit.
    if (updates.completed === false) void forgetCompletion(id);
  }, [forgetCompletion, setTasks]);

  const completeTask = useCallback(
    (task: Task) => {
      const updates = completionUpdates(task, toLocalDateStr());
      updateTask(task.id, updates);
      void recordCompletion(task);
      if ("startDate" in updates) {
        const next = new Date(`${updates.startDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        toast.success(`${task.name} done`, { description: `Next due ${next}` });
      }
    },
    [updateTask, recordCompletion],
  );

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (reportError("delete the task", error)) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, [setTasks]);

  // ── Transactions ──
  const addTransaction = useCallback(async (tx: Omit<Transaction, "id">) => {
    const { data, error } = await supabase.from("transactions").insert(mapTransactionToDb(tx)).select().single();
    if (reportError("add the transaction", error) || !data) return;
    setTransactions((prev) => [...prev, mapTransactionFromDb(data)]);
  }, [setTransactions]);

  const updateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    const dbUpdates: Partial<TransactionRow> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
    if (updates.date !== undefined) dbUpdates.date = updates.date;

    const { error } = await supabase.from("transactions").update(dbUpdates).eq("id", id);
    if (reportError("update the transaction", error)) return;
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, [setTransactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (reportError("delete the transaction", error)) return;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, [setTransactions]);

  // ── Task Categories ──
  const addTaskCategory = useCallback(async (cat: Omit<TaskCategory, "id">) => {
    const { data, error } = await supabase.from("task_categories").insert(mapCategoryToDb(cat)).select().single();
    if (reportError("add the category", error) || !data) return;
    setTaskCategories((prev) => [...prev, mapCategoryFromDb(data) as TaskCategory]);
  }, [setTaskCategories]);

  const deleteTaskCategory = useCallback(async (id: string) => {
    const { error } = await supabase.from("task_categories").delete().eq("id", id);
    if (reportError("delete the category", error)) return;
    setTaskCategories((prev) => prev.filter((c) => c.id !== id));
  }, [setTaskCategories]);

  // ── Financial Categories ──
  const addFinancialCategory = useCallback(async (cat: Omit<FinancialCategory, "id">) => {
    const { data, error } = await supabase.from("financial_categories").insert(mapCategoryToDb(cat)).select().single();
    if (reportError("add the category", error) || !data) return;
    setFinancialCategories((prev) => [...prev, mapCategoryFromDb(data) as FinancialCategory]);
  }, [setFinancialCategories]);

  const deleteFinancialCategory = useCallback(async (id: string) => {
    const { error } = await supabase.from("financial_categories").delete().eq("id", id);
    if (reportError("delete the category", error)) return;
    setFinancialCategories((prev) => prev.filter((c) => c.id !== id));
  }, [setFinancialCategories]);

  const actions = useMemo<AppActions>(
    () => ({
      addTask, updateTask, deleteTask, completeTask, addTransaction, updateTransaction, deleteTransaction,
      addTaskCategory, deleteTaskCategory, addFinancialCategory, deleteFinancialCategory,
    }),
    [addTask, updateTask, deleteTask, completeTask, addTransaction, updateTransaction, deleteTransaction,
     addTaskCategory, deleteTaskCategory, addFinancialCategory, deleteFinancialCategory]
  );

  return <AppActionsContext.Provider value={actions}>{children}</AppActionsContext.Provider>;
};
