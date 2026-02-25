import { useState, useMemo } from "react";
import { useApp, type Transaction } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, X, Settings } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

function CashFlowChart() {
  const { transactions } = useApp();
  const data = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    transactions.forEach((t) => {
      if (!map[t.date]) map[t.date] = { income: 0, expense: 0 };
      if (t.type === "income") map[t.date].income += t.amount;
      else map[t.date].expense += t.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: date.slice(5), ...vals }));
  }, [transactions]);

  return (
    <div className="glass-card-hover p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Cash Flow</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(239 84% 67%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(239 84% 67%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "hsl(217 33% 15%)", border: "1px solid hsl(217 33% 24%)", borderRadius: 8, fontSize: 12 }} />
          <Area type="monotone" dataKey="income" stroke="hsl(160 84% 39%)" fill="url(#incomeGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="expense" stroke="hsl(239 84% 67%)" fill="url(#expenseGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
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
          <Tooltip contentStyle={{ background: "hsl(217 33% 15%)", border: "1px solid hsl(217 33% 24%)", borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 mt-2">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} /> {d.name}
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

function TransactionDrawer({ onClose }: { onClose: () => void }) {
  const { addTransaction, financialCategories } = useApp();
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ name: "", amount: "", type: "expense" as "income" | "expense", categoryId: financialCategories[0]?.id || "", date: today });

  const submit = () => {
    if (!form.name.trim() || !form.amount) return;
    addTransaction({ ...form, amount: parseFloat(form.amount) });
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Quick Add Transaction</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Description..."
        className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50" />
      <div className="grid grid-cols-2 gap-2">
        <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount"
          className="bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none" />
        <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "income" | "expense" }))}
          className="bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none">
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
          className="bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none">
          {financialCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          className="bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none" />
      </div>
      <button onClick={submit} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2 text-sm font-medium transition-colors">
        Add Transaction
      </button>
    </motion.div>
  );
}

function TransactionList() {
  const { transactions, financialCategories, deleteTransaction } = useApp();
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
  const [showDrawer, setShowDrawer] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CashFlowChart />
        <CategoryDonut />
      </div>
      <SavingsTrend />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Recent Transactions</p>
        <button onClick={() => setShowDrawer(!showDrawer)} className="glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary-foreground hover:bg-primary transition-colors flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Quick Add
        </button>
      </div>
      <AnimatePresence>{showDrawer && <TransactionDrawer onClose={() => setShowDrawer(false)} />}</AnimatePresence>
      <TransactionList />
    </motion.div>
  );
}
