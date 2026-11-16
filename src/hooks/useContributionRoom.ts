import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ROOM_ACCOUNTS, type RoomAccount, type RoomEntry, type RoomKind } from "@/lib/contributionRoom";
import { db, type DbError } from "@/lib/localDb";

const KEY = ["app", "contributions"] as const;
const KINDS: RoomKind[] = ["room", "deposit", "withdrawal"];

async function fetchEntries(): Promise<RoomEntry[]> {
  const { data, error } = await db.from("contributions").select("id, account, kind, amount, date").order("date");
  if (error) throw new Error(error.message);
  return ((data ?? []) as RoomEntry[]).filter(
    (r) => ROOM_ACCOUNTS.includes(r.account) && KINDS.includes(r.kind) && typeof r.amount === "number" && typeof r.date === "string",
  );
}

export function useContributionRoom() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: fetchEntries, enabled: !!user });

  const done = useCallback(
    (action: string, error: DbError | null) => {
      if (error) toast.error(`Could not ${action}`, { description: error.message });
      return queryClient.invalidateQueries({ queryKey: KEY });
    },
    [queryClient],
  );

  const actions = useMemo(
    () => ({
      async setRoom(account: RoomAccount, year: string, amount: number | null) {
        const existing = (queryClient.getQueryData<RoomEntry[]>(KEY) ?? []).filter(
          (e) => e.account === account && e.kind === "room" && e.date.slice(0, 4) === year,
        );
        for (const e of existing) await db.from("contributions").delete().eq("id", e.id);
        const { error } =
          amount === null ? { error: null } : await db.from("contributions").insert({ account, kind: "room", amount, date: `${year}-01-01` });
        await done("save the room", error);
      },
      async add(entry: Omit<RoomEntry, "id">) {
        const { error } = await db.from("contributions").insert(entry);
        await done("save the entry", error);
      },
      async remove(id: string) {
        const { error } = await db.from("contributions").delete().eq("id", id);
        await done("delete the entry", error);
      },
    }),
    [done, queryClient],
  );

  return { entries: query.data ?? [], loading: query.isLoading, error: query.error, ...actions };
}
