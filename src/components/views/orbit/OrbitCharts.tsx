/**
 * The Orbit's small charts, drawn as plain SVG in the page's palette
 * (--orbit-* in index.css), so they need no chart library and follow the
 * theme. Each has a text alternative for screen readers.
 */
import { useId } from "react";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { formatMinutes, formatMoney } from "@/lib/orbitReview";

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Focus minutes per day: a column per day, the best day lit brightest. */
export function FocusBars({ days }: { days: { day: string; minutes: number }[] }) {
  const gradient = useId();
  const max = Math.max(1, ...days.map((d) => d.minutes));
  const best = days.reduce((top, d) => (d.minutes > top ? d.minutes : top), 0);
  const width = 280;
  const height = 92;
  const plot = height - 16;
  const gap = days.length > 10 ? 2 : 6;
  const barWidth = (width - gap * (days.length - 1)) / days.length;
  const monthly = days.length > 10;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="orbit-chart w-full h-auto"
      role="img"
      aria-label={`Focus per day: ${days.map((d) => `${dayLabel(d.day)} ${formatMinutes(d.minutes)}`).join(", ")}`}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="hsl(var(--orbit-mauve))" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(var(--orbit-ice))" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <line x1="0" x2={width} y1={plot + 0.5} y2={plot + 0.5} className="orbit-chart-axis" />
      {days.map((d, i) => {
        const h = d.minutes ? Math.max(3, (d.minutes / max) * (plot - 4)) : 0;
        const x = i * (barWidth + gap);
        const date = new Date(`${d.day}T12:00:00`);
        const showLabel = !monthly || date.getDate() === 1 || date.getDay() === 1;
        return (
          <GlassTip key={d.day} label={dayLabel(d.day)} hint={formatMinutes(d.minutes)} tone="orbit">
            <g>
              <rect x={x} y={0} width={barWidth} height={plot} rx={Math.min(3, barWidth / 2)} className="orbit-chart-track" />
              {h > 0 && (
                <rect
                  x={x}
                  y={plot - h}
                  width={barWidth}
                  height={h}
                  rx={Math.min(3, barWidth / 2)}
                  fill={`url(#${gradient})`}
                  className={d.minutes === best ? "orbit-chart-best" : undefined}
                />
              )}
              {showLabel && (
                <text x={x + barWidth / 2} y={height - 2} textAnchor="middle" className="orbit-chart-label">
                  {monthly ? date.getDate() : WEEKDAY_INITIAL[date.getDay()]}
                </text>
              )}
            </g>
          </GlassTip>
        );
      })}
    </svg>
  );
}

/** Income and spending, this period beside the last. */
export function MoneyBars({
  income,
  expenses,
  prevIncome,
  prevExpenses,
  unit,
}: {
  income: number;
  expenses: number;
  prevIncome: number;
  prevExpenses: number;
  unit: string;
}) {
  const max = Math.max(1, income, expenses, prevIncome, prevExpenses);
  const groups = [
    { label: "Income", now: income, prev: prevIncome, tone: "income" },
    { label: "Spending", now: expenses, prev: prevExpenses, tone: "spend" },
  ];
  const width = 280;
  const height = 92;
  const plot = height - 16;
  const bar = 34;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="orbit-chart w-full h-auto"
      role="img"
      aria-label={`Income ${formatMoney(income)} (last ${unit} ${formatMoney(prevIncome)}), spending ${formatMoney(expenses)} (last ${unit} ${formatMoney(prevExpenses)})`}
    >
      <line x1="0" x2={width} y1={plot + 0.5} y2={plot + 0.5} className="orbit-chart-axis" />
      {groups.map((g, gi) => {
        const cx = gi === 0 ? width * 0.27 : width * 0.73;
        const bars = [
          { value: g.prev, x: cx - bar - 3, cls: `orbit-bar-${g.tone} orbit-bar-prev`, title: `Last ${unit}` },
          { value: g.now, x: cx + 3, cls: `orbit-bar-${g.tone}`, title: `This ${unit}` },
        ];
        return (
          <g key={g.label}>
            {bars.map((b) => {
              const h = b.value ? Math.max(3, (b.value / max) * (plot - 4)) : 0;
              return (
                <GlassTip key={b.title} label={`${g.label}, ${b.title.toLowerCase()}`} hint={formatMoney(b.value)} tone="orbit">
                  <g>
                    <rect x={b.x} y={0} width={bar} height={plot} rx={4} className="orbit-chart-track" />
                    {h > 0 && <rect x={b.x} y={plot - h} width={bar} height={h} rx={4} className={b.cls} />}
                  </g>
                </GlassTip>
              );
            })}
            <text x={cx} y={height - 2} textAnchor="middle" className="orbit-chart-label">
              {g.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Tasks done against tasks added as two orbits: the outer ring is completed,
 * the inner one added, each a share of whichever is larger.
 */
export function TaskOrbit({ done, added }: { done: number; added: number }) {
  const max = Math.max(1, done, added);
  const ring = (r: number, value: number, cls: string) => {
    const c = 2 * Math.PI * r;
    const len = (value / max) * c;
    return (
      <>
        <circle cx="48" cy="48" r={r} className="orbit-ring-track" />
        {value > 0 && (
          <circle
            cx="48"
            cy="48"
            r={r}
            className={cls}
            strokeDasharray={`${len} ${c}`}
            transform="rotate(-90 48 48)"
          />
        )}
      </>
    );
  };
  return (
    <svg viewBox="0 0 96 96" className="orbit-chart w-24 h-24 shrink-0" role="img" aria-label={`${done} completed, ${added} added`}>
      {ring(40, done, "orbit-ring-done")}
      {ring(28, added, "orbit-ring-added")}
      <circle cx="48" cy="48" r="15" className="orbit-ring-core" />
    </svg>
  );
}
