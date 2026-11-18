import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useAppActions, useFinancialCategories, useTransactions } from "@/contexts/AppContext";
import { useFinance, useFinanceActions } from "@/hooks/useFinance";
import { Button } from "@/components/ui/button";
import { DateField, ThemedSelect } from "@/components/ui/field-controls";
import { NumberInput } from "@/components/ui/number-input";
import {
  INTERVALS,
  accountBalances,
  budgetLines,
  categorise,
  goalProgress,
  money,
  monthlyCost,
  netWorth,
  netWorthTrend,
} from "@/lib/finance";
import { dueLabel } from "@/lib/mail";
import { upcomingBills } from "@/lib/mailPurchases";
import { openExternal } from "@/lib/platform";
import { toLocalDateStr } from "@/lib/utils";
import { ChartFrame, LineAreaChart, type Series } from "./FinanceCharts";
import { CARD_TITLE, FIELD, ICON_BUTTON, useAccountOptions, useKnownSources, useMailItems } from "./shared";

const AMBER = "hsl(38 92% 50%)";
const RED = "hsl(0 72% 51%)";
const WORTH_SERIES: Series<"worth">[] = [{ key: "worth", name: "Net worth", color: "hsl(160 84% 39%)", fillOpacity: 0.3 }];

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-2 w-full overflow-hidden rounded-full bg-white/10"
    >
      <div className="h-full transition-[width] duration-500" style={{ width: `${ratio * 100}%`, background: color }} />
    </div>
  );
}

export function BudgetsCard() {
  const transactions = useTransactions();
  const categories = useFinancialCategories();
  const lines = useMemo(() => budgetLines(transactions, categories, toLocalDateStr().slice(0, 7)), [transactions, categories]);

  return (
    <div className="glass-card-hover p-5 space-y-3">
      <p className={CARD_TITLE}>Budgets This Month</p>
      {lines.length === 0 && <p className="text-xs text-muted-foreground">Set a monthly budget on a category in Categories to track it here.</p>}
      {lines.map((l) => (
        <div key={l.id} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium truncate">{l.name}</span>
            <span className="text-xs text-muted-foreground shrink-0" data-private>
              {money(l.spent)} of {money(l.budget)}
            </span>
          </div>
          <Meter label={`${l.name} budget used`} value={l.spent} max={l.budget} color={l.ratio >= 1 ? RED : l.ratio >= 0.8 ? AMBER : l.color} />
        </div>
      ))}
    </div>
  );
}

