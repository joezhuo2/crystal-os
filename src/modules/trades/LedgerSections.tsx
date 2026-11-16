import { useMemo } from "react";
import { formatMoney, type Dividend, type TradeCurrency } from "@/lib/trades";
import { dividendSummary } from "@/lib/tradeLedger";
import { DataTable, EmailLink, Empty, Td, Th } from "./shared";
import { shortDate } from "./format";

const moneyList = (totals: { currency: TradeCurrency; amount: number }[]) =>
  totals.length ? totals.map((t) => formatMoney(t.amount, t.currency)).join(" + ") : formatMoney(0, "CAD");

export function DividendsTable({ dividends, year }: { dividends: Dividend[]; year: string }) {
  const summary = useMemo(() => dividendSummary(dividends, year), [dividends, year]);
  if (!dividends.length) return <Empty>No dividends found. Sync your emails, or import an activity CSV that lists them.</Empty>;
  return (
    <div className="space-y-2">
      <p className="px-3 pt-3 text-xs text-muted-foreground">
        {year}: <span data-private className="font-medium text-foreground">{moneyList(summary.year)}</span> · All time:{" "}
        <span data-private className="font-medium text-foreground">{moneyList(summary.allTime)}</span>
      </p>
      <ul className="flex flex-wrap gap-1.5 px-3" aria-label="Dividends by ticker">
        {summary.bySymbol.map((s) => (
          <li key={`${s.currency}|${s.symbol}`} className="rounded-full bg-secondary/50 px-2 py-0.5 text-[11px]">
            {s.symbol} <span data-private>{formatMoney(s.amount, s.currency)}</span>
            <span className="text-muted-foreground"> ×{s.count}</span>
          </li>
        ))}
      </ul>
      <DataTable
        head={
          <>
            <Th>Date</Th>
            <Th hide>Account</Th>
            <Th>Ticker</Th>
            <Th right>Amount</Th>
            <Th>Email</Th>
          </>
        }
      >
        {[...dividends].reverse().map((d) => (
          <tr key={d.id} className="border-t border-border/40">
            <Td>{shortDate(d.time)}</Td>
            <Td hide className="text-muted-foreground">{d.account}</Td>
            <Td>{d.symbol}</Td>
            <Td right>
              <span data-private>{formatMoney(d.amount, d.currency)}</span>
            </Td>
            <Td>
              <EmailLink url={d.url} />
            </Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
