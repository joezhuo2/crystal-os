/**
 * Split layout for the Terminal tab: a binary tree whose leaves are terminal
 * tab keys. A tab dragged onto a pane's edge splits that pane in two; dropped
 * on its middle it takes that pane's place. At most `MAX_PANES` shells are on
 * screen at once.
 */

export const MAX_PANES = 4;

/** Smallest share of a split either side may be dragged down to. */
export const MIN_RATIO = 0.15;

export type Direction = "row" | "col";
export type DropZone = "left" | "right" | "top" | "bottom" | "center";

export type LayoutNode =
  | { type: "pane"; key: string }
  /** `row` puts `a` left of `b`; `col` puts `a` above `b`. `ratio` is `a`'s share. */
  | { type: "split"; dir: Direction; ratio: number; a: LayoutNode; b: LayoutNode };

export interface Layout {
  root: LayoutNode | null;
  /** The pane that takes keyboard input, Refresh and the header's shell name. */
  focused: string | null;
}

/** Fractions of the pane area, 0–1 on both axes. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Divider {
  /** Route from the root to the split: "a" / "b" per level. */
  path: string;
  dir: Direction;
  /** The whole split's area, which a drag on the divider is measured against. */
  rect: Rect;
  ratio: number;
}

export const EMPTY_LAYOUT: Layout = { root: null, focused: null };

const pane = (key: string): LayoutNode => ({ type: "pane", key });

export function paneKeys(node: LayoutNode | null): string[] {
  if (!node) return [];
  return node.type === "pane" ? [node.key] : [...paneKeys(node.a), ...paneKeys(node.b)];
}

/**
 * Rebuilds the tree with every leaf passed through `f`; leaves mapped to null
 * are dropped and their sibling takes the parent split's place.
 */
export function mapPanes(node: LayoutNode | null, f: (key: string) => string | null): LayoutNode | null {
  if (!node) return null;
  if (node.type === "pane") {
    const key = f(node.key);
    return key === null ? null : pane(key);
  }
  const a = mapPanes(node.a, f);
  const b = mapPanes(node.b, f);
  if (!a || !b) return a ?? b;
  return { ...node, a, b };
}

/**
 * Shows `key`: focuses its pane when it is on screen, otherwise puts it in
 * the focused pane's place.
 */
export function selectPane(layout: Layout, key: string): Layout {
  const keys = paneKeys(layout.root);
  if (keys.includes(key)) return { ...layout, focused: key };
  const replace = layout.focused && keys.includes(layout.focused) ? layout.focused : keys[0];
  if (replace === undefined) return { root: pane(key), focused: key };
  return { root: mapPanes(layout.root, (k) => (k === replace ? key : k)), focused: key };
}

/** Takes `key` off screen; its shell keeps running in its tab. */
export function removePane(layout: Layout, key: string, fallback: string | null = null): Layout {
  const before = paneKeys(layout.root);
  if (!before.includes(key)) return layout;
  const root = mapPanes(layout.root, (k) => (k === key ? null : k));
  if (!root) return fallback === null ? EMPTY_LAYOUT : { root: pane(fallback), focused: fallback };
  const keys = paneKeys(root);
  if (layout.focused !== key && layout.focused !== null && keys.includes(layout.focused)) return { root, focused: layout.focused };
  // Focus passes to the pane that sat next to the removed one.
  const index = before.indexOf(key);
  return { root, focused: keys[Math.min(index, keys.length - 1)] };
}

/** Whether dropping `dragged` on a pane's edge would add a pane. */
export function canSplit(layout: Layout, dragged: string): boolean {
  const keys = paneKeys(layout.root);
  return keys.includes(dragged) || keys.length < MAX_PANES;
}

/** What a drop on `zone` actually does, after the pane limit is applied. */
export function effectiveZone(layout: Layout, dragged: string, target: string, zone: DropZone): DropZone | null {
  if (dragged === target) return null;
  if (zone !== "center" && !canSplit(layout, dragged)) return "center";
  return zone;
}

