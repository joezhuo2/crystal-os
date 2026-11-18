import type { FinancialCategory, Transaction } from "@/contexts/AppContext";
import { addDays, toLocalDateStr } from "@/lib/utils";

export type Period = "month" | "3m" | "ytd" | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "3m", label: "Last 3 months" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
];

export const UNCATEGORISED = { name: "Uncategorised", color: "hsl(217 33% 40%)" };

export interface CategoryRule {
  id: string;
  keyword: string;
  categoryId: string;
}

export type Interval = "weekly" | "biweekly" | "monthly" | "yearly";

export const INTERVALS: { value: Interval; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  categoryId: string | null;
  accountId: string | null;
  interval: Interval;
  startDate: string;
  nextDate: string;
}

export interface Account {
  id: string;
  name: string;
  openingBalance: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  deadline: string | null;
  accountId: string | null;
  saved: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const round2 = (n: number) => Math.round(n * 100) / 100;

export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export const amountLabel = (tx: Pick<Transaction, "type" | "amount">) =>
  `${tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "⇄ "}$${tx.amount.toFixed(2)}`;

export function periodStart(period: Period, today: string): string | null {
  if (period === "all") return null;
  if (period === "ytd") return `${today.slice(0, 4)}-01-01`;
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00`);
  if (period === "3m") d.setMonth(d.getMonth() - 2);
  return toLocalDateStr(d);
}

export const since = (transactions: Transaction[], start: string | null) =>
  start ? transactions.filter((t) => t.date >= start) : transactions;

export function totals(transactions: Transaction[]) {
  let income = 0;
  let spent = 0;
  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") spent += t.amount;
  }
  const net = income - spent;
  return { income: round2(income), spent: round2(spent), net: round2(net), savingsRate: income > 0 ? Math.round((net / income) * 100) : null };
}

export function cashFlow(transactions: Transaction[], start: string | null, today: string) {
  const first = start ?? transactions.reduce((min, t) => (t.date < min ? t.date : min), today);
  const daily = first.slice(0, 7) === today.slice(0, 7);
  const keys: string[] = [];
  if (daily) {
    for (let d = first; d <= today; d = addDays(d, 1)) keys.push(d);
  } else {
    let [y, m] = first.split("-").map(Number);
    for (let key = first.slice(0, 7); key <= today.slice(0, 7); key = `${y}-${pad(m)}`) {
      keys.push(key);
      if (++m > 12) [y, m] = [y + 1, 1];
    }
  }
  const rows = new Map(keys.map((key) => [key, { income: 0, expense: 0 }]));
  for (const t of transactions) {
    const row = rows.get(t.date.slice(0, daily ? 10 : 7));
    if (!row || t.type === "transfer") continue;
    row[t.type] += t.amount;
  }
  const years = keys[0].slice(0, 4) !== keys[keys.length - 1].slice(0, 4);
  return keys.map((key) => {
    const { income, expense } = rows.get(key)!;
    const label = daily
      ? key.slice(5)
      : new Date(`${key}-01T12:00:00`).toLocaleDateString("en-US", years ? { month: "short", year: "2-digit" } : { month: "short" });
    return { label, income: round2(income), expense: round2(expense), net: round2(income - expense) };
  });
}

export function spendingSlices(transactions: Transaction[], categories: FinancialCategory[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const spent = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const id = byId.has(t.categoryId) ? t.categoryId : "";
    spent.set(id, (spent.get(id) ?? 0) + t.amount);
  }
  return [...spent]
    .map(([id, value]) => ({ id, value: round2(value), ...(byId.get(id) ?? UNCATEGORISED) }))
    .sort((a, b) => b.value - a.value)
    .map(({ id, name, color, value }) => ({ id, name, color, value }));
}

export function netTrend(transactions: Transaction[]) {
  const byDay = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "transfer") continue;
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
  }
  const days = [...byDay.keys()].sort();
  const years = days.length > 0 && days[0].slice(0, 4) !== days[days.length - 1].slice(0, 4);
  let running = 0;
  return days.map((date) => {
    running += byDay.get(date)!;
    return { date: years ? date : date.slice(5), savings: round2(running) };
  });
}

export interface BudgetLine {
  id: string;
  name: string;
  color: string;
  budget: number;
  spent: number;
  ratio: number;
}

export function budgetLines(transactions: Transaction[], categories: FinancialCategory[], month: string): BudgetLine[] {
  const spent = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "expense" && t.date.startsWith(month)) spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amount);
  }
  return categories
    .filter((c) => (c.budget ?? 0) > 0)
    .map((c) => {
      const used = round2(spent.get(c.id) ?? 0);
      return { id: c.id, name: c.name, color: c.color, budget: c.budget!, spent: used, ratio: used / c.budget! };
    });
}

export function budgetAlerts(lines: BudgetLine[], month: string) {
  return lines
    .filter((l) => l.ratio >= 0.8)
    .map((l) => ({
      key: `budget:${l.id}:${month}:${l.ratio >= 1 ? 100 : 80}`,
      title: l.ratio >= 1 ? `${l.name} budget used up` : `${l.name} budget at ${Math.round(l.ratio * 100)}%`,
      body: `${money(l.spent)} of ${money(l.budget)} spent this month.`,
    }));
}

export function categorise(name: string, rules: CategoryRule[], history: Transaction[]): string {
  const lower = name.trim().toLowerCase();
  if (!lower) return "";
  const rule = rules
    .filter((r) => r.keyword.trim() && lower.includes(r.keyword.trim().toLowerCase()))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0];
  if (rule) return rule.categoryId;
  let latest: Transaction | undefined;
  for (const t of history) {
    if (t.categoryId && t.name.trim().toLowerCase() === lower && (!latest || t.date > latest.date)) latest = t;
  }
  return latest?.categoryId ?? "";
}

export function stepDate(date: string, interval: Interval, anchorDay = Number(date.slice(8))): string {
  if (interval === "weekly") return addDays(date, 7);
  if (interval === "biweekly") return addDays(date, 14);
  const [y, m] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + (interval === "monthly" ? 1 : 12);
  const year = Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(anchorDay, last))}`;
}

export const recurringSourceId = (id: string, date: string) => `rec:${id}:${date}`;

export function dueOccurrences(r: Pick<Recurring, "interval" | "startDate" | "nextDate">, today: string, max = 60) {
  const anchor = Number(r.startDate.slice(8));
  const dates: string[] = [];
  let nextDate = r.nextDate;
  while (nextDate <= today && dates.length < max) {
    dates.push(nextDate);
    nextDate = stepDate(nextDate, r.interval, anchor);
  }
  return { dates, nextDate };
}

const PER_MONTH: Record<Interval, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 };

