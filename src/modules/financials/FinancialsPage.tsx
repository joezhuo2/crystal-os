import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useAppActions,
  useFinancialCategories,
  useTransactions,
  type Transaction,
} from "@/contexts/AppContext";
import { appUi } from "@/lib/appUi";
import { m } from "framer-motion";
import { toLocalDateStr } from "@/lib/utils";
import { FileSpreadsheet, Mail, Paperclip, Pencil, Plus, Repeat, Search, Trash2, X } from "lucide-react";
import { ItemNoteLink } from "@/components/ItemNoteLink";
import { CategoryManagerButton } from "@/components/views/CategoryManager";
import { DateField, ThemedSelect } from "@/components/ui/field-controls";
import { NumberInput } from "@/components/ui/number-input";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useFinance, useFinanceActions } from "@/hooks/useFinance";
import { PERIODS, UNCATEGORISED, amountLabel, cashFlow, categorise, money, netTrend, periodStart, since, spendingSlices, totals, type Period } from "@/lib/finance";
import { attachmentPath } from "@/lib/attachments";
import { isDesktop } from "@/lib/platform";
import { writeVaultBinary } from "@/lib/vaultNative";
import { ChartFrame, DonutChart, LineAreaChart, type Series } from "./FinanceCharts";
import { AccountsCard, BudgetsCard, GoalsCard, UpcomingCard } from "./VaultPanels";
import { CsvImportDialog, ReceiptDialog, RecurringDialog, RulesDialog } from "./VaultDialogs";
import { CARD_TITLE, FIELD, ICON_BUTTON, useAccountOptions, useCategoryOptions } from "./shared";

const CASH_FLOW_SERIES: Series<"income" | "expense" | "net">[] = [
  { key: "income", name: "Income", color: "hsl(160 84% 39%)", fillOpacity: 0.4 },
  { key: "expense", name: "Expense", color: "hsl(0 72% 51%)", fillOpacity: 0.4 },
  { key: "net", name: "Net", color: "hsl(239 84% 67%)", fillOpacity: 0.3, dashed: true },
];

const SAVINGS_SERIES: Series<"savings">[] = [{ key: "savings", name: "Savings", color: "hsl(160 84% 39%)" }];

const GLASS_BUTTON = "glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary-foreground hover:bg-primary transition-colors flex items-center gap-1";
const PAGE_SIZE = 100;
const ALL = "__all";