export function dropOnPane(layout: Layout, dragged: string, target: string, zone: DropZone): Layout {
  const effective = effectiveZone(layout, dragged, target, zone);
  if (!effective || !paneKeys(layout.root).includes(target)) return layout;
  const onScreen = paneKeys(layout.root).includes(dragged);

  if (effective === "center") {
    // On screen already: the two trade places. Otherwise it takes the target's.
    const root = mapPanes(layout.root, (k) => (k === target ? dragged : onScreen && k === dragged ? target : k));
    return { root, focused: dragged };
  }

  // Lift the dragged pane out first so moving it never adds a pane.
  const rest = onScreen ? mapPanes(layout.root, (k) => (k === dragged ? null : k)) : layout.root;
  const dir: Direction = effective === "left" || effective === "right" ? "row" : "col";
  const first = effective === "left" || effective === "top";
  const replace = (node: LayoutNode): LayoutNode => {
    if (node.type === "pane") {
      if (node.key !== target) return node;
      return { type: "split", dir, ratio: 0.5, a: first ? pane(dragged) : node, b: first ? node : pane(dragged) };
    }
    return { ...node, a: replace(node.a), b: replace(node.b) };
  };
  return { root: rest && replace(rest), focused: dragged };
}

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, ratio));
}

export function setRatio(node: LayoutNode | null, path: string, ratio: number): LayoutNode | null {
  if (!node || node.type === "pane") return node;
  if (path === "") return { ...node, ratio: clampRatio(ratio) };
  const [step, rest] = [path[0], path.slice(1)];
  if (step === "a") return { ...node, a: setRatio(node.a, rest, ratio)! };
  return { ...node, b: setRatio(node.b, rest, ratio)! };
}

/** Where each pane and divider sits, as fractions of the pane area. */
export function measure(root: LayoutNode | null): { panes: Map<string, Rect>; dividers: Divider[] } {
  const panes = new Map<string, Rect>();
  const dividers: Divider[] = [];
  const walk = (node: LayoutNode, rect: Rect, path: string) => {
    if (node.type === "pane") {
      panes.set(node.key, rect);
      return;
    }
    dividers.push({ path, dir: node.dir, rect, ratio: node.ratio });
    if (node.dir === "row") {
      const w = rect.w * node.ratio;
      walk(node.a, { ...rect, w }, `${path}a`);
      walk(node.b, { ...rect, x: rect.x + w, w: rect.w - w }, `${path}b`);
    } else {
      const h = rect.h * node.ratio;
      walk(node.a, { ...rect, h }, `${path}a`);
      walk(node.b, { ...rect, y: rect.y + h, h: rect.h - h }, `${path}b`);
    }
  };
  if (root) walk(root, { x: 0, y: 0, w: 1, h: 1 }, "");
  return { panes, dividers };
}

/**
 * Which part of a pane the pointer is over, from its position inside the pane
 * (0–1 on both axes): the nearest edge, or the middle when no edge is close.
 */
export function zoneAt(px: number, py: number, edge = 0.3): DropZone {
  const distances: [DropZone, number][] = [
    ["left", px],
    ["right", 1 - px],
    ["top", py],
    ["bottom", 1 - py],
  ];
  const [zone, distance] = distances.reduce((best, d) => (d[1] < best[1] ? d : best));
  return distance < edge ? zone : "center";
}

/** The part of `rect` a drop on `zone` would fill, for the preview outline. */
export function zoneRect(rect: Rect, zone: DropZone): Rect {
  switch (zone) {
    case "left":
      return { ...rect, w: rect.w / 2 };
    case "right":
      return { ...rect, x: rect.x + rect.w / 2, w: rect.w / 2 };
    case "top":
      return { ...rect, h: rect.h / 2 };
    case "bottom":
      return { ...rect, y: rect.y + rect.h / 2, h: rect.h / 2 };
    default:
      return rect;
  }
}