export const monthlyCost = (recurring: Recurring[]) =>
  round2(recurring.reduce((sum, r) => sum + (r.type === "expense" ? r.amount * PER_MONTH[r.interval] : 0), 0));

export function accountBalances(accounts: Account[], transactions: Transaction[], upTo?: string): Map<string, number> {
  const balances = new Map(accounts.map((a) => [a.id, a.openingBalance]));
  const move = (id: string | null | undefined, amount: number) => {
    if (id && balances.has(id)) balances.set(id, balances.get(id)! + amount);
  };
  for (const t of transactions) {
    if (upTo && t.date > upTo) continue;
    move(t.accountId, t.type === "income" ? t.amount : -t.amount);
    if (t.type === "transfer") move(t.toAccountId, t.amount);
  }
  for (const [id, value] of balances) balances.set(id, round2(value));
  return balances;
}

export const netWorth = (balances: Map<string, number>) => round2([...balances.values()].reduce((sum, v) => sum + v, 0));

export function netWorthTrend(accounts: Account[], transactions: Transaction[], today: string, months = 12) {
  const out: { label: string; worth: number }[] = [];
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00`);
  d.setMonth(d.getMonth() - (months - 1));
  for (let i = 0; i < months; i++) {
    const end = i === months - 1 ? today : toLocalDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
    out.push({ label: d.toLocaleDateString("en-US", { month: "short" }), worth: netWorth(accountBalances(accounts, transactions, end)) });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function goalProgress(goal: SavingsGoal, balances: Map<string, number>, today: string) {
  const saved = goal.accountId && balances.has(goal.accountId) ? balances.get(goal.accountId)! : goal.saved;
  const left = Math.max(0, round2(goal.target - saved));
  let perMonth: number | null = null;
  if (goal.deadline && left > 0 && goal.deadline > today) {
    const months = (Number(goal.deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(goal.deadline.slice(5, 7)) - Number(today.slice(5, 7));
    perMonth = round2(left / Math.max(1, months));
  }
  return { saved, left, ratio: goal.target > 0 ? Math.max(0, Math.min(1, saved / goal.target)) : 0, perMonth };
}
