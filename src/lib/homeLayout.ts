/**
 * The Home grid's arrangement: widget order, which are hidden, and how many
 * columns each spans. Saved in localStorage, so each device keeps its own.
 */

export type WidgetSize = 1 | 2 | 3;

export interface HomeLayout {
  order: string[];
  hidden: string[];
  sizes: Record<string, WidgetSize>;
}

export const HOME_LAYOUT_KEY = "crystal-os-home-layout";

const isSize = (n: unknown): n is WidgetSize => n === 1 || n === 2 || n === 3;

/**
 * A layout that names exactly the widgets in `ids`: unknown ids from an older
 * version are dropped, and widgets added since are appended in their default
 * place, so a saved layout never hides a new widget or breaks on a removed one.
 */
export function normalizeLayout(raw: unknown, ids: readonly string[]): HomeLayout {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof HomeLayout, unknown>>;
  const known = new Set(ids);
  const strings = (list: unknown) =>
    Array.isArray(list) ? list.filter((id): id is string => typeof id === "string" && known.has(id)) : [];

  const order = [...new Set(strings(value.order))];
  for (const id of ids) if (!order.includes(id)) order.push(id);

  const sizes: Record<string, WidgetSize> = {};
  if (value.sizes && typeof value.sizes === "object") {
    for (const [id, size] of Object.entries(value.sizes as Record<string, unknown>)) {
      if (known.has(id) && isSize(size)) sizes[id] = size;
    }
  }

  return { order, hidden: [...new Set(strings(value.hidden))], sizes };
}

export function loadLayout(ids: readonly string[]): HomeLayout {
  try {
    const raw = localStorage.getItem(HOME_LAYOUT_KEY);
    return normalizeLayout(raw ? JSON.parse(raw) : null, ids);
  } catch {
    return normalizeLayout(null, ids);
  }
}

export function saveLayout(layout: HomeLayout): void {
  try {
    localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* storage full or blocked: the layout just won't persist */
  }
}

export function clearLayout(): void {
  try {
    localStorage.removeItem(HOME_LAYOUT_KEY);
  } catch {
    /* ignore */
  }
}

/** `order` with `id` moved to sit where `targetId` is now. */
export function moveBefore(order: string[], id: string, targetId: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return order;
  const next = order.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

/** `order` with `id` and `targetId` trading places; everything else stays put. */
export function swap(order: string[], id: string, targetId: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return order;
  const next = [...order];
  next[from] = targetId;
  next[to] = id;
  return next;
}

/** `order` with `id` moved one step among the visible widgets (-1 earlier, 1 later). */
export function nudge(order: string[], hidden: string[], id: string, step: -1 | 1): string[] {
  const visible = order.filter((x) => !hidden.includes(x));
  const target = visible[visible.indexOf(id) + step];
  return target ? moveBefore(order, id, target) : order;
}

export function setHidden(layout: HomeLayout, id: string, hide: boolean): HomeLayout {
  const hidden = layout.hidden.filter((x) => x !== id);
  return { ...layout, hidden: hide ? [...hidden, id] : hidden };
}

export function setSize(layout: HomeLayout, id: string, size: WidgetSize, defaultSize: WidgetSize = 1): HomeLayout {
  const sizes = { ...layout.sizes };
  if (size === defaultSize) delete sizes[id];
  else sizes[id] = size;
  return { ...layout, sizes };
}