function CashFlowChart({ start, today }: { start: string | null; today: string }) {
  const select = useCallback((txs: Transaction[]) => cashFlow(since(txs, start), start, today), [start, today]);
  const data = useTransactions(select);

  return (
    <div className="glass-card-hover p-5">
      <p className={`${CARD_TITLE} mb-4`}>Cash Flow</p>
      <ChartFrame height={200}>
        {(width, animate) => (
          <LineAreaChart
            width={width}
            height={200}
            data={data}
            labelKey="label"
            series={CASH_FLOW_SERIES}
            animate={animate}
            label={`Cash flow: ${data.map((row) => `${row.label} income ${money(row.income)}, expenses ${money(row.expense)}`).join("; ")}`}
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

function CategoryDonut({ start }: { start: string | null }) {
  const categories = useFinancialCategories();
  const select = useCallback((txs: Transaction[]) => spendingSlices(since(txs, start), categories), [start, categories]);
  const data = useTransactions(select);

  return (
    <div className="glass-card-hover p-5">
      <p className={`${CARD_TITLE} mb-4`}>Spending Breakdown</p>
      <ChartFrame height={200}>
        {(width, animate) => (
          <DonutChart
            width={width}
            height={200}
            data={data}
            inner={55}
            outer={80}
            animate={animate}
            label={`Spending by category: ${data.map((d) => `${d.name} ${money(d.value)}`).join(", ")}`}
          />
        )}
      </ChartFrame>
      <div className="flex flex-wrap gap-3 mt-3">
        {data.map((d) => (
          <span key={d.id} className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} /> {d.name}: <span data-private>{money(d.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SavingsTrend({ start }: { start: string | null }) {
  const select = useCallback((txs: Transaction[]) => netTrend(since(txs, start)), [start]);
  const data = useTransactions(select);

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
            label={data.length ? `Net savings, ${data[0].date} to ${data[data.length - 1].date}: ${money(data[data.length - 1].savings)}` : "Net savings: no transactions yet"}
          />
        )}
      </ChartFrame>
    </div>
  );
}

function SummaryTiles({ start }: { start: string | null }) {
  const select = useCallback((txs: Transaction[]) => totals(since(txs, start)), [start]);
  const t = useTransactions(select);
  const tiles = [
    { label: "Income", value: money(t.income), tone: "text-accent" },
    { label: "Spent", value: money(t.spent), tone: "" },
    { label: "Net", value: money(t.net), tone: t.net < 0 ? "text-destructive" : "text-accent" },
    { label: "Savings rate", value: t.savingsRate === null ? "-" : `${t.savingsRate}%`, tone: "" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="glass-card-hover p-4">
          <p className={CARD_TITLE}>{tile.label}</p>
          <p data-private className={`text-xl font-semibold tabular-nums mt-1 ${tile.tone}`}>
            {tile.value}
          </p>
        </div>
      ))}
    </div>
  );
}

type TxType = Transaction["type"];

export function TransactionDrawer({ onClose, editingTransaction }: { onClose: () => void; editingTransaction?: Transaction | null }) {
  const { addTransaction, updateTransaction } = useAppActions();
  const financialCategories = useFinancialCategories();
  const categoryOptions = useCategoryOptions();
  const { accounts, rules } = useFinance();
  const accountOptions = useAccountOptions();
  const transactions = useTransactions();
  const today = toLocalDateStr();
  const fileInput = useRef<HTMLInputElement>(null);
  const [categoryPicked, setCategoryPicked] = useState(false);
  const [form, setForm] = useState({
    name: editingTransaction?.name || "",
    amount: editingTransaction ? String(editingTransaction.amount) : "",
    type: (editingTransaction?.type || "expense") as TxType,
    categoryId: editingTransaction ? editingTransaction.categoryId : financialCategories[0]?.id || "",
    date: editingTransaction?.date || today,
    accountId: editingTransaction ? editingTransaction.accountId || "" : accounts[0]?.id || "",
    toAccountId: editingTransaction?.toAccountId || "",
    receiptPath: editingTransaction?.receiptPath || "",
  });
  const transfer = form.type === "transfer";
  const amount = Number(form.amount);
  const valid =
    form.name.trim() !== "" &&
    form.amount.trim() !== "" &&
    amount > 0 &&
    (!transfer || (form.accountId !== "" && form.toAccountId !== "" && form.accountId !== form.toAccountId));
  const typeOptions = [
    { value: "expense", label: "Expense" },
    { value: "income", label: "Income" },
    ...(accounts.length >= 2 || editingTransaction?.type === "transfer" ? [{ value: "transfer", label: "Transfer" }] : []),
  ];

  const submit = () => {
    if (!valid) return;
    const payload = {
      name: form.name.trim(),
      amount,
      type: form.type,
      categoryId: transfer ? "" : form.categoryId,
      date: form.date,
      accountId: form.accountId || null,
      toAccountId: transfer ? form.toAccountId || null : null,
      receiptPath: form.receiptPath || null,
    };
    if (editingTransaction) updateTransaction(editingTransaction.id, payload);
    else addTransaction(payload);
    onClose();
  };
  useEscapeKey(onClose);

  const guessCategory = () => {
    if (editingTransaction || categoryPicked) return;
    const id = categorise(form.name, rules, transactions);
    if (id) setForm((f) => ({ ...f, categoryId: id }));
  };

  const attach = async (file: File) => {
    const path = attachmentPath("Receipts/receipt.md", file, new Date());
    if (!path) return void toast.error("Attach a PNG, JPEG or PDF");
    try {
      await writeVaultBinary(path, new Uint8Array(await file.arrayBuffer()), false);
      setForm((f) => ({ ...f, receiptPath: path }));
    } catch (e) {
      toast.error("Could not attach the receipt", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        className="glass-card p-6 space-y-4 w-full max-w-md relative z-10"
      >
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">{editingTransaction ? "Edit Transaction" : "Add Transaction"}</p>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Description..."
          aria-label="Description"
          className="w-full bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
          onBlur={guessCategory}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <div className="grid grid-cols-2 gap-2">
          <NumberInput unstyled step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount"
            aria-label="Amount"
            className="w-full bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none" />
          <ThemedSelect value={form.type} aria-label="Transaction type"
            onChange={(v) => setForm((f) => ({ ...f, type: v as TxType }))}
            options={typeOptions} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {!transfer && (
            <ThemedSelect value={form.categoryId} aria-label="Category"
              onChange={(v) => { setCategoryPicked(true); setForm((f) => ({ ...f, categoryId: v })); }}
              options={categoryOptions} />
          )}
          <DateField value={form.date} aria-label="Date"
            onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </div>
        {accounts.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <ThemedSelect value={form.accountId} aria-label={transfer ? "From" : "Account"}
              onChange={(v) => setForm((f) => ({ ...f, accountId: v }))}
              options={transfer ? accountOptions.slice(1) : accountOptions} />
            {transfer && (
              <ThemedSelect value={form.toAccountId} aria-label="To"
                onChange={(v) => setForm((f) => ({ ...f, toAccountId: v }))}
                options={[{ value: "", label: "To..." }, ...accountOptions.slice(1)]} />
            )}
          </div>
        )}
        {isDesktop() && (
          <div className="flex items-center gap-2 text-xs">
            <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,application/pdf" aria-label="Receipt file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void attach(file);
              }} />
            {form.receiptPath ? (
              <>
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{form.receiptPath.split("/").pop()}</span>
                <button type="button" aria-label="Remove receipt" className={ICON_BUTTON} onClick={() => setForm((f) => ({ ...f, receiptPath: "" }))}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button type="button" className={GLASS_BUTTON} onClick={() => fileInput.current?.click()}>
                <Paperclip className="w-3.5 h-3.5" /> Attach receipt
              </button>
            )}
          </div>
        )}
        <button onClick={submit} disabled={!valid} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none">
          {editingTransaction ? "Save Changes" : "Add Transaction"}
        </button>
      </m.div>
    </m.div>
  );
}

function SourceIcon({ sourceId }: { sourceId?: string | null }) {
  if (!sourceId) return null;
  const cls = "w-3.5 h-3.5 text-muted-foreground shrink-0";
  if (sourceId.startsWith("mail:") || sourceId.startsWith("order:")) return <span title="From an email"><Mail className={cls} /></span>;
  if (sourceId.startsWith("rec:")) return <span title="Recurring"><Repeat className={cls} /></span>;
  if (sourceId === "csv") return <span title="Imported from CSV"><FileSpreadsheet className={cls} /></span>;
  return null;
}

function TransactionList({ start, period }: { start: string | null; period: Period }) {
  const transactions = useTransactions();
  const categories = useFinancialCategories();
  const categoryOptions = useCategoryOptions();
  const { accounts } = useFinance();
  const { deleteTransaction } = useAppActions();
  const { skip } = useFinanceActions();
  const { setEditingTransaction, setShowTransactionForm } = appUi;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(ALL);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [shown, setShown] = useState({ key: "", count: PAGE_SIZE });
  const key = `${period}|${search}|${filter}`;
  const limit = shown.key === key ? shown.count : PAGE_SIZE;

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const known = new Set(categories.map((c) => c.id));
    return since(transactions, start)
      .filter((t) => {
        if (needle && !t.name.toLowerCase().includes(needle)) return false;
        if (filter === ALL) return true;
        return t.type !== "transfer" && (known.has(t.categoryId) ? t.categoryId : "") === filter;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, categories, start, search, filter]);

  const accountName = (id?: string | null) => accounts.find((a) => a.id === id)?.name;

  const remove = (tx: Transaction) => {
    deleteTransaction(tx.id);
    if (tx.sourceId && (tx.sourceId.startsWith("mail:") || tx.sourceId.startsWith("order:"))) void skip(tx.sourceId);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold">
          Transactions <span className="text-xs font-normal text-muted-foreground">({matches.length})</span>
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search transactions"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${FIELD} pl-8 w-44`}
            />
          </div>
          <ThemedSelect
            aria-label="Filter by category"
            value={filter}
            onChange={setFilter}
            options={[{ value: ALL, label: "All categories" }, ...categoryOptions]}
            className="w-44"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {matches.slice(0, limit).map((tx) => {
          const cat = categories.find((c) => c.id === tx.categoryId);
          const isTransfer = tx.type === "transfer";
          const account = accountName(tx.accountId);
          return (
            <div key={tx.id} className="glass-card p-3 flex items-center gap-3 group">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: (cat ?? UNCATEGORISED).color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {isTransfer ? `Transfer · ${accountName(tx.accountId) ?? "?"} → ${accountName(tx.toAccountId) ?? "?"}` : (cat?.name ?? UNCATEGORISED.name)} · {tx.date}
                  {!isTransfer && account && ` · ${account}`}
                </p>
              </div>
              <SourceIcon sourceId={tx.sourceId} />
              <span data-private className={`text-sm font-semibold tabular-nums ${tx.type === "income" ? "text-accent" : "text-foreground"}`}>
                {amountLabel(tx)}
              </span>
              {tx.receiptPath && (
                <button aria-label={`View receipt for ${tx.name}`} onClick={() => setReceipt(tx.receiptPath ?? null)} className={ICON_BUTTON}>
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
              )}
              <ItemNoteLink kind="transaction" itemId={tx.id} title={tx.name} />
              <button aria-label={`Edit ${tx.name}`} onClick={() => { setEditingTransaction(tx); setShowTransactionForm(true); }} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button aria-label={`Delete ${tx.name}`} onClick={() => remove(tx)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {matches.length > limit && (
        <button onClick={() => setShown({ key, count: limit + PAGE_SIZE })} className={`${GLASS_BUTTON} mx-auto`}>
          Show more
        </button>
      )}
      <ReceiptDialog path={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

export default function FinancialsPage() {
  const { setShowTransactionForm } = appUi;
  const [period, setPeriod] = useState<Period>("3m");
  const [dialog, setDialog] = useState<"rules" | "recurring" | "csv" | null>(null);
  const today = toLocalDateStr();
  const start = periodStart(period, today);
  const close = () => setDialog(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ThemedSelect
          aria-label="Period"
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          className="w-44"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryManagerButton mode="financial" />
          <button onClick={() => setDialog("rules")} className={GLASS_BUTTON}>Rules</button>
          <button onClick={() => setDialog("recurring")} className={GLASS_BUTTON}>Recurring</button>
          <button onClick={() => setDialog("csv")} className={GLASS_BUTTON}>Import CSV</button>
          <button onClick={() => setShowTransactionForm(true)} className={GLASS_BUTTON}>
            <Plus className="w-3.5 h-3.5" /> Quick Add
          </button>
        </div>
      </div>
      <SummaryTiles start={start} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CashFlowChart start={start} today={today} />
        <CategoryDonut start={start} />
      </div>
      <SavingsTrend start={start} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BudgetsCard />
        <UpcomingCard onManage={() => setDialog("recurring")} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AccountsCard />
        <GoalsCard />
      </div>
      <TransactionList start={start} period={period} />
      <RulesDialog open={dialog === "rules"} onClose={close} />
      <RecurringDialog open={dialog === "recurring"} onClose={close} />
      <CsvImportDialog open={dialog === "csv"} onClose={close} />
    </div>
  );
}
