import { useMemo } from "react";
import { useFinancialCategories, useTransactions } from "@/contexts/AppContext";
import { useFinance } from "@/hooks/useFinance";
import { useMailDigest, useMailStatus } from "@/hooks/useMail";
import { UNCATEGORISED } from "@/lib/finance";
import { useIsInstalled } from "@/lib/installedModules";
import { mailWasConnected } from "@/lib/mail";
import { usesSidecar } from "@/lib/platform";

export const FIELD = "w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50";
export const CARD_TITLE = "text-xs text-muted-foreground uppercase tracking-widest";
export const ICON_BUTTON = "p-1 text-muted-foreground hover:text-primary transition-colors";

export function useCategoryOptions() {
  const categories = useFinancialCategories();
  return useMemo(
    () => [{ value: "", label: UNCATEGORISED.name, color: UNCATEGORISED.color }, ...categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))],
    [categories],
  );
}

export function useAccountOptions(none = "No account") {
  const { accounts } = useFinance();
  return useMemo(() => [{ value: "", label: none }, ...accounts.map((a) => ({ value: a.id, label: a.name }))], [accounts, none]);
}

export function useMailItems() {
  const on = useIsInstalled("mail");
  const status = useMailStatus(on && (!usesSidecar() || mailWasConnected()));
  return useMailDigest(on ? status.data?.accounts : []).data?.items;
}

const sourceIds = (transactions: { sourceId?: string | null }[]) => transactions.flatMap((t) => (t.sourceId ? [t.sourceId] : []));

export function useKnownSources(): ReadonlySet<string> {
  const logged = useTransactions(sourceIds);
  const { skips } = useFinance();
  return useMemo(() => new Set([...logged, ...skips]), [logged, skips]);
}
