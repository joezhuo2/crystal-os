import { useSyncExternalStore } from "react";

let ids: ReadonlySet<string> = new Set();
let anchor: string | null = null;
const listeners = new Set<() => void>();

const set = (next: ReadonlySet<string>) => {
  ids = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const taskSelection = {
  ids: () => ids,
  toggle(id: string) {
    const next = new Set(ids);
    if (!next.delete(id)) next.add(id);
    anchor = id;
    set(next);
  },
  extendTo(id: string, order: string[]) {
    const from = anchor ? order.indexOf(anchor) : -1;
    const to = order.indexOf(id);
    if (from < 0 || to < 0) return taskSelection.toggle(id);
    set(new Set([...ids, ...order.slice(Math.min(from, to), Math.max(from, to) + 1)]));
  },
  clear() {
    anchor = null;
    if (ids.size) set(new Set());
  },
};

export const useTaskSelected = (id: string) => useSyncExternalStore(subscribe, () => ids.has(id));
export const useSelectedTaskIds = () => useSyncExternalStore(subscribe, () => ids);
