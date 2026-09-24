/**
 * Layout and light maths for The Archive's crystal backdrop
 * (src/components/layout/ObsidianBackdrop.tsx). Kept free of the DOM so the
 * geometry is testable.
 */

/** A point inside a crystal's box, as percentages of its width and height. */
type Point = readonly [x: number, y: number];

export interface CrystalShape {
  /** Outline, clockwise from the tip. The tip is at the top, the base along the bottom. */
  outline: readonly Point[];
  /** Facet lines drawn inside the outline, as an SVG path in a 0–100 box. */
  facets: string;
  /** Width as a fraction of height. */
  aspect: readonly [min: number, max: number];
}

export type CrystalShapeId = "prism" | "shard" | "gem" | "obelisk" | "twin";

export const CRYSTAL_SHAPES: Record<CrystalShapeId, CrystalShape> = {
  prism: {
    outline: [[50, 0], [88, 24], [84, 100], [16, 100], [12, 24]],
    facets: "M50 0 L50 100 M12 24 L50 36 L88 24",
    aspect: [0.42, 0.55],
  },
  shard: {
    outline: [[58, 0], [92, 30], [78, 100], [18, 100], [8, 38]],
    facets: "M58 0 L46 46 L78 100 M8 38 L46 46 L92 30 M46 46 L18 100",
    aspect: [0.55, 0.7],
  },
  gem: {
    outline: [[50, 0], [100, 62], [72, 100], [28, 100], [0, 62]],
    facets: "M0 62 L100 62 M50 0 L28 62 L40 100 M50 0 L72 62 L60 100 M50 0 L50 100",
    aspect: [0.85, 1.05],
  },
  obelisk: {
    outline: [[50, 0], [74, 14], [70, 100], [30, 100], [26, 14]],
    facets: "M50 0 L50 100 M26 14 L50 20 L74 14",
    aspect: [0.26, 0.34],
  },
  twin: {
    outline: [[30, 0], [48, 30], [62, 8], [84, 40], [78, 100], [18, 100], [14, 34]],
    facets: "M30 0 L32 40 L48 30 M62 8 L60 46 L84 40 M14 34 L32 40 L40 100 M48 30 L60 46 L58 100",
    aspect: [0.75, 0.9],
  },
};

const SHAPE_IDS = Object.keys(CRYSTAL_SHAPES) as CrystalShapeId[];

export interface CrystalSpec {
  shape: CrystalShapeId;
  /** Point on a screen edge or corner the crystal grows from, in viewport %. */
  x: number;
  y: number;
  /** Offset from that point to the centre of the base, in vmin. Always off-screen. */
  ox: number;
  oy: number;
  /** Box size in vmin. The height includes the part hidden past the edge. */
  w: number;
  h: number;
  /** Clockwise from pointing straight up, in degrees. */
  angle: number;
  /** Resting opacity of the glass and edges, 0.3–0.9. */
  opacity: number;
  /** Seconds for one float cycle, and its (negative) offset. */
  float: number;
  delay: number;
  /** Milliseconds before the crystal grows out of the edge. */
  emerge: number;
}

type Edge = "top" | "right" | "bottom" | "left";

/** Outward unit normal of each screen edge (y grows downward). */
const EDGE_NORMALS: Record<Edge, readonly [number, number]> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};

interface Cluster {
  /** Along-edge position in viewport %; corners pin both. */
  x: number;
  y: number;
  /** The edge(s) the cluster grows from. Two for a corner. */
  edges: readonly Edge[];
  /** Direction the cluster points, clockwise from up. */
  angle: number;
  count: number;
  /** Tallest visible length in the cluster, in vmin. */
  reach: number;
}

/**
 * Corners grow the biggest clusters; each edge is lined with smaller ones
 * spaced closely enough that the border reads as one band of crystal.
 */
