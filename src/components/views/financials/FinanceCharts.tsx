/**
 * The Financials charts, drawn as plain SVG (like the Orbit's, see
 * OrbitCharts.tsx) instead of with Recharts, which was most of the page's
 * chunk. Each takes its width from ChartFrame and a fixed height.
 *
 * The entrance is CSS: a left-to-right wipe for the area and line charts and a
 * sweep for the donut (`.fin-chart-wipe`, `.fin-chart-sweep` in index.css),
 * played once on mount and skipped when `animate` is false.
 */
import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  arcPath,
  areaPath,
  labelIndexes,
  linear,
  monotonePath,
  nearestIndex,
  niceTicks,
  pieAngles,
} from "@/lib/chartGeometry";

const AXIS_TEXT = "hsl(215 20% 55%)";
const TIP_STYLE = {
  background: "hsl(217 33% 15%)",
  border: "1px solid hsl(217 33% 24%)",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(210 40% 96%)",
} as const;

/** Room left of the plot for the y-axis labels, and below it for the x-axis. */
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 22;
const PAD_TOP = 6;
const PAD_RIGHT = 8;
/** Narrowest gap between two x-axis labels before some are skipped. */
const LABEL_GAP = 44;

const money = (v: number) => `$${v.toFixed(2)}`;

export interface Series<K extends string> {
  key: K;
  name: string;
  color: string;
  /** Fill under the line, as a vertical gradient from this opacity to none. */
  fillOpacity?: number;
  dashed?: boolean;
}

function Tip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: { name: string; value: string; color: string }[] }) {
  // Flip to the left of the pointer near the right edge.
  const left = x > width - 150;
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap px-2.5 py-1.5"
      style={{ ...TIP_STYLE, top: y, left: x, transform: `translate(${left ? "calc(-100% - 12px)" : "12px"}, -50%)` }}
    >
      <p className="font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.name} style={{ color: "hsl(215 20% 75%)" }}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
          {r.name}: {r.value}
        </p>
      ))}
    </div>
  );
}

/**
 * Smooth lines (with optional fills) over a category x-axis: one point per
 * row, spread edge to edge. Hovering shows every series' value at the nearest
 * row.
 */
export function LineAreaChart<K extends string, R extends { [key in K]: number }>({
  width,
  height,
  data,
  labelKey,
  series,
  animate,
  label,
}: {
  width: number;
  height: number;
  data: (R & Record<string, unknown>)[];
  labelKey: keyof R & string;
  series: Series<K>[];
  animate: boolean;
  /** Read by screen readers in place of the picture. */
  label: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(1, width - Y_AXIS_WIDTH - PAD_RIGHT);
  const plotH = Math.max(1, height - X_AXIS_HEIGHT - PAD_TOP);

  const { ticks, y, x } = useMemo(() => {
    const values = data.flatMap((row) => series.map((s) => row[s.key] as number));
    // Zero always on the axis, as Recharts' default [0, "auto"] domain did.
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
    return {
      ticks,
      y: linear(ticks[0], ticks[ticks.length - 1], PAD_TOP + plotH, PAD_TOP),
      x: (i: number) => Y_AXIS_WIDTH + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2),
    };
  }, [data, series, plotW, plotH]);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const points = data.map((row, i) => ({ x: x(i), y: y(row[s.key] as number) }));
        const baseline = y(Math.max(ticks[0], Math.min(0, ticks[ticks.length - 1])));
        return { s, line: monotonePath(points), area: s.fillOpacity ? areaPath(points, baseline) : null };
      }),
    [data, series, x, y, ticks],
  );

  const shown = useMemo(() => new Set(labelIndexes(data.length, plotW, LABEL_GAP)), [data.length, plotW]);

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(data.length ? nearestIndex(e.clientX - box.left, box.width, data.length) : null);
  };

  const row = hover !== null ? data[hover] : undefined;

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} role="img" aria-label={label}>
        <defs>
          {series.map((s, i) =>
            s.fillOpacity ? (
              <linearGradient key={s.key} id={`${id}-g${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={s.fillOpacity} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ) : null,
          )}
        </defs>
        {ticks.map((t) => (
          <text key={t} x={Y_AXIS_WIDTH - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
            {t.toFixed(2)}
          </text>
        ))}
        {data.map((r, i) =>
          shown.has(i) ? (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={data.length > 1 && i === 0 ? "start" : data.length > 1 && i === data.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill={AXIS_TEXT}
            >
              {String(r[labelKey])}
            </text>
          ) : null,
        )}
        <g className={animate ? "fin-chart-wipe" : undefined}>
          {paths.map(({ s, area }, i) => area && <path key={`a-${s.key}`} d={area} fill={`url(#${id}-g${i})`} />)}
          {paths.map(({ s, line }) => (
            <path
              key={`l-${s.key}`}
              d={line}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>
        {hover !== null && row && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke="hsl(215 20% 55%)" strokeOpacity={0.4} />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(row[s.key] as number)} r={3.5} fill={s.color} stroke="hsl(222 47% 11%)" strokeWidth={1.5} />
            ))}
          </g>
        )}
        <rect
          x={Y_AXIS_WIDTH}
          y={PAD_TOP}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && row && (
        <Tip
          x={x(hover)}
          y={PAD_TOP + plotH / 2}
          width={width}
          title={String(row[labelKey])}
          rows={series.map((s) => ({ name: s.name, value: money(row[s.key] as number), color: s.color }))}
        />
      )}
    </div>
  );
}

export interface Slice {
  name: string;
  value: number;
  color: string;
}

/** A ring of slices, in the order given, clockwise from twelve o'clock. */
export function DonutChart({
  width,
  height,
  data,
  inner,
  outer,
  animate,
  label,
}: {
  width: number;
  height: number;
  data: Slice[];
  inner: number;
  outer: number;
  animate: boolean;
  label: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const cx = width / 2;
  const cy = height / 2;
  const angles = useMemo(() => pieAngles(data.map((d) => d.value)), [data]);
  const mid = (inner + outer) / 2;
  const slice = hover !== null ? data[hover] : undefined;

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {animate && (
          <defs>
            <mask id={`${id}-sweep`}>
              {/* A ring stroke drawn from twelve o'clock uncovers the slices. */}
              <circle
                cx={cx}
                cy={cy}
                r={mid}
                fill="none"
                stroke="white"
                strokeWidth={outer - inner + 4}
                pathLength={1}
                transform={`rotate(-90 ${cx} ${cy})`}
                className="fin-chart-sweep"
              />
            </mask>
          </defs>
        )}
        <g mask={animate ? `url(#${id}-sweep)` : undefined}>
          {data.map((d, i) =>
            angles[i].end > angles[i].start ? (
              <path
                key={d.name}
                d={arcPath(cx, cy, inner, outer, angles[i].start, angles[i].end)}
                fill={d.color}
                opacity={hover === null || hover === i ? 1 : 0.6}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              />
            ) : null,
          )}
        </g>
      </svg>
      {slice && hover !== null && (
        <Tip
          x={cx + mid * Math.sin((angles[hover].start + angles[hover].end) / 2)}
          y={cy - mid * Math.cos((angles[hover].start + angles[hover].end) / 2)}
          width={width}
          title={slice.name}
          rows={[{ name: "Spent", value: money(slice.value), color: slice.color }]}
        />
      )}
    </div>
  );
}
