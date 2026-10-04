import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import {
  useAppActions,
  useFinancialCategories,
  useTransactions,
  type Transaction,
} from "@/contexts/AppContext";
import { appUi } from "@/lib/appUi";
import { m, AnimatePresence } from "framer-motion";
import { toLocalDateStr } from "@/lib/utils";
import { Plus, Trash2, X, Settings, Pencil } from "lucide-react";
import { CategoryManagerButton } from "./CategoryManager";
import { DateField, ThemedSelect } from "@/components/ui/field-controls";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppActivity } from "@/lib/appActivity";
import { DonutChart, LineAreaChart, type Series } from "./financials/FinanceCharts";

/** How long a chart's box must hold one width before the chart draws into it. */
const SETTLE_MS = 120;

/**
 * Holds a chart back, behind a skeleton, until its box has kept one width for
 * SETTLE_MS, then draws it at that width.
 *
 * The charts play their entrance once, on mount, so drawing them only after
 * the page has finished laying out keeps the wipe from running at one width
 * and landing at another. Later resizes pass straight through. Performance
 * mode and reduced motion skip the entrance.
 */
function ChartFrame({ height, children }: { height: number; children: (width: number, animate: boolean) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [settled, setSettled] = useState(false);
  const { still } = useAppActivity();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
      clearTimeout(timer);
      timer = setTimeout(() => setSettled(true), SETTLE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={ref} style={{ height }}>
      {settled && width > 0 ? children(width, !still) : <Skeleton className="h-full w-full rounded-lg" />}
    </div>
  );
}

// The charts select their series straight from the cache. Structural sharing
// keeps a series' reference when an edit does not change it (a rename, say),
// so the chart does not re-render.

/** Income, expense and net for each of the last six months. */
function cashFlowByMonth(transactions: Transaction[]) {
  const months: { label: string; income: number; expense: number; net: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const label = d.toLocaleDateString("en-US", { month: "short" });
    let income = 0;
    let expense = 0;
    transactions.forEach((t) => {
      const td = new Date(t.date + "T12:00:00");
      if (td.getFullYear() === yr && td.getMonth() === mo) {
        if (t.type === "income") income += t.amount;
        else expense += t.amount;
      }
    });
    months.push({ label, income, expense, net: income - expense });
  }
  return months;
}

const CASH_FLOW_SERIES: Series<"income" | "expense" | "net">[] = [
  { key: "income", name: "Income", color: "hsl(160 84% 39%)", fillOpacity: 0.4 },
  { key: "expense", name: "Expense", color: "hsl(0 72% 51%)", fillOpacity: 0.4 },
  { key: "net", name: "Net", color: "hsl(239 84% 67%)", fillOpacity: 0.3, dashed: true },
];

function CashFlowChart() {
  const data = useTransactions(cashFlowByMonth);

  return (
    <div className="glass-card-hover p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Cash Flow — Last 6 Months</p>
      <ChartFrame height={200}>
        {(width, animate) => (
          <LineAreaChart
            width={width}
            height={200}
            data={data}
            labelKey="label"
            series={CASH_FLOW_SERIES}
            animate={animate}
            label={`Cash flow by month: ${data.map((row) => `${row.label} income $${row.income.toFixed(2)}, expenses $${row.expense.toFixed(2)}`).join("; ")}`}
          />
        )}
      </ChartFrame>
      <div className="flex flex-wrap gap-4 mt-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
          <span className="w-3 h-0.5 rounded-full" style={{ background: "hsl(160 84% 39%)" }} /> Income
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
          <span className="w-3 h-0.5 rounded-full" style={{ background: "hsl(0 72% 51%)" }} /> Expenses
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
          <span className="w-3 h-0.5 rounded-full border-t border-dashed" style={{ borderColor: "hsl(239 84% 67%)" }} /> Net Difference
        </span>
      </div>
    </div>
  );
}

/** Total spent per category id. */
function expenseByCategory(transactions: Transaction[]) {
  const map: Record<string, number> = {};
  transactions.filter((t) => t.type === "expense").forEach((t) => {
    map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
  });
  return map;
}

function CategoryDonut() {
  const spent = useTransactions(expenseByCategory);
  const financialCategories = useFinancialCategories();
  const data = useMemo(() => {
    return Object.entries(spent).map(([id, value]) => {
      const cat = financialCategories.find((c) => c.id === id);
      return { name: cat?.name || id, value, color: cat?.color || "hsl(217 33% 40%)" };
    });
  }, [spent, financialCategories]);

  return (
    <div className="glass-card-hover p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Spending Breakdown</p>
      <ChartFrame height={200}>
        {(width, animate) => (
          <DonutChart
            width={width}
            height={200}
            data={data}
            inner={55}
            outer={80}
            animate={animate}
            label={`Spending by category: ${data.map((d) => `${d.name} $${d.value.toFixed(2)}`).join(", ")}`}
          />
        )}
      </ChartFrame>
      <div className="flex flex-wrap gap-3 mt-3">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} /> {d.name}: ${d.value.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Running balance by day. */
function savingsByDay(transactions: Transaction[]) {
  const map: Record<string, number> = {};
  transactions.forEach((t) => {
    const val = t.type === "income" ? t.amount : -t.amount;
    map[t.date] = (map[t.date] || 0) + val;
  });
  let running = 0;
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, val]) => {
      running += val;
      return { date: date.slice(5), savings: Math.round(running * 100) / 100 };
    });
}

