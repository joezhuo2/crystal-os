/**
 * Where focus went (v0.9.5): a donut with a slice per task (Other past the
 * seventh, and No task for unlinked focus) and a legend beside it, under the
 * Focus card's daily bars. Plain SVG in the Orbit palette, like OrbitCharts.
 */
import { useState } from "react";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { formatMinutes, type FocusSlice } from "@/lib/orbitReview";

/**
 * Task slice colours, largest first: the Orbit's own five, then three blends
 * of them. Other and No task have their own, dimmer ones.
 */
const SLICE_COLORS = [
  "hsl(var(--orbit-ice))",
  "hsl(var(--orbit-mauve))",
  "hsl(var(--orbit-cyan))",
  "hsl(var(--orbit-rust))",
  "hsl(var(--orbit-slate))",
  "hsl(255 60% 78%)",
  "hsl(172 55% 62%)",
  "hsl(36 80% 68%)",
];
const OTHER_COLOR = "hsl(var(--orbit-slate) / 0.55)";
const NONE_COLOR = "hsl(var(--muted-foreground) / 0.35)";

function sliceColor(slice: FocusSlice, index: number): string {
  if (slice.kind === "none") return NONE_COLOR;
  if (slice.kind === "other") return OTHER_COLOR;
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

const percent = (share: number) => `${share > 0 && share < 0.01 ? "<1" : Math.round(share * 100)}%`;
const sessionsLabel = (n: number) => `${n} session${n === 1 ? "" : "s"}`;
/** Other's hover card lists this many of its tasks. */
const MEMBERS_SHOWN = 8;

/** The hover card's body: time, share and runs, and Other's tasks. */
function SliceDetail({ slice }: { slice: FocusSlice }) {
  return (
    <span className="orbit-pie-tip">
      <span className="orbit-pie-tip-stats">
        <strong>{formatMinutes(slice.minutes)}</strong>
        <span>{percent(slice.share)} of focus</span>
        <span>{sessionsLabel(slice.sessions)}</span>
      </span>
      {slice.members && (
        <span className="orbit-pie-tip-members">
          {slice.members.slice(0, MEMBERS_SHOWN).map((m) => (
            <span key={m.label}>
              <span className="truncate">{m.label}</span>
              <span className="tabular-nums">{formatMinutes(m.minutes)}</span>
            </span>
          ))}
          {slice.members.length > MEMBERS_SHOWN && <span>+{slice.members.length - MEMBERS_SHOWN} more</span>}
        </span>
      )}
    </span>
  );
}

/**
 * Hovering a slice or its legend row lifts it, dims the rest, names it in the
 * middle of the ring, and (on the slice) opens a themed card with its time,
 * share and runs.
 */
export function FocusPie({ slices }: { slices: FocusSlice[] }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.minutes, 0);
  const r = 38;
  const c = 2 * Math.PI * r;
  // A hair of space between slices, unless one slice is the whole ring.
  const gap = slices.length > 1 ? 1.2 : 0;
  let start = 0;
  const arcs = slices.map((slice, i) => {
    const len = slice.share * c;
    const arc = { slice, color: sliceColor(slice, i), offset: -start, len: Math.max(0.01, len - gap) };
    start += len;
    return arc;
  });
  const hovered = slices.find((s) => s.key === active);
  const caption = hovered ? (hovered.label.length > 14 ? `${hovered.label.slice(0, 13)}…` : hovered.label) : "focused";

  return (
    <div className="orbit-pie" onMouseLeave={() => setActive(null)}>
      <svg
        viewBox="0 0 96 96"
        className="orbit-chart orbit-pie-chart"
        role="img"
        aria-label={`Focus by task: ${slices.map((s) => `${s.label} ${formatMinutes(s.minutes)} (${percent(s.share)})`).join(", ")}`}
      >
        <circle cx="48" cy="48" r={r} className="orbit-pie-track" />
        {arcs.map(({ slice, color, offset, len }) => (
          <GlassTip key={slice.key} label={slice.label} tone="orbit" detail={<SliceDetail slice={slice} />}>
            <circle
              cx="48"
              cy="48"
              r={r}
              className="orbit-pie-slice"
              data-active={active === slice.key || undefined}
              data-dim={(active !== null && active !== slice.key) || undefined}
              stroke={color}
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={offset}
              transform="rotate(-90 48 48)"
              onMouseEnter={() => setActive(slice.key)}
            />
          </GlassTip>
        ))}
        <text x="48" y="48" textAnchor="middle" className="orbit-pie-center">
          {hovered ? percent(hovered.share) : formatMinutes(total)}
        </text>
        <text x="48" y="58" textAnchor="middle" className="orbit-pie-caption">
          {caption}
        </text>
      </svg>
      <ul className="orbit-pie-legend">
        {arcs.map(({ slice, color }) => (
          <li
            key={slice.key}
            data-active={active === slice.key || undefined}
            data-dim={(active !== null && active !== slice.key) || undefined}
            onMouseEnter={() => setActive(slice.key)}
          >
            <span className="orbit-pie-swatch" style={{ background: color }} />
            <span className={`min-w-0 flex-1 truncate ${slice.kind === "none" ? "italic text-muted-foreground" : ""}`}>
              {slice.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatMinutes(slice.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
