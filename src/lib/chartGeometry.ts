/**
 * Geometry for the hand-drawn SVG charts (Financials). Pure functions, so the
 * charts need no chart library and the maths is testable on its own.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * 1, 2, 5 or 10 times a power of ten, whichever is nearest `raw` on a log
 * scale (d3's tickIncrement), so the tick count lands close to the one asked.
 */
function niceStep(raw: number): number {
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const nice = f >= Math.sqrt(50) ? 10 : f >= Math.sqrt(10) ? 5 : f >= Math.SQRT2 ? 2 : 1;
  return nice * exp;
}

/**
 * Round axis ticks covering `lo`..`hi`, about `count` of them. The domain is
 * widened to the outer ticks, so the first and last tick are its ends.
 */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (lo === 0) return niceTicks(0, 1, count);
    const pad = Math.abs(lo) * 0.1;
    return niceTicks(lo - pad, hi + pad, count);
  }
  const step = niceStep((hi - lo) / Math.max(1, count - 1));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  // Rounded to the step's precision so 0.1 + 0.2 never shows as 0.30000000000000004.
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(digits)));
  return ticks;
}

/** Maps `value` in [d0, d1] onto [r0, r1]. A zero-width domain maps to r0. */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0;
  return (value: number) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/**
 * A smooth path through `points` (sorted by x) that never overshoots between
 * them: the monotone cubic of Fritsch and Carlson, as d3's curveMonotoneX
 * draws it. Two points give a straight line.
 */
export function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const f = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M${f(points[0].x)},${f(points[0].y)}`;
  if (n === 2) return `M${f(points[0].x)},${f(points[0].y)}L${f(points[1].x)},${f(points[1].y)}`;

  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(points[i + 1].x - points[i].x);
    s.push(h[i] ? (points[i + 1].y - points[i].y) / h[i] : 0);
  }

  const m: number[] = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1];
    const s1 = s[i];
    const p = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i]);
    m[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  // Ends: the one-sided three-point estimate, as d3's slope2.
  m[0] = h[0] ? (3 * s[0] - m[1]) / 2 : m[1];
  m[n - 1] = h[n - 2] ? (3 * s[n - 2] - m[n - 2]) / 2 : m[n - 2];

  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = h[i] / 3;
    d += `C${f(a.x + dx)},${f(a.y + dx * m[i])},${f(b.x - dx)},${f(b.y - dx * m[i + 1])},${f(b.x)},${f(b.y)}`;
  }
  return d;
}

/** `line` closed down to `baseline`, for a filled area under it. */
export function areaPath(points: Point[], baseline: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${monotonePath(points)}L${last.x},${baseline}L${first.x},${baseline}Z`;
}

/** Indexes of the labels to show so neighbours stay `minGap` apart. Always keeps the last. */
export function labelIndexes(count: number, width: number, minGap: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const every = Math.max(1, Math.ceil(minGap / (width / (count - 1))));
  const picked: number[] = [];
  for (let i = count - 1; i >= 0; i -= every) picked.unshift(i);
  return picked;
}

/** Nearest of `count` evenly spaced points across `width` to `x`. */
export function nearestIndex(x: number, width: number, count: number): number {
  if (count <= 1) return 0;
  const i = Math.round((x / width) * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

/**
 * One donut segment between `start` and `end` radians, measured clockwise
 * from twelve o'clock. A segment covering the whole ring is drawn a hair
 * short, since an SVG arc cannot start and end on the same point.
 */
export function arcPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  const sweep = Math.min(end - start, Math.PI * 2 - 1e-4);
  const stop = start + sweep;
  const at = (r: number, a: number) => `${Math.round((cx + r * Math.sin(a)) * 100) / 100},${Math.round((cy - r * Math.cos(a)) * 100) / 100}`;
  const large = sweep > Math.PI ? 1 : 0;
  return `M${at(outer, start)}A${outer},${outer} 0 ${large} 1 ${at(outer, stop)}L${at(inner, stop)}A${inner},${inner} 0 ${large} 0 ${at(inner, start)}Z`;
}

/** Start and end angle of each value's share of a full ring. */
export function pieAngles(values: number[]): { start: number; end: number }[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  let at = 0;
  return values.map((v) => {
    const start = at;
    at += total > 0 ? (Math.max(0, v) / total) * Math.PI * 2 : 0;
    return { start, end: at };
  });
}
