import { lazy, Suspense, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { VaultImage } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField, ThemedSelect } from "@/components/ui/field-controls";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { useAppActions, useFinancialCategories, useTransactions } from "@/contexts/AppContext";
import { useFinance, useFinanceActions } from "@/hooks/useFinance";
import { INTERVALS, categorise, money, type Interval, type Recurring } from "@/lib/finance";
import { csvTransactions, newCsvRows } from "@/lib/financeCsv";
import { db } from "@/lib/localDb";
import { toLocalDateStr } from "@/lib/utils";
import { FIELD, ICON_BUTTON, useAccountOptions, useCategoryOptions } from "./shared";

const VaultPdf = lazy(() => import("@/components/VaultPdf"));

interface DialogProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

const blankRecurring = (today: string) => ({
  id: "",
  name: "",
  amount: "",
  type: "expense" as Recurring["type"],
  categoryId: "",
  accountId: "",
  interval: "monthly" as Interval,
  nextDate: today,
});

export function RecurringDialog({ open, onClose }: DialogProps) {
  const { recurring, accounts } = useFinance();
  const { save, remove } = useFinanceActions();
  const categoryOptions = useCategoryOptions();
  const accountOptions = useAccountOptions();
  const today = toLocalDateStr();
  const [form, setForm] = useState(() => blankRecurring(today));
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const amount = Number(form.amount);
  const valid = !!form.name.trim() && amount > 0 && !!form.nextDate;

  const submit = async () => {
    if (!valid) return;
    const row = {
      name: form.name.trim(),
      amount,
      type: form.type,
      categoryId: form.categoryId || null,
      accountId: form.accountId || null,
      interval: form.interval,
      startDate: form.nextDate,
      nextDate: form.nextDate,
    };
    if (await save("recurring", form.id ? { id: form.id, ...row } : row)) setForm(blankRecurring(today));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recurring transactions</DialogTitle>
          <DialogDescription>Rent, salary and subscriptions. Each one is logged by itself on its date.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border/40 text-sm" aria-label="Recurring transactions">
          {recurring.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {INTERVALS.find((i) => i.value === r.interval)?.label} · next {r.nextDate}
                </p>
              </div>
              <span data-private className={`tabular-nums ${r.type === "income" ? "text-accent" : ""}`}>
                {r.type === "income" ? "+" : "-"}
                {money(r.amount)}
              </span>
              <button
                type="button"
                aria-label={`Edit ${r.name}`}
                className={ICON_BUTTON}
                onClick={() => setForm({ id: r.id, name: r.name, amount: String(r.amount), type: r.type, categoryId: r.categoryId ?? "", accountId: r.accountId ?? "", interval: r.interval, nextDate: r.nextDate })}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" aria-label={`Delete ${r.name}`} className={`${ICON_BUTTON} hover:text-destructive`} onClick={() => void remove("recurring", r.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
          {recurring.length === 0 && <li className="py-3 text-center text-muted-foreground">Nothing recurring yet</li>}
        </ul>
        <form
          className="space-y-2 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name, e.g. Rent" aria-label="Name" className={FIELD} />
          <div className="grid grid-cols-2 gap-2">
            <NumberInput unstyled min={0} step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="Amount" aria-label="Amount" className={FIELD} />
            <ThemedSelect aria-label="Type" value={form.type} onChange={(v) => set({ type: v as Recurring["type"] })} options={TYPE_OPTIONS} />
            <ThemedSelect aria-label="Repeats" value={form.interval} onChange={(v) => set({ interval: v as Interval })} options={INTERVALS} />
            <DateField aria-label="Next date" value={form.nextDate} onChange={(v) => set({ nextDate: v })} />
            <ThemedSelect aria-label="Category" value={form.categoryId} onChange={(v) => set({ categoryId: v })} options={categoryOptions} />
            {accounts.length > 0 && <ThemedSelect aria-label="Account" value={form.accountId} onChange={(v) => set({ accountId: v })} options={accountOptions} />}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!valid}>
              <Plus /> {form.id ? "Save changes" : "Add"}
            </Button>
            {form.id && (
              <Button type="button" size="sm" variant="outline" onClick={() => setForm(blankRecurring(today))}>
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RulesDialog({ open, onClose }: DialogProps) {
  const { rules } = useFinance();
  const { save, remove } = useFinanceActions();
  const categories = useFinancialCategories();
  const options = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name, color: c.color })), [categories]);
  const [keyword, setKeyword] = useState("");
  const [picked, setPicked] = useState("");
  const categoryId = picked || categories[0]?.id || "";
  const valid = !!keyword.trim() && !!categoryId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Category rules</DialogTitle>
          <DialogDescription>
            A new transaction whose description contains a keyword gets that category: from the command palette, a CSV import, an email or a recurring item. The longest matching keyword wins.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border/40 text-sm" aria-label="Category rules">
          {rules.map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            return (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.keyword}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: cat?.color }} /> {cat?.name ?? "Deleted category"}
                </span>
                <button type="button" aria-label={`Delete the rule for ${r.keyword}`} className={`${ICON_BUTTON} hover:text-destructive`} onClick={() => void remove("rules", r.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
          {rules.length === 0 && <li className="py-3 text-center text-muted-foreground">No rules yet</li>}
        </ul>
        <form
          className="flex items-center gap-2 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            void save("rules", { keyword: keyword.trim(), categoryId }).then((ok) => ok && setKeyword(""));
          }}
        >
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword, e.g. uber" aria-label="Keyword" className={FIELD} />
          <ThemedSelect aria-label="Category" value={categoryId} onChange={setPicked} options={options} className="w-44 shrink-0" />
          <Button type="submit" size="sm" disabled={!valid}>
            <Plus /> Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CHUNK = 1000;
