import { useMemo } from "react";
import { CandlestickChart, ChevronRight } from "lucide-react";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { useTrades } from "@/hooks/useTrades";
import { mailWasConnected } from "@/lib/mail";
import { usesSidecar } from "@/lib/platform";
import { toLocalDateStr } from "@/lib/utils";
import { formatMoney, formatPct, instrumentLabel } from "@/lib/trades";
import { buildLedger, filterPositions, tradeStats } from "@/lib/tradeLedger";

const pnlTone = (v: number) => (v >= 0 ? "text-accent" : "text-red-400");

export function TradesWidget({ onClick }: { onClick?: () => void }) {
  const trades = useTrades(!usesSidecar() || mailWasConnected());
  const today = toLocalDateStr();
  const monthStart = `${today.slice(0, 7)}-01`;

  const summary = useMemo(() => {
    if (!trades.data) return null;
    const { positions } = buildLedger(trades.data.events, today);
    const month = filterPositions(positions, { from: monthStart }, trades.data.journal);
    const latest = positions
      .filter((p) => p.status !== "open" && !p.incomplete)
      .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))[0];
    return {
      stats: tradeStats(month),
      open: positions.filter((p) => p.status === "open").length,
      latest,
    };
  }, [trades.data, today, monthStart]);

  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <div onClick={onClick} className="glass-card-hover p-6 cursor-pointer group h-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-primary">The Ledger</p>
        <CandlestickChart className="w-4 h-4 text-primary" aria-hidden />
      </div>

      {trades.isLoading ? (
        <SkeletonLines count={3} />
      ) : trades.isError ? (
        <p className="text-sm text-muted-foreground">Could not load your trades: {(trades.error as Error).message}</p>
      ) : !trades.data?.connected ? (
        <p className="text-sm text-muted-foreground">Connect Gmail in The Courier to track your Wealthsimple trades.</p>
      ) : !summary || (summary.stats.length === 0 && summary.open === 0 && !summary.latest) ? (
        <p className="text-sm text-muted-foreground">No trades yet. Open The Ledger to collect them.</p>
      ) : (
        <>
          {summary.stats.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-2">No closed trades in {monthName} yet.</p>
          ) : (
            summary.stats.map((s) => (
              <div key={s.currency} className="mb-2">
                <div className="flex items-baseline gap-2">
                  <span data-private className={`text-3xl font-bold tabular-nums ${pnlTone(s.totalPnl)}`}>
                    {formatMoney(s.totalPnl, s.currency, true)}
                  </span>
                  <span className="text-sm text-muted-foreground">in {monthName}</span>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {s.count} {s.count === 1 ? "trade" : "trades"} · {formatPct(s.winRate)} win rate
                </p>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            {summary.open} open {summary.open === 1 ? "position" : "positions"}
          </p>
          {summary.latest && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 min-w-0">
              <span className="truncate">Last: {instrumentLabel(summary.latest)}</span>
              <span data-private className={`tabular-nums shrink-0 ${pnlTone(summary.latest.realizedPnl)}`}>
                {formatMoney(summary.latest.realizedPnl, summary.latest.currency, true)}
              </span>
            </p>
          )}
        </>
      )}

      <p className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors mt-3">
        Open The Ledger <ChevronRight className="w-3.5 h-3.5" />
      </p>
    </div>
  );
}
