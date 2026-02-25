import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskCategory = {
  id: string;
  name: string;
  color: string;
};

export type Task = {
  id: string;
  name: string;
  date: string;
  startTime: string;
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
  addTask: (task: Omit<Task, "id">) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  deleteTransaction: (id: string) => void;
  setDailyFocus: (focus: string) => void;
  addTaskCategory: (cat: Omit<TaskCategory, "id">) => void;
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

const today = new Date().toISOString().split("T")[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

const seedTasks: Task[] = [
  { id: "t1", name: "Review Q4 Report", date: today, startTime: "09:00", endTime: "10:30", priority: "high", categoryId: "work", completed: false },
  { id: "t2", name: "Morning Run", date: today, startTime: "06:30", endTime: "07:15", priority: "medium", categoryId: "health", completed: true },
  { id: "t3", name: "Team Standup", date: today, startTime: "11:00", endTime: "11:30", priority: "medium", categoryId: "work", completed: false },
  { id: "t4", name: "Read TypeScript Handbook", date: today, startTime: "14:00", endTime: "15:00", priority: "low", categoryId: "learning", completed: false },
  { id: "t5", name: "Grocery Shopping", date: today, startTime: "17:00", endTime: "18:00", priority: "low", categoryId: "personal", completed: false },
  { id: "t6", name: "Deploy v2.1", date: yesterday, startTime: "15:00", endTime: "16:00", priority: "urgent", categoryId: "work", completed: true },
];

const seedTransactions: Transaction[] = [
  { id: "tx1", name: "Monthly Salary", amount: 5200, type: "income", categoryId: "salary", date: today },
  { id: "tx2", name: "Starbucks Latte", amount: 5.5, type: "expense", categoryId: "coffee", date: today },
  { id: "tx3", name: "Metro Pass", amount: 45, type: "expense", categoryId: "transport", date: today },
  { id: "tx4", name: "Sushi Dinner", amount: 38, type: "expense", categoryId: "food", date: yesterday },
  { id: "tx5", name: "Netflix", amount: 15.99, type: "expense", categoryId: "entertainment", date: yesterday },
  { id: "tx6", name: "Electric Bill", amount: 82, type: "expense", categoryId: "utilities", date: yesterday },
  { id: "tx7", name: "Morning Coffee", amount: 4.5, type: "expense", categoryId: "coffee", date: yesterday },
  { id: "tx8", name: "Freelance Payment", amount: 800, type: "income", categoryId: "salary", date: yesterday },
];

const AppContext = createContext<AppState | null>(null);

let idCounter = 100;
const genId = () => `item-${idCounter++}`;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [transactions, setTransactions] = useState<Transaction[]>(seedTransactions);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>(defaultTaskCategories);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategory[]>(defaultFinancialCategories);
  const [dailyFocus, setDailyFocus] = useState("Ship the Crystal OS dashboard");

  const addTask = useCallback((task: Omit<Task, "id">) => {
    setTasks((prev) => [...prev, { ...task, id: genId() }]);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addTransaction = useCallback((tx: Omit<Transaction, "id">) => {
    setTransactions((prev) => [...prev, { ...tx, id: genId() }]);
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addTaskCategory = useCallback((cat: Omit<TaskCategory, "id">) => {
    setTaskCategories((prev) => [...prev, { ...cat, id: genId() }]);
  }, []);

  const addFinancialCategory = useCallback((cat: Omit<FinancialCategory, "id">) => {
    setFinancialCategories((prev) => [...prev, { ...cat, id: genId() }]);
  }, []);

  const deleteFinancialCategory = useCallback((id: string) => {
    setFinancialCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      tasks, transactions, taskCategories, financialCategories, dailyFocus,
      addTask, updateTask, deleteTask, addTransaction, deleteTransaction,
      setDailyFocus, addTaskCategory, addFinancialCategory, deleteFinancialCategory,
    }),
    [tasks, transactions, taskCategories, financialCategories, dailyFocus,
     addTask, updateTask, deleteTask, addTransaction, deleteTransaction,
     addTaskCategory, addFinancialCategory, deleteFinancialCategory]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