const CLUSTERS: readonly Cluster[] = [
  { x: 0, y: 100, edges: ["left", "bottom"], angle: 45, count: 3, reach: 44 },
  { x: 100, y: 100, edges: ["right", "bottom"], angle: -45, count: 3, reach: 42 },
  { x: 0, y: 0, edges: ["left", "top"], angle: 135, count: 3, reach: 36 },
  { x: 100, y: 0, edges: ["right", "top"], angle: -135, count: 3, reach: 38 },
  { x: 12, y: 100, edges: ["bottom"], angle: 0, count: 2, reach: 22 },
  { x: 24, y: 100, edges: ["bottom"], angle: 0, count: 2, reach: 24 },
  { x: 36, y: 100, edges: ["bottom"], angle: 0, count: 2, reach: 22 },
  { x: 48, y: 100, edges: ["bottom"], angle: 0, count: 3, reach: 26 },
  { x: 60, y: 100, edges: ["bottom"], angle: 0, count: 3, reach: 24 },
  { x: 72, y: 100, edges: ["bottom"], angle: 0, count: 2, reach: 24 },
  { x: 84, y: 100, edges: ["bottom"], angle: 0, count: 1, reach: 20 },
  { x: 12, y: 0, edges: ["top"], angle: 180, count: 1, reach: 20 },
  { x: 24, y: 0, edges: ["top"], angle: 180, count: 2, reach: 22 },
  { x: 36, y: 0, edges: ["top"], angle: 180, count: 2, reach: 20 },
  { x: 48, y: 0, edges: ["top"], angle: 180, count: 2, reach: 24 },
  { x: 60, y: 0, edges: ["top"], angle: 180, count: 2, reach: 20 },
  { x: 72, y: 0, edges: ["top"], angle: 180, count: 2, reach: 24 },
  { x: 86, y: 0, edges: ["top"], angle: 180, count: 1, reach: 20 },
  { x: 100, y: 20, edges: ["right"], angle: -90, count: 1, reach: 20 },
  { x: 100, y: 36, edges: ["right"], angle: -90, count: 2, reach: 24 },
  { x: 100, y: 52, edges: ["right"], angle: -90, count: 2, reach: 26 },
  { x: 100, y: 68, edges: ["right"], angle: -90, count: 2, reach: 22 },
  { x: 0, y: 20, edges: ["left"], angle: 90, count: 1, reach: 20 },
  { x: 0, y: 36, edges: ["left"], angle: 90, count: 2, reach: 24 },
  { x: 0, y: 52, edges: ["left"], angle: 90, count: 2, reach: 28 },
  { x: 0, y: 68, edges: ["left"], angle: 90, count: 2, reach: 24 },
];

/** How far past the edge the base sits, in vmin. Covers the float and the rim stroke. */
export const BASE_MARGIN = 2;

/** Small seeded PRNG (mulberry32), so the layout is the same on every visit. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

/** Unit vectors along a crystal (base to tip) and across its base, for a CSS angle. */
export function crystalAxes(angle: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    tip: [Math.sin(rad), -Math.cos(rad)] as const,
    across: [Math.cos(rad), Math.sin(rad)] as const,
  };
}

/**
 * How far to push a crystal out along its axis so its whole flat base lies at
 * least BASE_MARGIN past one of `edges`. Both ends of the base must clear the
 * same edge, or the base could cut across a corner of the screen.
 */
function sinkDepth(angle: number, width: number, edges: readonly Edge[]): number {
  const { tip, across } = crystalAxes(angle);
  let best = Infinity;
  for (const edge of edges) {
    const [nx, ny] = EDGE_NORMALS[edge];
    // Outward distance gained per unit of sink, and how far the base's
    // nearer end lags behind its centre.
    const outward = -(tip[0] * nx + tip[1] * ny);
    const lag = (width / 2) * Math.abs(across[0] * nx + across[1] * ny);
    if (outward > 0.05) best = Math.min(best, (BASE_MARGIN + lag) / outward);
  }
  return Number.isFinite(best) ? best : 0;
}