const PREVIEW = 8;

export function CsvImportDialog({ open, onClose }: DialogProps) {
  const transactions = useTransactions();
  const { rules, accounts } = useFinance();
  const { reloadData } = useAppActions();
  const accountOptions = useAccountOptions();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [flip, setFlip] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => (file ? csvTransactions(file.text, flip) : null), [file, flip]);
  const fresh = useMemo(() => (parsed ? newCsvRows(parsed.rows, transactions) : []), [parsed, transactions]);

  const close = () => {
    setFile(null);
    onClose();
  };

  const run = async () => {
    setBusy(true);
    const rows = fresh.map((r) => ({
      name: r.name,
      amount: r.amount,
      type: r.type,
      date: r.date,
      category_id: categorise(r.name, rules, transactions) || null,
      account_id: accountId || null,
      source_id: "csv",
    }));
    let failed: string | null = null;
    for (let i = 0; i < rows.length && !failed; i += CHUNK) {
      failed = (await db.from("transactions").insert(rows.slice(i, i + CHUNK))).error?.message ?? null;
    }
    reloadData();
    setBusy(false);
    if (failed) return void toast.error("The import stopped part-way", { description: failed });
    toast.success(`${rows.length} ${rows.length === 1 ? "transaction" : "transactions"} imported`);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import a bank CSV</DialogTitle>
          <DialogDescription>
            Needs a date, a description and an amount (or debit and credit) column. Rows already in The Vault with the same date, amount and description are left out.
          </DialogDescription>
        </DialogHeader>
        <label className="glass-card-hover flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <Upload className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{file?.name ?? "Choose a .csv file"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) void picked.text().then((text) => setFile({ name: picked.name, text }));
            }}
          />
        </label>
        {parsed && (
          <>
            <p className="text-sm">
              <span className="font-semibold">{fresh.length}</span> new · {parsed.rows.length - fresh.length} already logged · {parsed.skipped} unreadable
            </p>
            <ul className="divide-y divide-border/40 text-xs" aria-label="Preview">
              {fresh.slice(0, PREVIEW).map((r, i) => (
                <li key={i} className="flex items-center gap-3 py-1.5">
                  <span className="w-20 shrink-0 text-muted-foreground">{r.date}</span>
                  <span data-private className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span data-private className={`tabular-nums ${r.type === "income" ? "text-accent" : ""}`}>
                    {r.type === "income" ? "+" : "-"}
                    {money(r.amount)}
                  </span>
                </li>
              ))}
              {fresh.length > PREVIEW && <li className="py-1.5 text-muted-foreground">and {fresh.length - PREVIEW} more</li>}
            </ul>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Flip signs
                <span className="block text-[11px] text-muted-foreground">For card statements that list purchases as positive amounts.</span>
              </span>
              <Switch checked={flip} onCheckedChange={setFlip} />
            </label>
            {accounts.length > 0 && <ThemedSelect aria-label="Account" value={accountId} onChange={setAccountId} options={accountOptions} />}
            <Button onClick={() => void run()} disabled={busy || fresh.length === 0}>
              {busy ? "Importing…" : `Import ${fresh.length}`}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReceiptDialog({ path, onClose }: { path: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!path} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
          <DialogDescription className="break-all font-mono text-[11px]">{path}</DialogDescription>
        </DialogHeader>
        {path &&
          (/\.pdf$/i.test(path) ? (
            <Suspense fallback={null}>
              <VaultPdf path={path} />
            </Suspense>
          ) : (
            <VaultImage path={path} alt="Receipt" />
          ))}
      </DialogContent>
    </Dialog>
  );
}
