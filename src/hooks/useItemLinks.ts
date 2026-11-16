import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/localDb";

export type LinkKind = "event" | "transaction" | "trade" | "mail";

export interface ItemLink {
  kind: LinkKind;
  itemId: string;
  title: string;
  notePath: string;
  meta: Record<string, string>;
}

export type LinkTarget = Omit<ItemLink, "notePath" | "meta"> & { meta?: Record<string, string> };

export const ITEM_LINKS_KEY = ["item-links"];
export const linkKey = (kind: LinkKind, itemId: string) => `${kind}:${itemId}`;

async function fetchLinks(): Promise<ItemLink[]> {
  const { data, error } = await db.from("links").select("kind, item_id, title, note_path, meta");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    kind: r.kind as LinkKind,
    itemId: String(r.item_id),
    title: String(r.title ?? ""),
    notePath: String(r.note_path),
    meta: (r.meta as Record<string, string> | null) ?? {},
  }));
}

export function useItemLinks(): ItemLink[] {
  return useQuery({ queryKey: ITEM_LINKS_KEY, queryFn: fetchLinks, staleTime: 5 * 60 * 1000 }).data ?? [];
}

export function useSetItemLink() {
  const queryClient = useQueryClient();
  return useCallback(
    async (target: LinkTarget, notePath: string | undefined) => {
      const { kind, itemId, title, meta = {} } = target;
      const { error } = notePath
        ? await db.from("links").upsert({ kind, item_id: itemId, title, note_path: notePath, meta }, { onConflict: "kind,item_id" })
        : await db.from("links").delete().eq("kind", kind).eq("item_id", itemId);
      if (error) {
        toast.error("Could not save the link", { description: error.message });
        return;
      }
      queryClient.setQueryData<ItemLink[]>(ITEM_LINKS_KEY, (prev = []) => [
        ...prev.filter((l) => linkKey(l.kind, l.itemId) !== linkKey(kind, itemId)),
        ...(notePath ? [{ kind, itemId, title, notePath, meta }] : []),
      ]);
    },
    [queryClient],
  );
}
