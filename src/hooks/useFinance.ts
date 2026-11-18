import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Account, CategoryRule, Recurring, SavingsGoal } from "@/lib/finance";
import { db, type DbError } from "@/lib/localDb";

export const FINANCE_QUERY_KEY = ["app", "finance"] as const;

const TABLES = {
  accounts: "accounts",
  recurring: "recurring_transactions",
  rules: "category_rules",
  goals: "savings_goals",
} as const;

interface Rows {
  accounts: Account;
  recurring: Recurring;
  rules: CategoryRule;
  goals: SavingsGoal;
}

export type FinanceTable = keyof Rows;

export interface FinanceData extends Record<FinanceTable, unknown[]> {
  accounts: Account[];
  recurring: Recurring[];
  rules: CategoryRule[];
  goals: SavingsGoal[];
  skips: string[];
}

const EMPTY: FinanceData = { accounts: [], recurring: [], rules: [], goals: [], skips: [] };

type Row = Record<string, unknown>;

export const camelRow = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]));

export const snakeRow = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));

async function fetchFinance(): Promise<FinanceData> {
  const names = Object.keys(TABLES) as FinanceTable[];
  const [skips, ...results] = await Promise.all([
    db.from("import_skips").select("source_id"),
    ...names.map((name) => db.from(TABLES[name]).select("*").order("created_at")),
  ]);
  const error = skips.error ?? results.find((r) => r.error)?.error;
  if (error) throw new Error(error.message);
  const data = { ...EMPTY, skips: (skips.data ?? []).map((r) => r.source_id as string) };
  names.forEach((name, i) => {
    (data[name] as unknown[]) = (results[i].data ?? []).map(camelRow);
  });
  return data;
}

export function useFinanceQuery() {
  const { user } = useAuth();
  return useQuery<FinanceData, Error>({ queryKey: FINANCE_QUERY_KEY, queryFn: fetchFinance, staleTime: 5 * 60 * 1000, enabled: !!user });
}

export function useFinance(): FinanceData {
  return useFinanceQuery().data ?? EMPTY;
}

export function useFinanceActions() {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const done = async (action: string, write: PromiseLike<{ error: DbError | null }>) => {
      const { error } = await write;
      if (error) toast.error(`Could not ${action}`, { description: error.message });
      await queryClient.invalidateQueries({ queryKey: FINANCE_QUERY_KEY });
      return !error;
    };
    return {
      save<K extends FinanceTable>(table: K, { id, ...row }: Partial<Rows[K]>) {
        const target = db.from(TABLES[table]);
        return done("save that", id ? target.update(snakeRow(row)).eq("id", id) : target.insert(snakeRow(row)));
      },
      remove: (table: FinanceTable, id: string) => done("delete that", db.from(TABLES[table]).delete().eq("id", id)),
      skip: (sourceId: string) =>
        done("dismiss that", db.from("import_skips").upsert({ source_id: sourceId }, { onConflict: "source_id", ignoreDuplicates: true })),
    };
  }, [queryClient]);
}
