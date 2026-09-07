import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  seedDefaultCategories,
  type CategoryClient,
  type CategoryTable,
} from "@/lib/seedCategories";

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
  repeatDays?: number;
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

type AppState = {
  tasks: Task[];
  transactions: Transaction[];
  taskCategories: TaskCategory[];
  financialCategories: FinancialCategory[];
  dailyFocus: string;
  loading: boolean;
  addTask: (task: Omit<Task, "id">) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  setDailyFocus: (focus: string) => void;
  addTaskCategory: (cat: Omit<TaskCategory, "id">) => void;
  deleteTaskCategory: (id: string) => void;
  addFinancialCategory: (cat: Omit<FinancialCategory, "id">) => void;
  deleteFinancialCategory: (id: string) => void;
  showTaskForm: boolean;
  setShowTaskForm: (show: boolean) => void;
  showTransactionForm: boolean;
  setShowTransactionForm: (show: boolean) => void;
  editingTask: Task | null;
  setEditingTask: (task: Task | null) => void;
  editingTransaction: Transaction | null;
  setEditingTransaction: (tx: Transaction | null) => void;
  /** Vault note the Archive page should open. UI-only, never persisted. */
  selectedNotePath: string | null;
  setSelectedNotePath: (path: string | null) => void;
  showQuickAdd: boolean;
  setShowQuickAdd: (show: boolean) => void;
  /** Requests that the Horizon open its "New Event" form. UI-only, never persisted. */
  showEventForm: boolean;
  setShowEventForm: (show: boolean) => void;
  /** Seeds the Quick Add dialog, e.g. with whatever was typed in the palette. */
  quickAddDraft: string;
  setQuickAddDraft: (text: string) => void;
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

const AppContext = createContext<AppState | null>(null);

// ── helpers to map between Supabase snake_case and app camelCase ──

function mapTaskFromDb(row: any): Task {
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
    repeatDays: row.repeat_days ?? undefined,
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
    repeat_days: task.repeatDays ?? null,
  };
}