export function UpcomingCard({ onManage }: { onManage: () => void }) {
  const { recurring, rules } = useFinance();
  const transactions = useTransactions();
  const { addTransaction } = useAppActions();
  const { skip } = useFinanceActions();
  const mailItems = useMailItems();
  const known = useKnownSources();
  const today = toLocalDateStr();
  const bills = useMemo(() => upcomingBills(mailItems ?? [], known), [mailItems, known]);
  const sorted = useMemo(() => [...recurring].sort((a, b) => a.nextDate.localeCompare(b.nextDate)), [recurring]);
  const cost = monthlyCost(recurring);

  return (
    <div className="glass-card-hover p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className={CARD_TITLE}>Upcoming</p>
        <Button type="button" size="sm" variant="ghost" onClick={onManage}>
          Manage
        </Button>
      </div>
      {recurring.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span data-private className="font-semibold text-foreground">
            {money(cost)}
          </span>{" "}
          recurring costs per month
        </p>
      )}
      {sorted.length === 0 && bills.length === 0 && <p className="text-xs text-muted-foreground">Nothing upcoming. Add a recurring item or connect your mail.</p>}
      <ul className="space-y-1.5">
        {sorted.map((r) => (
          <li key={r.id} className="flex items-center gap-3 text-sm">
            <span className="flex-1 min-w-0">
              <span className="block truncate font-medium">{r.name}</span>
              <span className="block text-[10px] text-muted-foreground">
                {INTERVALS.find((i) => i.value === r.interval)?.label} · {r.nextDate}
              </span>
            </span>
            <span data-private className={`tabular-nums font-semibold ${r.type === "income" ? "text-accent" : ""}`}>
              {r.type === "income" ? "+" : "-"}${r.amount.toFixed(2)}
            </span>
          </li>
        ))}
        {bills.map((b) => (
          <li key={b.sourceId} className="flex items-center gap-2 text-sm">
            <span className="flex-1 min-w-0">
              <span className="block truncate font-medium">{b.name}</span>
              <span className="block text-[10px] text-muted-foreground">{dueLabel(b.dueDate, today)}</span>
            </span>
            {b.amount !== null && (
              <span data-private className="tabular-nums font-semibold">
                {money(b.amount)}
              </span>
            )}
            <button type="button" aria-label={`Open email for ${b.name}`} title="Open email" className={ICON_BUTTON} onClick={() => void openExternal(b.url)}>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            {b.amount !== null && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  addTransaction({
                    name: b.name,
                    amount: b.amount!,
                    type: "expense",
                    categoryId: categorise(b.name, rules, transactions),
                    date: today,
                    sourceId: b.sourceId,
                  })
                }
              >
                Log
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => void skip(b.sourceId)}>
              Dismiss
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BLANK_ACCOUNT = { id: "", name: "", opening: "" };

export function AccountsCard() {
  const { accounts } = useFinance();
  const transactions = useTransactions();
  const { save, remove } = useFinanceActions();
  const { reloadData } = useAppActions();
  const [form, setForm] = useState(BLANK_ACCOUNT);
  const today = toLocalDateStr();
  const balances = useMemo(() => accountBalances(accounts, transactions), [accounts, transactions]);
  const trend = useMemo(() => netWorthTrend(accounts, transactions, today), [accounts, transactions, today]);
  const opening = Number(form.opening);
  const valid = form.name.trim() !== "" && Number.isFinite(opening);

  const submit = async () => {
    if (!valid) return;
    const ok = await save("accounts", { ...(form.id ? { id: form.id } : {}), name: form.name.trim(), openingBalance: opening });
    if (ok) setForm(BLANK_ACCOUNT);
  };

  return (
    <div className="glass-card-hover p-5 space-y-3">
      <p className={CARD_TITLE}>Accounts</p>
      <p className="text-2xl font-semibold tabular-nums" data-private>
        <AnimatedNumber value={netWorth(balances)} format={money} />
      </p>
      {accounts.length > 0 && (
        <ChartFrame height={120}>
          {(width, animate) => (
            <LineAreaChart
              width={width}
              height={120}
              data={trend}
              labelKey="label"
              series={WORTH_SERIES}
              animate={animate}
              label={`Net worth over the last 12 months: ${money(trend[trend.length - 1].worth)} now`}
            />
          )}
        </ChartFrame>
      )}
      <ul className="space-y-1.5">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate font-medium">{a.name}</span>
            <span data-private className="tabular-nums font-semibold">
              <AnimatedNumber value={balances.get(a.id) ?? 0} format={money} />
            </span>
            <button
              type="button"
              aria-label={`Edit ${a.name}`}
              className={ICON_BUTTON}
              onClick={() => setForm({ id: a.id, name: a.name, opening: String(a.openingBalance) })}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" aria-label={`Delete ${a.name}`} className={ICON_BUTTON} onClick={() => void remove("accounts", a.id).then(reloadData)}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          aria-label="Account name"
          placeholder="Account name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={`${FIELD} flex-1 min-w-32`}
        />
        <NumberInput
          unstyled
          step="0.01"
          aria-label="Opening balance"
          placeholder="Opening balance"
          value={form.opening}
          onChange={(e) => setForm((f) => ({ ...f, opening: e.target.value }))}
          className={`${FIELD} w-36 text-right`}
        />
        <Button type="submit" size="sm" disabled={!valid}>
          {form.id ? "Save" : "Add"}
        </Button>
      </form>
      <p className="text-[11px] text-muted-foreground">
        Transactions without an account do not change any balance. Move money between accounts with a Transfer.
      </p>
    </div>
  );
}

const BLANK_GOAL = { id: "", name: "", target: "", deadline: "", accountId: "", saved: "" };

export function GoalsCard() {
  const { goals, accounts } = useFinance();
  const transactions = useTransactions();
  const { save, remove } = useFinanceActions();
  const accountOptions = useAccountOptions("Track by hand");
  const [form, setForm] = useState(BLANK_GOAL);
  const today = toLocalDateStr();
  const balances = useMemo(() => accountBalances(accounts, transactions), [accounts, transactions]);
  const target = Number(form.target);
  const valid = form.name.trim() !== "" && target > 0;

  const submit = async () => {
    if (!valid) return;
    const ok = await save("goals", {
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      target,
      deadline: form.deadline || null,
      accountId: form.accountId || null,
      saved: form.accountId ? 0 : Number(form.saved) || 0,
    });
    if (ok) setForm(BLANK_GOAL);
  };

  return (
    <div className="glass-card-hover p-5 space-y-3">
      <p className={CARD_TITLE}>Savings Goals</p>
      {goals.length === 0 && <p className="text-xs text-muted-foreground">No goals yet.</p>}
      {goals.map((g) => {
        const p = goalProgress(g, balances, today);
        return (
          <div key={g.id} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate font-medium">{g.name}</span>
              <span className="text-xs text-muted-foreground" data-private>
                {money(p.saved)} of {money(g.target)}
              </span>
              <button
                type="button"
                aria-label={`Edit ${g.name}`}
                className={ICON_BUTTON}
                onClick={() =>
                  setForm({ id: g.id, name: g.name, target: String(g.target), deadline: g.deadline ?? "", accountId: g.accountId ?? "", saved: String(g.saved) })
                }
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" aria-label={`Delete ${g.name}`} className={ICON_BUTTON} onClick={() => void remove("goals", g.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <Meter label={`${g.name} progress`} value={p.ratio} max={1} color="hsl(160 84% 39%)" />
            {(g.deadline || p.perMonth !== null) && (
              <p className="text-[10px] text-muted-foreground">
                {g.deadline && `By ${g.deadline}`}
                {g.deadline && p.perMonth !== null && " · "}
                {p.perMonth !== null && (
                  <>
                    <span data-private>{money(p.perMonth)}</span> per month to stay on track
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          aria-label="Goal name"
          placeholder="Goal name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={`${FIELD} flex-1 min-w-32`}
        />
        <NumberInput
          unstyled
          min={0}
          step="0.01"
          aria-label="Target"
          placeholder="Target"
          value={form.target}
          onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
          className={`${FIELD} w-28 text-right`}
        />
        <DateField clearable aria-label="Deadline" value={form.deadline} onChange={(v) => setForm((f) => ({ ...f, deadline: v }))} className="w-40" />
        <ThemedSelect
          aria-label="Account"
          value={form.accountId}
          onChange={(v) => setForm((f) => ({ ...f, accountId: v }))}
          options={accountOptions}
          className="w-40"
        />
        {!form.accountId && (
          <NumberInput
            unstyled
            min={0}
            step="0.01"
            aria-label="Saved so far"
            placeholder="Saved so far"
            value={form.saved}
            onChange={(e) => setForm((f) => ({ ...f, saved: e.target.value }))}
            className={`${FIELD} w-32 text-right`}
          />
        )}
        <Button type="submit" size="sm" disabled={!valid}>
          {form.id ? "Save" : "Add"}
        </Button>
      </form>
    </div>
  );
}
