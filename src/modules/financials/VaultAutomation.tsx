import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAppActions, useAppLoading, useFinancialCategories, useTransactions } from "@/contexts/AppContext";
import { useNow } from "@/hooks/useOrbitReview";
import { useFinanceActions, useFinanceQuery } from "@/hooks/useFinance";
import { budgetAlerts, budgetLines, categorise, dueOccurrences, recurringSourceId } from "@/lib/finance";
import { db } from "@/lib/localDb";
import { billAlerts, mailPurchases, upcomingBills } from "@/lib/mailPurchases";
import { deliver } from "@/lib/notifications";
import { isQuiet, useNotifySettings } from "@/lib/notifySettings";
import { addDays, toLocalDateStr } from "@/lib/utils";
import { useKnownSources, useMailItems } from "./shared";

async function inDatabase(sourceId: string) {
  const { data, error } = await db.from("transactions").select("id").eq("source_id", sourceId);
  return !!error || (data?.length ?? 0) > 0;
}

export default function VaultAutomation() {
  const now = useNow();
  const loading = useAppLoading();
  const transactions = useTransactions();
  const categories = useFinancialCategories();
  const { addTransaction } = useAppActions();
  const finance = useFinanceQuery().data;
  const { save } = useFinanceActions();
  const items = useMailItems();
  const known = useKnownSources();
  const settings = useNotifySettings();
  const logging = useRef(false);
  const importing = useRef(false);

  useEffect(() => {
    if (loading || !finance || logging.current) return;
    const today = toLocalDateStr();
    const due = finance.recurring.filter((r) => r.nextDate <= today);
    if (due.length === 0) return;
    logging.current = true;
    (async () => {
      let added = 0;
      for (const r of due) {
        const { dates, nextDate } = dueOccurrences(r, today);
        for (const date of dates) {
          const sourceId = recurringSourceId(r.id, date);
          if (known.has(sourceId) || (await inDatabase(sourceId))) continue;
          await addTransaction({ name: r.name, amount: r.amount, type: r.type, categoryId: r.categoryId ?? "", date, accountId: r.accountId, sourceId });
          added++;
        }
        await save("recurring", { id: r.id, nextDate });
      }
      if (added > 0) toast.success(`${added} recurring transaction${added === 1 ? "" : "s"} logged`);
    })()
      .catch((err) => console.warn("[crystal-os] Recurring transactions failed:", err))
      .finally(() => {
        logging.current = false;
      });
  }, [loading, finance, known, addTransaction, save]);

  useEffect(() => {
    if (loading || !finance || !items || importing.current) return;
    const purchases = mailPurchases(items, known);
    if (purchases.length === 0) return;
    importing.current = true;
    (async () => {
      const names: string[] = [];
      for (const p of purchases) {
        if (await inDatabase(p.sourceId)) continue;
        await addTransaction({ name: p.name, amount: p.amount, type: "expense", categoryId: categorise(p.name, finance.rules, transactions), date: p.date, sourceId: p.sourceId });
        names.push(p.name);
      }
      if (names.length > 0) {
        const shown = names.slice(0, 3).join(", ");
        toast.success(`${names.length} purchase${names.length === 1 ? "" : "s"} added from mail`, { description: names.length > 3 ? `${shown} and ${names.length - 3} more` : shown });
      }
    })()
      .catch((err) => console.warn("[crystal-os] Mail purchases failed:", err))
      .finally(() => {
        importing.current = false;
      });
  }, [loading, finance, items, known, transactions, addTransaction]);

  useEffect(() => {
    if (isQuiet(settings, now)) return;
    const today = toLocalDateStr(now);
    if (settings.budgetAlerts && !loading) {
      const month = today.slice(0, 7);
      deliver(budgetAlerts(budgetLines(transactions, categories, month), month));
    }
    if (settings.billReminders && items && finance && !loading) deliver(billAlerts(upcomingBills(items, known), today, addDays(today, 1)));
  }, [now, settings, loading, finance, transactions, categories, items, known]);

  return null;
}
