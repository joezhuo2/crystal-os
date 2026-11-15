import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addTradeEvent,
  deleteTradeEvent,
  fetchTrades,
  importTradesCsv,
  saveTradeJournal,
  syncTrades,
  updateTradeEvent,
  type TradesData,
} from "@/lib/trades";

const KEY = ["trades"];

export function useTrades(enabled = true) {
  return useQuery({ queryKey: KEY, queryFn: fetchTrades, staleTime: 60_000, enabled });
}

export function useTradesSync() {
  const queryClient = useQueryClient();
  const mutation = useMutation<TradesData, Error>({
    mutationFn: syncTrades,
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
  const { mutate } = mutation;
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    mutate();
  }, [mutate]);

  const sync = useCallback(() => mutate(), [mutate]);
  return { sync, isPending: mutation.isPending, error: mutation.error };
}

function useTradesMutation<V, R extends TradesData>(fn: (v: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}

export const useAddTradeEvent = () => useTradesMutation(addTradeEvent);
export const useUpdateTradeEvent = () => useTradesMutation(updateTradeEvent);
export const useDeleteTradeEvent = () => useTradesMutation(deleteTradeEvent);
export const useImportTradesCsv = () => useTradesMutation(importTradesCsv);
export const useSaveTradeJournal = () =>
  useTradesMutation(({ positionId, journal }: { positionId: string; journal: Parameters<typeof saveTradeJournal>[1] }) =>
    saveTradeJournal(positionId, journal),
  );
