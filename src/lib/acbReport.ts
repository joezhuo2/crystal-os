import { instrumentKey, ledgerFills, usdPerCad } from "./tradeLedger";
import type { FxConversion, OptionContract, TradeEvent } from "./trades";
import { toLocalDateStr } from "./utils";

export interface AcbDisposition {
  date: string;
  security: string;
  quantity: number;
  proceeds: number;
  acb: number;
  gain: number;
  expired?: boolean;
}

export interface AcbHolding {
  security: string;
  quantity: number;
  acb: number;
  perUnit: number;
}

export interface AcbReport {
  year: string;
  cadPerUsd: number;
  dispositions: AcbDisposition[];
  holdings: AcbHolding[];
  totals: { proceeds: number; acb: number; gain: number };
  skipped: number;
}

const EPS = 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const isTaxable = (account: string) => /non-registered/i.test(account);

export function acbReport(events: TradeEvent[], fx: FxConversion[], year: string, today: string): AcbReport {
  const cadPerUsd = 1 / usdPerCad(fx);
  const end = `${year}-12-31`;
  const pools = new Map<string, { security: string; qty: number; acb: number; option?: OptionContract }>();
  const dispositions: AcbDisposition[] = [];
  let skipped = 0;

  for (const f of ledgerFills(events)) {
    if (!isTaxable(f.account)) continue;
    const date = toLocalDateStr(new Date(f.time));
    if (date > end) break;
    const value = (f.total ?? f.quantity * (f.price ?? 0) * (f.option ? 100 : 1)) * (f.currency === "USD" ? cadPerUsd : 1);
    const security = instrumentKey(f);
    const pool = pools.get(security) ?? { security, qty: 0, acb: 0, option: f.option };
    pools.set(security, pool);

    if (f.side === "buy") {
      if (f.effect === "close") {
        skipped++;
        continue;
      }
      pool.qty += f.quantity;
      pool.acb += value;
      continue;
    }
    if (f.effect === "open" || pool.qty <= EPS) {
      skipped++;
      continue;
    }
    const quantity = Math.min(f.quantity, pool.qty);
    if (quantity < f.quantity - EPS) skipped++;
    const cost = (pool.acb * quantity) / pool.qty;
    const proceeds = (value * quantity) / f.quantity;
    pool.qty -= quantity;
    pool.acb -= cost;
    if (pool.qty <= EPS) {
      pool.qty = 0;
      pool.acb = 0;
    }
    if (date.slice(0, 4) === year) {
      dispositions.push({ date, security, quantity, proceeds: round2(proceeds), acb: round2(cost), gain: round2(proceeds - cost) });
    }
  }

  for (const pool of pools.values()) {
    const expiry = pool.option?.expiry;
    if (!expiry || pool.qty <= EPS || expiry >= today || expiry > end) continue;
    if (expiry.slice(0, 4) === year) {
      dispositions.push({ date: expiry, security: pool.security, quantity: pool.qty, proceeds: 0, acb: round2(pool.acb), gain: round2(-pool.acb), expired: true });
    }
    pool.qty = 0;
    pool.acb = 0;
  }

  dispositions.sort((a, b) => a.date.localeCompare(b.date));
  const sum = (key: "proceeds" | "acb" | "gain") => round2(dispositions.reduce((total, d) => total + d[key], 0));
  return {
    year,
    cadPerUsd,
    dispositions,
    holdings: [...pools.values()]
      .filter((p) => p.qty > EPS)
      .map((p) => ({ security: p.security, quantity: p.qty, acb: round2(p.acb), perUnit: p.acb / p.qty / (p.option ? 100 : 1) }))
      .sort((a, b) => a.security.localeCompare(b.security)),
    totals: { proceeds: sum("proceeds"), acb: sum("acb"), gain: sum("gain") },
    skipped,
  };
}

const cell = (value: string | number) => {
  const text = typeof value === "number" ? String(Math.round(value * 1e6) / 1e6) : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function acbCsv(report: AcbReport): string {
  const rows: (string | number)[][] = [
    ["Date", "Security", "Quantity", "Proceeds (CAD)", "ACB (CAD)", "Gain or loss (CAD)", "Note"],
    ...report.dispositions.map((d) => [d.date, d.security, d.quantity, d.proceeds.toFixed(2), d.acb.toFixed(2), d.gain.toFixed(2), d.expired ? "Expired" : ""]),
    ["Total", "", "", report.totals.proceeds.toFixed(2), report.totals.acb.toFixed(2), report.totals.gain.toFixed(2), ""],
    [],
    [`Holdings at the end of ${report.year}`],
    ["Security", "Quantity", "ACB (CAD)", "ACB per unit (CAD)"],
    ...report.holdings.map((h) => [h.security, h.quantity, h.acb.toFixed(2), h.perUnit.toFixed(4)]),
    [],
    [`Non-registered accounts only. USD converted at ${report.cadPerUsd.toFixed(4)} CAD per USD. Superficial losses not adjusted.`],
  ];
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
