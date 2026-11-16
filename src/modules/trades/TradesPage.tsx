import { useCallback, useDeferredValue, useMemo, useRef, useState, type ReactNode } from "react";
import { m } from "framer-motion";
import { toast } from "sonner";
import { ItemNoteLink } from "@/components/ItemNoteLink";
import { AlertTriangle, ArrowDown, ArrowUp, FileUp, Mail, NotebookPen, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { useAppActivity } from "@/lib/appActivity";
import { ThemedSelect } from "@/components/ui/field-controls";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteTradeEvent, useImportTradesCsv, useTrades, useTradesSync } from "@/hooks/useTrades";
import { relativeDate } from "@/lib/mail";
import { formatMoney, formatPct, instrumentLabel, type TradeCurrency, type TradeEvent, type TradeJournal, type TradesData } from "@/lib/trades";
import { buildLedger, filterPositions, fxSummary, inUsd, tagStats, tradeStats, usdPerCad, type Position, type TradeFilter, type TradeStats } from "@/lib/tradeLedger";
import { toLocalDateStr } from "@/lib/utils";
import type { TabId } from "@/modules/registry";
import { CumulativeChart, PnlCalendar, TickerBars } from "./TradesCharts";
import { PositionDialog } from "./PositionDialog";
import { TradeDialog, type TradeDraft } from "./TradeDialog";
import { EmailLink } from "./shared";
import { dateTime, pnlClass, qtyLabel, shortDate } from "./format";

type Section = "closed" | "open" | "orders" | "tags" | "fx";

type CurrencyView = "ALL" | TradeCurrency;

const SECTIONS: { id: Section; label: string }[] = [
  { id: "closed", label: "Closed" },
  { id: "open", label: "Open" },
  { id: "orders", label: "Orders" },
  { id: "tags", label: "Tags" },
  { id: "fx", label: "FX" },
];

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "ytd", label: "Year to date" },
  { value: "90", label: "Last 90 days" },
  { value: "30", label: "Last 30 days" },
];

const ORDER_PAGE = 50;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const periodFrom = (period: string, today: string) => {
  if (period === "ytd") return `${today.slice(0, 4)}-01-01`;
  if (period === "all") return undefined;
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - Number(period));
  return toLocalDateStr(d);
};

