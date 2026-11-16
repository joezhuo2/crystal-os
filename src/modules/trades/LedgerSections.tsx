import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/field-controls";
import { acbCsv, acbReport, downloadText, isTaxable } from "@/lib/acbReport";
import { formatMoney, type Dividend, type FxConversion, type TradeCurrency, type TradeEvent } from "@/lib/trades";
import { dividendSummary } from "@/lib/tradeLedger";
import { DataTable, EmailLink, Empty, Td, Th } from "./shared";
import { pnlClass, qtyLabel, shortDate } from "./format";

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

const cad = (n: number, signed = false) => formatMoney(n, "CAD", signed);

export function AcbSection({ events, fx, today }: { events: TradeEvent[]; fx: FxConversion[]; today: string }) {
  const thisYear = today.slice(0, 4);
  const years = useMemo(
    () => [...new Set([thisYear, ...events.filter((e) => isTaxable(e.account)).map((e) => e.time.slice(0, 4))])].sort().reverse(),
    [events, thisYear],
  );
  const [year, setYear] = useState(thisYear);
  const report = useMemo(() => acbReport(events, fx, year, today), [events, fx, year, today]);
  const empty = !report.dispositions.length && !report.holdings.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 px-3 pt-3">
        <ThemedSelect aria-label="Tax year" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} className="w-24" />
        <p className="flex-1 min-w-48 text-xs text-muted-foreground" data-private>
          Proceeds <span className="font-medium text-foreground">{cad(report.totals.proceeds)}</span> · ACB{" "}
          <span className="font-medium text-foreground">{cad(report.totals.acb)}</span> · Gain or loss{" "}
          <span className={`font-medium ${pnlClass(report.totals.gain)}`}>{cad(report.totals.gain, true)}</span>
        </p>
        <Button size="sm" variant="outline" disabled={empty} onClick={() => downloadText(`acb-${year}.csv`, acbCsv(report), "text/csv")}>
          <Download /> Export CSV
        </Button>
      </div>
      {empty ? (
        <Empty>No non-registered trades up to the end of {year}.</Empty>
      ) : (
        <>
          <DataTable
            head={
              <>
                <Th>Sold</Th>
                <Th>Security</Th>
                <Th right>Quantity</Th>
                <Th right>Proceeds</Th>
                <Th right>ACB</Th>
                <Th right>Gain or loss</Th>
              </>
            }
          >
            {report.dispositions.map((d, i) => (
              <tr key={`${d.date}-${d.security}-${i}`} className="border-t border-border/40">
                <Td>{shortDate(`${d.date}T12:00:00`)}</Td>
                <Td>
                  {d.security}
                  {d.expired && <span className="ml-1.5 text-muted-foreground">expired</span>}
                </Td>
                <Td right>{qtyLabel(d.quantity)}</Td>
                <Td right>
                  <span data-private>{cad(d.proceeds)}</span>
                </Td>
                <Td right>
                  <span data-private>{cad(d.acb)}</span>
                </Td>
                <Td right className={pnlClass(d.gain)}>
                  <span data-private>{cad(d.gain, true)}</span>
                </Td>
              </tr>
            ))}
          </DataTable>
          {report.holdings.length > 0 && (
            <DataTable
              head={
                <>
                  <Th>Held at the end of {year}</Th>
                  <Th right>Quantity</Th>
                  <Th right>ACB</Th>
                  <Th right>ACB per unit</Th>
                </>
              }
            >
              {report.holdings.map((h) => (
                <tr key={h.security} className="border-t border-border/40">
                  <Td>{h.security}</Td>
                  <Td right>{qtyLabel(h.quantity)}</Td>
                  <Td right>
                    <span data-private>{cad(h.acb)}</span>
                  </Td>
                  <Td right>
                    <span data-private>{cad(h.perUnit)}</span>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        Non-registered accounts only, in Canadian dollars, with the same security pooled across them. US dollar trades use C${report.cadPerUsd.toFixed(4)} per
        US$1, the average of your conversions; the CRA expects the rate on each trade's date. Superficial losses are not adjusted, and short sales and written
        options are left out{report.skipped > 0 && ` (${report.skipped} skipped)`}. Check the figures before you file.
      </p>
    </div>
  );
}
