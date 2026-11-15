import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAppActivity } from "@/lib/appActivity";
import { formatMoney, type TradeCurrency } from "@/lib/trades";
import { cumulativePnl, dailyPnl, pnlByTicker, type Position } from "@/lib/tradeLedger";
import { ChartFrame, LineAreaChart, Tip, type Series } from "../financials/FinanceCharts";

const GREEN = "160 84% 39%";
const RED = "0 72% 51%";
const CURRENCY_COLOR: Record<TradeCurrency, string> = { USD: `hsl(${GREEN})`, CAD: "hsl(239 84% 67%)" };

const shortDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const pnlColor = (v: number) => (v >= 0 ? "text-accent" : "text-red-400");

export function CumulativeChart({ closed }: { closed: Position[] }) {
  const currencies = useMemo(() => [...new Set(closed.map((p) => p.currency))].sort(), [closed]);
  const data = useMemo(() => {
    const running: Record<string, number> = {};
    return cumulativePnl(closed).map((row) => {
      const out: Record<string, number | string> = { date: shortDay(row.date) };
      for (const c of currencies) {
        const v = row[c];
        if (typeof v === "number") running[c] = v;
        out[c] = running[c] ?? 0;
      }
      return out;
    });
  }, [closed, currencies]);
  const series: Series<string>[] = currencies.map((c) => ({ key: c, name: c, color: CURRENCY_COLOR[c], fillOpacity: 0.3 }));

  return (
    <div className="glass-card-hover p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Cumulative P/L</p>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No closed trades yet.</p>
      ) : (
        <>
          <ChartFrame height={200}>
            {(width, animate) => (
              <LineAreaChart
                width={width}
                height={200}
                data={data as (Record<string, number> & Record<string, unknown>)[]}
                labelKey="date"
                series={series}
                animate={animate}
                labelGap={64}
                label={`Cumulative profit and loss, ${data[0].date} to ${data[data.length - 1].date}: ${currencies.map((c) => `${c} ${Number(data[data.length - 1][c]).toFixed(2)}`).join(", ")}`}
              />
            )}
          </ChartFrame>
          {currencies.length > 1 && (
            <div className="flex flex-wrap gap-4 mt-3">
              {currencies.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: CURRENCY_COLOR[c] }} /> {c}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function TickerBars({ closed }: { closed: Position[] }) {
  const rows = useMemo(() => {
    const all = pnlByTicker(closed);
    const mixed = new Set(all.map((r) => r.currency)).size > 1;
    return [...all]
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 10)
      .map((r) => ({ ...r, name: mixed ? `${r.symbol} ${r.currency}` : r.symbol }));
  }, [closed]);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  const { still } = useAppActivity();

  return (
    <div className="glass-card-hover p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">P/L by ticker</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No closed trades yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-2 text-xs">
              <span className="truncate font-medium">{r.name}</span>
              <div className="h-2 rounded-full bg-secondary/40 overflow-hidden" aria-hidden>
                <div
                  className={`h-full rounded-full ${still ? "" : "trade-bar-grow"}`}
                  style={{ width: `${(Math.abs(r.pnl) / max) * 100}%`, background: `hsl(${r.pnl >= 0 ? GREEN : RED})`, animationDelay: `${i * 45}ms` }}
                />
              </div>
              <span data-private className={`text-right tabular-nums ${pnlColor(r.pnl)}`}>
                {formatMoney(r.pnl, r.currency, true)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WEEKS = 26;
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function PnlCalendar({ closed, today }: { closed: Position[]; today: string }) {
  const daily = useMemo(() => dailyPnl(closed), [closed]);

  const cardRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ date: string; v: number | undefined; x: number; y: number; on: boolean } | null>(null);
  const { still } = useAppActivity();

  const showTip = (e: ReactPointerEvent<HTMLDivElement>, date: string, v: number | undefined) => {
    const card = cardRef.current?.getBoundingClientRect();
    const cell = e.currentTarget.getBoundingClientRect();
    if (card) setTip({ date, v, x: cell.left + cell.width / 2 - card.left, y: cell.top + cell.height / 2 - card.top, on: true });
  };
  const currency: TradeCurrency = closed[0]?.currency ?? "USD";

  const { weeks, max } = useMemo(() => {
    const end = new Date(`${today}T12:00:00`);
    const start = new Date(end);
    start.setDate(end.getDate() - end.getDay() - (WEEKS - 1) * 7);
    const cols: { date: string; v: number | undefined; future: boolean }[][] = [];
    let peak = 0;
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const cell = new Date(start);
        cell.setDate(start.getDate() + w * 7 + d);
        const date = dayStr(cell);
        const v = daily[date]?.[currency];
        if (v !== undefined) peak = Math.max(peak, Math.abs(v));
        col.push({ date, v, future: date > today });
      }
      cols.push(col);
    }
    return { weeks: cols, max: peak || 1 };
  }, [daily, currency, today]);

  return (
    <div ref={cardRef} className="glass-card-hover p-5 relative">
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Daily P/L</p>
      </div>
      <div className="overflow-x-auto scrollbar-thin pb-1">
        <div
          role="img"
          aria-label={`Daily profit and loss in ${currency} over the last ${WEEKS} weeks`}
          className="grid grid-flow-col grid-rows-7 gap-[3px] w-max p-1"
          onPointerLeave={() => setTip((t) => (t ? { ...t, on: false } : t))}
        >
          {weeks.flat().map((cell) => {
            const style =
              cell.v === undefined || cell.future
                ? undefined
                : { background: `hsl(${cell.v >= 0 ? GREEN : RED} / ${0.25 + 0.75 * (Math.abs(cell.v) / max)})` };
            return (
              <div
                key={cell.date}
                onPointerEnter={cell.future ? undefined : (e) => showTip(e, cell.date, cell.v)}
                data-active={tip?.on && tip.date === cell.date}
                className={`h-3 w-3 rounded-[3px] ${cell.future ? "opacity-0" : `pnl-cell ${cell.v === undefined ? "bg-secondary/40" : ""}`}`}
                style={style}
              />
            );
          })}
        </div>
      </div>
      {tip && (
        <Tip
          x={tip.x}
          y={tip.y}
          width={cardRef.current?.clientWidth ?? 0}
          visible={tip.on}
          glide={!still}
          title={new Date(`${tip.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          rows={[
            tip.v === undefined
              ? { name: "No closed trades", value: "", color: "hsl(var(--muted-foreground))" }
              : { name: currency, value: formatMoney(tip.v, currency, true), color: `hsl(${tip.v >= 0 ? GREEN : RED})` },
          ]}
        />
      )}
    </div>
  );
}