function mapTransactionFromDb(row: any): Transaction {
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

function mapCategoryFromDb(row: any): TaskCategory | FinancialCategory {
  return { id: row.id, name: row.name, color: row.color };
}

function mapCategoryToDb(cat: Omit<TaskCategory, "id">) {
  return { name: cat.name, color: cat.color };
}

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
 * sign in. Falls back to the in-memory defaults only if seeding fails, so the
 * UI still renders — writes referencing them will fail loudly rather than
 * silently, which is the behaviour this replaced.
 */
async function resolveCategories<T extends TaskCategory | FinancialCategory>(
  rows: unknown[] | null,
  table: CategoryTable,
  defaults: T[],
): Promise<T[]> {
  if (rows && rows.length > 0) return rows.map(mapCategoryFromDb) as T[];

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>(defaultTaskCategories);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategory[]>(defaultFinancialCategories);
  const [dailyFocus, setDailyFocusState] = useState("");
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [quickAddDraft, setQuickAddDraft] = useState("");

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
      setDailyFocusState("");
      setLoading(false);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      const [tasksRes, txRes, taskCatRes, finCatRes, settingsRes] = await Promise.all([
        supabase.from("tasks").select("*").order("start_date").order("start_time"),
        supabase.from("transactions").select("*").order("date", { ascending: false }),
        supabase.from("task_categories").select("*").order("name"),
        supabase.from("financial_categories").select("*").order("name"),
        supabase.from("settings").select("*").eq("key", "daily_focus").maybeSingle(),
      ]);

      if (!active) return;

      if (tasksRes.data) setTasks(tasksRes.data.map(mapTaskFromDb));
      if (txRes.data) setTransactions(txRes.data.map(mapTransactionFromDb));

      // A category has to be a real row before a task can reference it: the
      // starter set below used to live only in memory with ids like "work",
      // which a uuid column rejects. On an empty table, create them and adopt
      // the ids the database assigns.
      setTaskCategories(
        await resolveCategories(taskCatRes.data, "task_categories", defaultTaskCategories),
      );
      setFinancialCategories(
        await resolveCategories(
          finCatRes.data,
          "financial_categories",
          defaultFinancialCategories,
        ),
      );

      if (settingsRes.data) setDailyFocusState(settingsRes.data.value ?? "");

      setLoading(false);
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

  // ── Tasks ──
  const addTask = useCallback(async (task: Omit<Task, "id">) => {
    const { data, error } = await supabase.from("tasks").insert(mapTaskToDb(task)).select().single();
    if (reportError("add the task", error) || !data) return;
    setTasks((prev) => [...prev, mapTaskFromDb(data)]);
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
    if (updates.completed !== undefined) dbUpdates.completed = updates.completed;
    if (updates.repeatDays !== undefined) dbUpdates.repeat_days = updates.repeatDays;

    const { error } = await supabase.from("tasks").update(dbUpdates).eq("id", id);
    if (reportError("update the task", error)) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (reportError("delete the task", error)) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Transactions ──
  const addTransaction = useCallback(async (tx: Omit<Transaction, "id">) => {
    const { data, error } = await supabase.from("transactions").insert(mapTransactionToDb(tx)).select().single();
    if (reportError("add the transaction", error) || !data) return;
    setTransactions((prev) => [...prev, mapTransactionFromDb(data)]);
  }, []);

  const updateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
    if (updates.date !== undefined) dbUpdates.date = updates.date;

    const { error } = await supabase.from("transactions").update(dbUpdates).eq("id", id);
    if (reportError("update the transaction", error)) return;
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (reportError("delete the transaction", error)) return;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Daily Focus ──
  const setDailyFocus = useCallback(
    async (focus: string) => {
      if (!user) return;
      setDailyFocusState(focus);
      // user_id is sent explicitly here, unlike every insert, which relies on
      // the column default. An upsert is INSERT ... ON CONFLICT DO UPDATE and
      // must satisfy the insert policy's `with check` and, on collision, the
      // update policy's `using` and `with check`. Supplying user_id from the
      // session removes any dependence on how the default interacts with
      // conflict resolution. This is the only upsert in the codebase.
      await supabase
        .from("settings")
        .upsert(
          { user_id: user.id, key: "daily_focus", value: focus },
          { onConflict: "user_id,key" },
        );
    },
    [user],
  );

  // ── Task Categories ──
  const addTaskCategory = useCallback(async (cat: Omit<TaskCategory, "id">) => {
    const { data, error } = await supabase.from("task_categories").insert(mapCategoryToDb(cat)).select().single();
    if (reportError("add the category", error) || !data) return;
    setTaskCategories((prev) => [...prev, mapCategoryFromDb(data) as TaskCategory]);
  }, []);

  const deleteTaskCategory = useCallback(async (id: string) => {
    const { error } = await supabase.from("task_categories").delete().eq("id", id);
    if (reportError("delete the category", error)) return;
    setTaskCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── Financial Categories ──
  const addFinancialCategory = useCallback(async (cat: Omit<FinancialCategory, "id">) => {
    const { data, error } = await supabase.from("financial_categories").insert(mapCategoryToDb(cat)).select().single();
    if (reportError("add the category", error) || !data) return;
    setFinancialCategories((prev) => [...prev, mapCategoryFromDb(data) as FinancialCategory]);
  }, []);

  const deleteFinancialCategory = useCallback(async (id: string) => {
    const { error } = await supabase.from("financial_categories").delete().eq("id", id);
    if (reportError("delete the category", error)) return;
    setFinancialCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      tasks, transactions, taskCategories, financialCategories, dailyFocus, loading,
      addTask, updateTask, deleteTask, addTransaction, updateTransaction, deleteTransaction,
      setDailyFocus, addTaskCategory, deleteTaskCategory, addFinancialCategory, deleteFinancialCategory,
      showTaskForm, setShowTaskForm, showTransactionForm, setShowTransactionForm,
      editingTask, setEditingTask, editingTransaction, setEditingTransaction,
      selectedNotePath, setSelectedNotePath, showQuickAdd, setShowQuickAdd,
      showEventForm, setShowEventForm,
      quickAddDraft, setQuickAddDraft,
    }),
    [tasks, transactions, taskCategories, financialCategories, dailyFocus, loading,
     addTask, updateTask, deleteTask, addTransaction, updateTransaction, deleteTransaction,
     setDailyFocus, addTaskCategory, deleteTaskCategory, addFinancialCategory, deleteFinancialCategory,
     showTaskForm, showTransactionForm, editingTask, editingTransaction,
     selectedNotePath, showQuickAdd, showEventForm, quickAddDraft]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