const daysUntil = (expiry: string, today: string) => Math.round((new Date(`${expiry}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);

function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 z-10 bg-background/85 backdrop-blur-sm text-left text-muted-foreground">
        <tr>{head}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const HIDE_NARROW = "hidden lg:table-cell";

const Th = ({ children, right, sr, hide }: { children?: ReactNode; right?: boolean; sr?: string; hide?: boolean }) => (
  <th scope="col" className={`px-3 py-2.5 font-medium ${right ? "text-right" : ""} ${hide ? HIDE_NARROW : ""}`}>
    {sr ? <span className="sr-only">{sr}</span> : children}
  </th>
);

const Td = ({ children, right, hide, className = "" }: { children?: ReactNode; right?: boolean; hide?: boolean; className?: string }) => (
  <td className={`px-3 py-2.5 break-words ${right ? "text-right tabular-nums" : ""} ${hide ? HIDE_NARROW : ""} ${className}`}>{children}</td>
);

function Empty({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-8 text-center text-sm text-muted-foreground ${className}`}>{children}</div>;
}

function StatsStrip({ stats, title }: { stats: TradeStats; title?: string }) {
  const c = stats.currency;
  const items: { label: string; value?: ReactNode; pair?: [ReactNode, ReactNode]; tone?: string }[] = [
    { label: "Realized P/L", value: formatMoney(stats.totalPnl, c, true), tone: pnlClass(stats.totalPnl) },
    { label: "Win rate", value: `${Math.round(stats.winRate)}%`, tone: undefined },
    { label: "Profit factor", value: stats.profitFactor === null ? "-" : stats.profitFactor.toFixed(2) },
    {
      label: "Avg win / loss",
      pair: [<span className="text-accent">{formatMoney(stats.avgWin, c, true)}</span>, <span className="text-red-400">{formatMoney(stats.avgLoss, c)}</span>],
    },
    {
      label: "Best / worst",
      pair: [
        <span className="text-accent">{stats.best ? formatMoney(stats.best.realizedPnl, c, true) : "-"}</span>,
        <span className="text-red-400">{stats.worst ? formatMoney(stats.worst.realizedPnl, c, true) : "-"}</span>,
      ],
    },
    { label: "Avg hold", value: `${stats.avgHoldDays.toFixed(1)}d` },
  ];
  return (
    <section aria-label={`${c} statistics`} className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">
        {title ?? c} · {stats.count} closed {stats.count === 1 ? "trade" : "trades"} ({stats.wins}W / {stats.losses}L)
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((i) => (
          <div key={i.label} className="glass-card p-4 min-w-0 flex flex-col justify-between gap-1">
            {i.pair ? (
              <p data-private className="flex flex-col text-base font-bold tabular-nums leading-tight">
                {i.pair[0]}
                {i.pair[1]}
              </p>
            ) : (
              <p data-private className={`text-lg font-bold tabular-nums truncate ${i.tone ?? ""}`}>
                {i.value}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{i.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SuperficialBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex items-center gap-1 rounded border border-amber-400/40 px-1 text-[10px] uppercase tracking-wide text-amber-400">
          <AlertTriangle className="w-3 h-3" aria-hidden /> Superficial loss
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        You bought the same security within 30 days of this sale, so the CRA may deny the loss. This is an approximation; confirm with a tax professional.
      </TooltipContent>
    </Tooltip>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
          {t}
        </span>
      ))}
    </>
  );
}

function PositionName({ p, onOpen, journal }: { p: Position; onOpen: (p: Position) => void; journal?: TradeJournal }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onOpen(p)} className="font-medium text-left hover:text-primary focus-visible:outline-none focus-visible:underline">
        {instrumentLabel(p)}
      </button>
      {journal && <NotebookPen className="w-3 h-3 text-primary shrink-0" aria-label="Has journal notes" />}
    </div>
  );
}

function NotesButton({ p, journal, onOpen }: { p: Position; journal?: TradeJournal; onOpen: (p: Position) => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs whitespace-nowrap"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(p);
      }}
    >
      <NotebookPen className={journal ? "text-primary" : undefined} /> {journal ? "Edit notes" : "Add notes"}
    </Button>
  );
}