/** Crystals growing in from the corners and edges, roots hidden past the screen. */
export function edgeCrystals(seed = 0x0b5d1a): CrystalSpec[] {
  const rng = seededRandom(seed);
  const crystals: CrystalSpec[] = [];
  CLUSTERS.forEach((cluster, c) => {
    const corner = cluster.edges.length === 2;
    // Wide crystals need a wide fan, or they pile on top of each other.
    const step = corner ? 28 : 24;
    for (let i = 0; i < cluster.count; i++) {
      const shape = SHAPE_IDS[Math.floor(rng() * SHAPE_IDS.length)];
      const [minAspect, maxAspect] = CRYSTAL_SHAPES[shape].aspect;
      // The middle of the fan is tallest.
      const centred = 1 - Math.abs(i - (cluster.count - 1) / 2) / cluster.count;
      const visible = cluster.reach * (0.45 + 0.35 * centred + 0.2 * rng());
      const w = round(visible * (minAspect + rng() * (maxAspect - minAspect)));
      const angle = Math.round(cluster.angle + (i - (cluster.count - 1) / 2) * step + (rng() - 0.5) * 12);
      // Corners stay pinned; edge crystals slide along their edge.
      let { x, y } = cluster;
      if (!corner) {
        if (cluster.edges[0] === "top" || cluster.edges[0] === "bottom") x += (rng() - 0.5) * 10;
        else y += (rng() - 0.5) * 10;
      }
      const sink = sinkDepth(angle, w, cluster.edges);
      const { tip } = crystalAxes(angle);
      crystals.push({
        shape,
        x: round(x),
        y: round(y),
        // Rounded outward, so rounding never pulls the base back on screen.
        ox: round(-tip[0] * (sink + 0.1)),
        oy: round(-tip[1] * (sink + 0.1)),
        w,
        h: round(visible + sink),
        angle,
        opacity: round(0.3 + rng() * 0.6, 2),
        float: round(7 + rng() * 7),
        delay: -round(rng() * 10),
        emerge: c * 35 + i * 60,
      });
    }
  });
  return crystals;
}

export const CRYSTALS: readonly CrystalSpec[] = edgeCrystals();

/** `polygon(...)` for clip-path. */
export function clipPolygon(outline: readonly Point[]): string {
  return `polygon(${outline.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;
}

/** `points` attribute for an SVG polygon in a 0–100 viewBox. */
export function svgPoints(outline: readonly Point[]): string {
  return outline.map(([x, y]) => `${x},${y}`).join(" ");
}

export interface CrystalFrame {
  /** Centre on screen, in px. The centre of the element's bounding rect. */
  cx: number;
  cy: number;
  /** Untransformed size, in px. */
  width: number;
  height: number;
  /** CSS rotation, clockwise, in degrees. */
  angle: number;
}

export interface CrystalLight {
  /** 0 when the cursor is out of reach, 1 when it is over the crystal. */
  lit: number;
  /** Cursor position in the crystal's own (unrotated) box, from its top-left, in px. */
  x: number;
  y: number;
}

/**
 * How strongly the cursor lights a crystal. Full inside the ellipse that fits
 * the crystal's box, easing to nothing `reach` box-radii beyond it. The cursor
 * is rotated into the crystal's frame first, so tilted crystals light along
 * their own length.
 */
export function crystalLight(frame: CrystalFrame, x: number, y: number, reach = 0.6): CrystalLight {
  const rad = (frame.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - frame.cx;
  const dy = y - frame.cy;
  // Inverse of CSS rotate(): screen offset back into the element's axes.
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  const rx = frame.width / 2;
  const ry = frame.height / 2;
  const local = { x: Math.round(u + rx), y: Math.round(v + ry) };
  if (rx <= 0 || ry <= 0) return { lit: 0, ...local };

  const d = Math.hypot(u / rx, v / ry);
  let lit: number;
  if (d <= 1) lit = 1;
  else if (d >= 1 + reach) lit = 0;
  else {
    const t = 1 - (d - 1) / reach;
    lit = t * t * (3 - 2 * t);
  }
  // Two decimals keeps style writes rare once the cursor settles.
  return { lit: Math.round(lit * 100) / 100, ...local };
}

export interface Sparkle {
  /** Position as a percentage of the containing box. */
  x: number;
  y: number;
  /** Size in px. */
  size: number;
  /** Peak opacity. */
  peak: number;
  /** Seconds. */
  duration: number;
  delay: number;
}

/** Random sparkles. `rng` returns [0, 1), like Math.random. */
export function makeSparkles(
  count: number,
  rng: () => number = Math.random,
  size: readonly [min: number, max: number] = [4, 14],
  area: { x: readonly [number, number]; y: readonly [number, number] } = { x: [0, 100], y: [0, 100] },
): Sparkle[] {
  return Array.from({ length: count }, () => ({
    x: round(area.x[0] + rng() * (area.x[1] - area.x[0])),
    y: round(area.y[0] + rng() * (area.y[1] - area.y[0])),
    size: Math.round(size[0] + rng() * (size[1] - size[0])),
    peak: round(0.45 + rng() * 0.55, 2),
    duration: round(2.5 + rng() * 4.5),
    // Negative delays start each sparkle mid-cycle, so they never blink in unison.
    delay: -round(rng() * 7),
  }));
}