const SAVINGS_SERIES: Series<"savings">[] = [{ key: "savings", name: "Savings", color: "hsl(160 84% 39%)" }];

function SavingsTrend() {
  const data = useTransactions(savingsByDay);

  return (
    <div className="glass-card-hover glass-card-emerald p-5">
      <p className="text-xs text-accent uppercase tracking-widest mb-4">Net Savings Trend</p>
      <ChartFrame height={160}>
        {(width, animate) => (
          <LineAreaChart
            width={width}
            height={160}
            data={data}
            labelKey="date"
            series={SAVINGS_SERIES}
            animate={animate}
            label={data.length ? `Net savings, ${data[0].date} to ${data[data.length - 1].date}: $${data[data.length - 1].savings.toFixed(2)}` : "Net savings: no transactions yet"}
          />
        )}
      </ChartFrame>
    </div>
  );
}

export function TransactionDrawer({ onClose, editingTransaction }: { onClose: () => void; editingTransaction?: Transaction | null }) {
  const { addTransaction, updateTransaction } = useAppActions();
  const financialCategories = useFinancialCategories();
  const today = toLocalDateStr();
  const [form, setForm] = useState({
    name: editingTransaction?.name || "",
    amount: editingTransaction ? String(editingTransaction.amount) : "",
    type: (editingTransaction?.type || "expense") as "income" | "expense",
    categoryId: editingTransaction?.categoryId || financialCategories[0]?.id || "",
    date: editingTransaction?.date || today,
  });

  const submit = () => {
    if (!form.name.trim() || !form.amount) return;
    if (editingTransaction) {
      updateTransaction(editingTransaction.id, { ...form, amount: parseFloat(form.amount) });
    } else {
      addTransaction({ ...form, amount: parseFloat(form.amount) });
    }
    onClose();
  };
  useEscapeKey(onClose);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        className="glass-card p-6 space-y-4 w-full max-w-md relative z-10"
      >
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">{editingTransaction ? "Edit Transaction" : "Add Transaction"}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Description..."
          className="w-full bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount"
            className="bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none" />
          <ThemedSelect value={form.type} aria-label="Transaction type"
            onChange={(v) => setForm((f) => ({ ...f, type: v as "income" | "expense" }))}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ThemedSelect value={form.categoryId} aria-label="Category"
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            options={financialCategories.map((c) => ({ value: c.id, label: c.name, color: c.color }))} />
          <DateField value={form.date} aria-label="Date"
            onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </div>
        <button onClick={submit} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors">
          {editingTransaction ? "Save Changes" : "Add Transaction"}
        </button>
      </m.div>
    </m.div>
  );
}

function TransactionList() {
  const transactions = useTransactions();
  const financialCategories = useFinancialCategories();
  const { deleteTransaction } = useAppActions();
  const { setEditingTransaction, setShowTransactionForm } = appUi;
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-1.5">
      {sorted.map((tx) => {
        const cat = financialCategories.find((c) => c.id === tx.categoryId);
        return (
          <m.div key={tx.id} layout className="glass-card p-3 flex items-center gap-3 group">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cat?.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tx.name}</p>
              <p className="text-[10px] text-muted-foreground">{cat?.name} · {tx.date}</p>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${tx.type === "income" ? "text-accent" : "text-foreground"}`}>
              {tx.type === "income" ? "+" : "-"}${tx.amount.toFixed(2)}
            </span>
            <button onClick={() => { setEditingTransaction(tx); setShowTransactionForm(true); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => deleteTransaction(tx.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </m.div>
        );
      })}
    </div>
  );
}

export default function FinancialsPage() {
  const { setShowTransactionForm } = appUi;

  return (
    <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CashFlowChart />
        <CategoryDonut />
      </div>
      <SavingsTrend />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold">Recent Transactions</p>
        <div className="flex items-center gap-2">
          <CategoryManagerButton mode="financial" />
          <button onClick={() => setShowTransactionForm(true)} className="glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary-foreground hover:bg-primary transition-colors flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Quick Add
          </button>
        </div>
      </div>
      <TransactionList />
    </m.div>
  );
}