function ClosedTable({ rows, journal, onOpen, onAddMissing }: { rows: Position[]; journal: Record<string, TradeJournal>; onOpen: (p: Position) => void; onAddMissing: (p: Position) => void }) {
  const [sort, setSort] = useState<{ key: "date" | "pnl"; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const sorted = useMemo(() => {
    const value = (p: Position) => (sort.key === "pnl" ? p.realizedPnl : (p.closedAt ?? p.openedAt));
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  const sortHead = (key: "date" | "pnl", label: string, right?: boolean) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`px-3 py-2.5 font-medium whitespace-nowrap ${right ? "text-right" : ""}`}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" aria-hidden /> : <ArrowDown className="w-3 h-3" aria-hidden />)}
      </button>
    </th>
  );

  if (!rows.length) return <Empty>No closed trades match these filters.</Empty>;
  return (
    <DataTable
      head={
        <>
          <Th>Instrument</Th>
          <Th hide>Account</Th>
          {sortHead("date", "Opened → closed")}
          <Th right>Qty</Th>
          <Th right>Entry → exit</Th>
          {sortHead("pnl", "P/L", true)}
          <Th right>P/L %</Th>
          <Th>Status</Th>
          <Th hide>Tags</Th>
          <Th>Notes</Th>
        </>
      }
    >
      {sorted.map((p) => {
        const j = journal[p.id];
        return (
          <tr key={p.id} onClick={() => onOpen(p)} className="border-t border-border/40 hover:bg-primary/5 transition-colors cursor-pointer">
            <Td>
              <PositionName p={p} onOpen={onOpen} journal={j} />
            </Td>
            <Td hide className="text-muted-foreground">{p.account}</Td>
            <Td>
              {shortDate(p.openedAt)}
              {p.closedAt && ` → ${shortDate(p.closedAt)}`}
            </Td>
            <Td right>{qtyLabel(p.maxQuantity)}</Td>
            <Td right>
              <span data-private>
                {formatMoney(p.avgEntry, p.currency)} → {p.avgExit === undefined ? "-" : formatMoney(p.avgExit, p.currency)}
              </span>
            </Td>
            {p.incomplete ? (
              <td colSpan={2} className="px-3 py-2.5 text-right">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={(e) => {
                    e.stopPropagation();
                    onAddMissing(p);
                  }}>
                  <AlertTriangle className="text-amber-400" /> Add the missing buy
                </Button>
              </td>
            ) : (
              <>
                <Td right className={`font-semibold ${pnlClass(p.realizedPnl)}`}>
                  <span data-private>{formatMoney(p.realizedPnl, p.currency, true)}</span>
                </Td>
                <Td right className={pnlClass(p.pnlPct)}>
                  {formatPct(p.pnlPct, true)}
                </Td>
              </>
            )}
            <Td>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="capitalize">{p.status}</span>
                {p.superficialLoss && <SuperficialBadge />}
              </div>
            </Td>
            <Td hide>
              <div className="flex flex-wrap gap-1">
                <TagChips tags={j?.tags ?? []} />
              </div>
            </Td>
            <Td>
              <NotesButton p={p} journal={j} onOpen={onOpen} />
            </Td>
          </tr>
        );
      })}
    </DataTable>
  );
}

function OpenTable({ rows, journal, today, onOpen }: { rows: Position[]; journal: Record<string, TradeJournal>; today: string; onOpen: (p: Position) => void }) {
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <Empty>No open positions.</Empty>
      ) : (
        <DataTable
          head={
            <>
              <Th>Instrument</Th>
              <Th hide>Account</Th>
              <Th right>Qty</Th>
              <Th right>ACB / share</Th>
              <Th right>Cost basis</Th>
              <Th hide>Opened</Th>
              <Th right>Held</Th>
              <Th>Expiry</Th>
              <Th>Notes</Th>
            </>
          }
        >
          {rows.map((p) => {
            const left = p.option ? daysUntil(p.option.expiry, today) : null;
            return (
              <tr key={p.id} onClick={() => onOpen(p)} className="border-t border-border/40 hover:bg-primary/5 transition-colors cursor-pointer">
                <Td>
                  <PositionName p={p} onOpen={onOpen} journal={journal[p.id]} />
                </Td>
                <Td hide className="text-muted-foreground">{p.account}</Td>
                <Td right>
                  {p.direction === "short" ? "-" : ""}
                  {qtyLabel(p.quantity)}
                </Td>
                <Td right>
                  <span data-private>{formatMoney(p.acb, p.currency)}</span>
                </Td>
                <Td right>
                  <span data-private>{formatMoney(p.costBasis, p.currency)}</span>
                </Td>
                <Td hide>{shortDate(p.openedAt)}</Td>
                <Td right>{p.holdDays}d</Td>
                <Td>
                  {left === null ? "-" : left < 0 ? "Expired" : left === 0 ? "Expires today" : `${left}d left`}
                </Td>
                <Td>
                  <NotesButton p={p} journal={journal[p.id]} onOpen={onOpen} />
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <p className="px-3 pb-3 text-xs text-muted-foreground">Unrealized P/L needs live prices — not tracked.</p>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  filled: "bg-accent/10 text-accent",
  partial: "bg-amber-400/10 text-amber-400",
  cancelled: "bg-secondary text-muted-foreground",
  expired: "bg-secondary text-muted-foreground",
  rejected: "bg-red-400/10 text-red-400",
};

function OrdersTable({ rows, onEdit, onDelete }: { rows: TradeEvent[]; onEdit: (e: TradeEvent) => void; onDelete: (e: TradeEvent) => void }) {
  const [shown, setShown] = useState(ORDER_PAGE);
  if (!rows.length) return <Empty>No orders yet.</Empty>;
  return (
    <div className="space-y-2">
      <DataTable
        head={
          <>
            <Th>Time</Th>
            <Th>Status</Th>
            <Th>Order</Th>
            <Th hide>Account</Th>
            <Th right>Qty</Th>
            <Th right>Price</Th>
            <Th right>Total</Th>
            <Th>Email</Th>
            <Th sr="Actions" />
          </>
        }
      >
        {rows.slice(0, shown).map((e) => (
          <tr key={e.id} className="border-t border-border/40">
            <Td>{dateTime(e.time)}</Td>
            <Td>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_TONE[e.status]}`}>{e.status}</span>
            </Td>
            <Td>
              <span className="capitalize">{e.side}</span>
              {e.effect && ` to ${e.effect}`} {instrumentLabel(e)}
            </Td>
            <Td hide className="text-muted-foreground">{e.account}</Td>
            <Td right>
              {qtyLabel(e.quantity)}
              {e.orderedQuantity !== undefined && e.orderedQuantity !== e.quantity && ` of ${qtyLabel(e.orderedQuantity)}`}
            </Td>
            <Td right>
              <span data-private>{e.price === undefined ? "-" : formatMoney(e.price, e.currency)}</span>
            </Td>
            <Td right>
              <span data-private>{e.total === undefined ? "-" : formatMoney(e.total, e.currency)}</span>
            </Td>
            <Td>
              <EmailLink url={e.url} />
            </Td>
            <Td>
              <div className="flex justify-end gap-1">
                <ItemNoteLink kind="trade" itemId={e.id} title={`${e.side === "buy" ? "Buy" : "Sell"} ${e.symbol} · ${e.time.slice(0, 10)}`} />
                <button type="button" aria-label={`Edit the ${e.symbol} order`} onClick={() => onEdit(e)} className="p-1 text-muted-foreground hover:text-primary">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" aria-label={`Delete the ${e.symbol} order`} onClick={() => onDelete(e)} className="p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
      {rows.length > shown && (
        <Button type="button" variant="ghost" size="sm" className="mx-3 mb-3" onClick={() => setShown((n) => n + ORDER_PAGE)}>
          Show more ({rows.length - shown} left)
        </Button>
      )}
    </div>
  );
}

function TagsTable({ closed, journal }: { closed: Position[]; journal: Record<string, TradeJournal> }) {
  const rows = useMemo(() => tagStats(closed, journal), [closed, journal]);
  if (!rows.length) return <Empty>Tag a trade in its journal to see which habits make or lose money.</Empty>;
  return (
    <DataTable
      head={
        <>
          <Th>Tag</Th>
          <Th right>Trades</Th>
          <Th right>Win rate</Th>
          <Th right>Total P/L</Th>
          <Th right>Avg %</Th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.tag} className="border-t border-border/40">
          <Td className="font-medium">{r.tag}</Td>
          <Td right>{r.count}</Td>
          <Td right>{Math.round(r.winRate)}%</Td>
          <Td right className={pnlClass(r.totalPnl)}>
            <span data-private>{r.totalPnl.toFixed(2)}</span>
          </Td>
          <Td right className={pnlClass(r.avgPct)}>
            {formatPct(r.avgPct, true)}
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}

function FxTable({ fx }: { fx: TradesData["fx"] }) {
  const summary = useMemo(() => fxSummary(fx), [fx]);
  if (!fx.length) return <Empty>No currency conversions found.</Empty>;
  const fees = Object.entries(summary.totalEstFee).filter(([, v]) => v > 0);
  return (
    <div className="space-y-2">
      <DataTable
        head={
          <>
            <Th>Time</Th>
            <Th hide>Account</Th>
            <Th right>Sent</Th>
            <Th right>Received</Th>
            <Th right>Rate</Th>
            <Th right>Est. fee</Th>
            <Th>Email</Th>
          </>
        }
      >
        {summary.conversions.map((c) => (
          <tr key={c.id} className="border-t border-border/40">
            <Td>{dateTime(c.time)}</Td>
            <Td hide className="text-muted-foreground">{c.account}</Td>
            <Td right>
              <span data-private>{formatMoney(c.fromAmount, c.fromCurrency)}</span>
            </Td>
            <Td right>
              <span data-private>{formatMoney(c.toAmount, c.toCurrency)}</span>
            </Td>
            <Td right>{c.rate.toFixed(4)}</Td>
            <Td right>
              <span data-private>{formatMoney(c.estFee, c.fromCurrency)}</span>
            </Td>
            <Td>
              <EmailLink url={c.url} />
            </Td>
          </tr>
        ))}
      </DataTable>
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        Estimated fees assume the standard 1.5% rate (Plus and Premium pay less)
        {fees.length > 0 && (
          <>
            : <span data-private>{fees.map(([c, v]) => formatMoney(v, c as "USD" | "CAD")).join(" + ")}</span> in total
          </>
        )}
        .
      </p>
    </div>
  );
}

function PillTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  pillId,
  radio,
  className = "flex-wrap",
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  pillId: string;
  radio?: boolean;
  className?: string;
}) {
  return (
    <div role={radio ? "radiogroup" : "tablist"} aria-label={label} className={`inline-flex max-w-full glass-card p-1 gap-1 self-start ${className}`}>
      {items.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            role={radio ? "radio" : "tab"}
            aria-selected={radio ? undefined : active}
            aria-checked={radio ? active : undefined}
            onClick={() => onChange(s.id)}
            className={`relative rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {active && <m.span layoutId={pillId} className="absolute inset-0 rounded-lg bg-primary" transition={{ type: "spring", bounce: 0.2, duration: 0.3 }} />}
            <span className="relative z-10">
              {s.label}
              {!!s.count && <span className="ml-1.5 text-xs opacity-70">{s.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Ledger({ data, sync, onNavigate }: { data: TradesData; sync: ReturnType<typeof useTradesSync>; onNavigate?: (tab: TabId) => void }) {
  const importCsv = useImportTradesCsv();
  const remove = useDeleteTradeEvent();
  const fileRef = useRef<HTMLInputElement>(null);
  const today = toLocalDateStr();
  const now = new Date();

  const [filter, setFilter] = useState({ account: "", kind: "", period: "all", tag: "" });
  const [view, setView] = useState<CurrencyView>("ALL");
  const [section, setSection] = useState<Section>("closed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ event?: TradeEvent; draft?: TradeDraft } | null>(null);
  const [deleting, setDeleting] = useState<TradeEvent | null>(null);

  const ledger = useMemo(() => buildLedger(data.events, today), [data.events, today]);
  const accounts = useMemo(() => [...new Set(data.events.map((e) => e.account))].sort(), [data.events]);
  const knownIds = useMemo(() => new Set(data.events.map((e) => e.id)), [data.events]);
  const allTags = useMemo(() => [...new Set(Object.values(data.journal).flatMap((j) => j.tags))].sort(), [data.journal]);

  const tradeFilter: TradeFilter = {
    account: filter.account || undefined,
    kind: (filter.kind || undefined) as TradeFilter["kind"],
    from: periodFrom(filter.period, today),
    tag: filter.tag || undefined,
  };
  const filtered = useMemo(
    () => filterPositions(ledger.positions, tradeFilter, data.journal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledger.positions, data.journal, filter.account, filter.kind, filter.period, filter.tag, today],
  );
  const currencies = useMemo(() => [...new Set(data.events.map((e) => e.currency))], [data.events]);
  const rate = useMemo(() => usdPerCad(data.fx), [data.fx]);
  const inView = (c: TradeCurrency) => view === "ALL" || c === view;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closedRows = useMemo(() => filtered.filter((p) => p.status !== "open" && inView(p.currency)), [filtered, view]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openRows = useMemo(() => filtered.filter((p) => p.status === "open" && inView(p.currency)), [filtered, view]);
  const counted = useMemo(() => {
    const done = closedRows.filter((p) => !p.incomplete);
    return view === "ALL" ? inUsd(done, rate) : done;
  }, [closedRows, view, rate]);
  const stats = useMemo(() => tradeStats(counted), [counted]);
  const orders = useMemo(
    () =>
      ledger.orders.filter(
        (e) => (!filter.account || e.account === filter.account) && (!filter.kind || (filter.kind === "option") === !!e.option) && (view === "ALL" || e.currency === view),
      ),
    [ledger.orders, filter.account, filter.kind, view],
  );
  const selected = selectedId ? ledger.positions.find((p) => p.id === selectedId) : undefined;

  const openPosition = useCallback((p: Position) => setSelectedId(p.id), []);
  const editEvent = useCallback((event: TradeEvent) => setDialog({ event }), []);
  const addMissing = useCallback((p: Position) => {
    const short = p.direction === "short";
    const firstClose = p.events.find((e) => e.side === (short ? "buy" : "sell"))?.time ?? p.openedAt;
    const before = new Date(new Date(firstClose).getTime() - 86_400_000);
    setSelectedId(null);
    setDialog({
      draft: {
        symbol: p.symbol,
        account: p.account,
        currency: p.currency,
        quantity: p.unmatchedQty,
        side: short ? "sell" : "buy",
        effect: p.option ? "open" : undefined,
        option: p.option,
        orderType: "Limit",
        status: "filled",
        time: before.toISOString(),
      },
    });
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const csv = await file.text();
      importCsv.mutate(csv, {
        onSuccess: (r) => toast.success(`Imported ${r.imported} ${r.imported === 1 ? "trade" : "trades"}`, { description: r.skipped ? `${r.skipped} rows skipped` : undefined }),
        onError: (err) => toast.error("Could not import the file", { description: err.message }),
      });
    } catch (err) {
      toast.error("Could not read the file", { description: errorText(err) });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const event = deleting;
    setDeleting(null);
    remove.mutate(event.id, {
      onSuccess: () => toast.success("Trade deleted"),
      onError: (err) => toast.error("Could not delete the trade", { description: err.message }),
    });
  };

  const syncing = sync.isPending || !!data.syncing;
  const counts: Record<Section, number> = { closed: closedRows.length, open: openRows.length, orders: orders.length, tags: 0, fx: data.fx.length };
  const shownSection = useDeferredValue(section);
  const { still } = useAppActivity();
  const statsTitle = view === "ALL" && currencies.length > 1 ? `All in USD (C$1 = US$${rate.toFixed(3)})` : undefined;

  // Built once per data change, so opening a dialog or syncing does not re-render the charts and lists; keyed by view so switching currency replays the entrances.
  const statsView = useMemo(
    () => (stats.length > 0 ? stats.map((s) => <StatsStrip key={s.currency} stats={s} title={statsTitle} />) : <Empty className="glass-card">No completed trades match these filters.</Empty>),
    [stats, statsTitle],
  );
  const chartsView = useMemo(
    () => (
      <div key={view} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CumulativeChart closed={counted} />
          <TickerBars closed={counted} />
        </div>
        <PnlCalendar closed={counted} today={today} />
      </div>
    ),
    [counted, today, view],
  );
  const panelView = useMemo(
    () =>
      shownSection === "closed" ? (
        <ClosedTable rows={closedRows} journal={data.journal} onOpen={openPosition} onAddMissing={addMissing} />
      ) : shownSection === "open" ? (
        <OpenTable rows={openRows} journal={data.journal} today={today} onOpen={openPosition} />
      ) : shownSection === "orders" ? (
        <OrdersTable rows={orders} onEdit={editEvent} onDelete={setDeleting} />
      ) : shownSection === "tags" ? (
        <TagsTable closed={counted} journal={data.journal} />
      ) : (
        <FxTable fx={data.fx} />
      ),
    [shownSection, closedRows, openRows, orders, counted, data.journal, data.fx, today, openPosition, addMissing, editEvent],
  );
  const hasData = data.events.length > 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">The Ledger</h1>
          <p className="text-xs text-muted-foreground">{data.lastSync ? `Synced ${relativeDate(data.lastSync, now)}` : "Not synced yet"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => sync.sync()} disabled={syncing}>
            <RefreshCw className={syncing ? "animate-spin" : ""} /> Sync
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importCsv.isPending}>
            <FileUp /> Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Import trades from a CSV file" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button size="sm" onClick={() => setDialog({})}>
            <Plus /> Add trade
          </Button>
        </div>
      </div>

      {!data.connected && (
        <div className="glass-card p-6 flex items-center gap-4 flex-wrap">
          <Mail className="w-6 h-6 text-primary shrink-0" aria-hidden />
          <div className="flex-1 min-w-48 space-y-1">
            <p className="text-sm font-semibold">Connect Gmail to collect your trades</p>
            <p className="text-xs text-muted-foreground">The Ledger reads your Wealthsimple order emails. Connect a Google account in The Courier, or add trades by hand or from a CSV.</p>
          </div>
          {onNavigate && (
            <Button size="sm" onClick={() => onNavigate("mail")}>
              Open The Courier
            </Button>
          )}
        </div>
      )}

      {(sync.error || data.errors.length > 0) && (
        <ul role="alert" className="glass-card p-4 space-y-1 text-xs text-amber-400">
          {sync.error && (
            <li className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Could not sync: {sync.error.message}
            </li>
          )}
          {data.errors.map((e, i) => (
            <li key={i} className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Could not read {e.account}: {e.message}
            </li>
          ))}
        </ul>
      )}

      {!hasData ? (
        <Empty>{syncing ? "Reading your order emails..." : "No trades yet. Sync your emails, import a CSV or add a trade by hand."}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 [&>.ledger-filter]:min-w-[6.5rem] [&>.ledger-filter]:max-w-[10rem] [&>.ledger-filter]:flex-1 [&>.ledger-filter]:basis-0">
            {currencies.length > 1 && (
              <PillTabs<CurrencyView>
                radio
                className="flex-nowrap shrink-0"
                label="Currency"
                pillId="ledger-currency-pill"
                value={view}
                onChange={setView}
                items={[
                  { id: "ALL", label: "All" },
                  { id: "USD", label: "USD" },
                  { id: "CAD", label: "CAD" },
                ]}
              />
            )}
            <div className="ledger-filter">
              <ThemedSelect aria-label="Account filter" value={filter.account} onChange={(v) => setFilter((f) => ({ ...f, account: v }))} options={[{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a, label: a }))]} />
            </div>
            <div className="ledger-filter">
              <ThemedSelect
                aria-label="Instrument filter"
                value={filter.kind}
                onChange={(v) => setFilter((f) => ({ ...f, kind: v }))}
                options={[
                  { value: "", label: "All types" },
                  { value: "stock", label: "Stocks" },
                  { value: "option", label: "Options" },
                ]}
              />
            </div>
            <div className="ledger-filter">
              <ThemedSelect aria-label="Period filter" value={filter.period} onChange={(v) => setFilter((f) => ({ ...f, period: v }))} options={PERIODS} />
            </div>
            <div className="ledger-filter">
              <ThemedSelect aria-label="Tag filter" value={filter.tag} onChange={(v) => setFilter((f) => ({ ...f, tag: v }))} options={[{ value: "", label: "All tags" }, ...allTags.map((t) => ({ value: t, label: t }))]} />
            </div>
          </div>

          {statsView}
          {chartsView}

          <PillTabs<Section> label="Ledger sections" pillId="ledger-section-pill" value={section} onChange={setSection} items={SECTIONS.map((s) => ({ ...s, count: counts[s.id] }))} />
          <div role="tabpanel" aria-label={SECTIONS.find((s) => s.id === section)?.label} aria-busy={section !== shownSection} className="glass-card h-[26rem] overflow-y-auto overflow-x-hidden scrollbar-thin pb-8">
            {section !== shownSection ? (
              <div className="p-4">
                <SkeletonLines count={8} />
              </div>
            ) : (
              <m.div key={shownSection} initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
                {panelView}
              </m.div>
            )}
          </div>
        </>
      )}

      {selected && (
        <PositionDialog
          position={selected}
          journal={data.journal[selected.id]}
          suggestions={allTags}
          onClose={() => setSelectedId(null)}
          onEdit={editEvent}
          onDelete={setDeleting}
          onAddMissing={addMissing}
        />
      )}
      {dialog && <TradeDialog event={dialog.event} draft={dialog.draft} accounts={accounts} knownIds={knownIds} suggestions={allTags} onClose={() => setDialog(null)} />}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${deleting.side} ${qtyLabel(deleting.quantity)} ${instrumentLabel(deleting)}`}. Imported trades are hidden, not removed from your email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: "destructive" })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function TradesPage({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const trades = useTrades();
  const sync = useTradesSync();

  return (
    <TooltipProvider delayDuration={150}>
      <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {trades.isLoading ? (
          <>
            <div className="glass-card p-6">
              <SkeletonLines count={2} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-52 rounded-xl" />
          </>
        ) : trades.isError || !trades.data ? (
          <div role="alert" className="glass-card p-6 flex items-center gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            Could not load your trades: {errorText(trades.error)}
          </div>
        ) : (
          <Ledger data={trades.data} sync={sync} onNavigate={onNavigate} />
        )}
      </m.div>
    </TooltipProvider>
  );
}
