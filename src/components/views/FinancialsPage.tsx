import { useState, useMemo } from "react";
import { useApp, type Transaction } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { toLocalDateStr } from "@/lib/utils";
import { Plus, Trash2, X, Settings, Pencil } from "lucide-react";
import { CategoryManagerButton } from "./CategoryManager";
import {
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

function CashFlowChart() {
  const { transactions } = useApp();
  const data = useMemo(() => {
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
  }, [transactions]);

  return (
    <div className="glass-card-hover p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Cash Flow — Last 6 Months</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(0 72% 51%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(239 84% 67%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(239 84% 67%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "hsl(217 33% 15%)", border: "1px solid hsl(217 33% 24%)", borderRadius: 8, fontSize: 12 }}
            formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name.charAt(0).toUpperCase() + name.slice(1)]}
          />
          <Area type="monotone" dataKey="income" stroke="hsl(160 84% 39%)" fill="url(#incomeGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="expense" stroke="hsl(0 72% 51%)" fill="url(#expenseGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="net" stroke="hsl(239 84% 67%)" fill="url(#netGrad)" strokeWidth={2} strokeDasharray="5 3" />
        </AreaChart>
      </ResponsiveContainer>
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

function CategoryDonut() {
  const { transactions, financialCategories } = useApp();
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.filter((t) => t.type === "expense").forEach((t) => {
      map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
    });
    return Object.entries(map).map(([id, value]) => {
      const cat = financialCategories.find((c) => c.id === id);
      return { name: cat?.name || id, value, color: cat?.color || "hsl(217 33% 40%)" };
    });
  }, [transactions, financialCategories]);

  return (
    <div className="glass-card-hover p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Spending Breakdown</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" stroke="none">
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: "hsl(217 33% 15%)", border: "1px solid hsl(217 33% 24%)", borderRadius: 8, fontSize: 12 }}
            formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
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

function SavingsTrend() {
  const { transactions } = useApp();
  const data = useMemo(() => {
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
        return { date: date.slice(5), savings: running };
      });
  }, [transactions]);

  return (
    <div className="glass-card-hover glass-card-emerald p-5">
      <p className="text-xs text-accent uppercase tracking-widest mb-4">Net Savings Trend</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "hsl(217 33% 15%)", border: "1px solid hsl(217 33% 24%)", borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey="savings" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TransactionDrawer({ onClose, editingTransaction }: { onClose: () => void; editingTransaction?: Transaction | null }) {
  const { addTransaction, updateTransaction, financialCategories } = useApp();
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <motion.div
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
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "income" | "expense" }))}
            className="bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none">
            {financialCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none" />
        </div>
        <button onClick={submit} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors">
          {editingTransaction ? "Save Changes" : "Add Transaction"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function TransactionList() {
  const { transactions, financialCategories, deleteTransaction, setEditingTransaction, setShowTransactionForm } = useApp();
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-1.5">
      {sorted.map((tx) => {
        const cat = financialCategories.find((c) => c.id === tx.categoryId);
        return (
          <motion.div key={tx.id} layout className="glass-card p-3 flex items-center gap-3 group">
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
          </motion.div>
        );
      })}
    </div>
  );
}

export default function FinancialsPage() {
  const { setShowTransactionForm } = useApp();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
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
    </motion.div>
  );
}
