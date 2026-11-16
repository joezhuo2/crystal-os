import type { Dividend, FxConversion, OptionContract, TradeCurrency, TradeEvent, TradeJournal } from "./trades";

export interface Position {
  id: string;
  account: string;
  symbol: string;
  instrument: string;
  kind: "stock" | "option";
  option?: OptionContract;
  direction: "long" | "short";
  currency: TradeCurrency;
  status: "open" | "closed" | "expired";
  openedAt: string;
  closedAt?: string;
  holdDays: number;
  quantity: number;
  maxQuantity: number;
  boughtQty: number;
  soldQty: number;
  avgEntry: number;
  avgExit?: number;
  costBasis: number;
  acb: number;
  realizedPnl: number;
  pnlPct: number;
  superficialLoss: boolean;
  incomplete: boolean;
  unmatchedQty: number;
  events: TradeEvent[];
}

export interface LedgerResult {
  positions: Position[];
  orders: TradeEvent[];
}

export interface TradeFilter {
  account?: string;
  kind?: "stock" | "option";
  from?: string;
  to?: string;
  tag?: string;
}

export interface TradeStats {
  currency: TradeCurrency;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  expectancy: number;
  best?: Position;
  worst?: Position;
  avgHoldDays: number;
}

const DAY_MS = 86_400_000;
const EPS = 1e-9;
const CURRENCIES: TradeCurrency[] = ["USD", "CAD"];

const ms = (iso: string) => Date.parse(iso);
const day = (iso: string) => iso.slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS));

export const instrumentKey = (e: { symbol: string; option?: OptionContract }) =>
  e.option ? `${e.symbol} ${e.option.strike.toFixed(2)}${e.option.right === "call" ? "C" : "P"} ${e.option.expiry}` : e.symbol;

const securityKey = (e: TradeEvent) => `${e.currency}|${instrumentKey(e)}`;

function dropSupersededPartials(events: TradeEvent[]): TradeEvent[] {
  const sameOrder = (a: TradeEvent, b: TradeEvent) =>
    a.account === b.account && a.side === b.side && securityKey(a) === securityKey(b);
  const between = (c: TradeEvent, p: TradeEvent, e: TradeEvent) => ms(c.time) >= ms(p.time) && ms(c.time) <= ms(e.time);
  const ended = (p: TradeEvent, e: TradeEvent) =>
    events.some(
      (c) => (c.status === "cancelled" || c.status === "expired") && sameOrder(c, p) && c.quantity === p.orderedQuantity && between(c, p, e),
    );
  return events.filter(
    (p) =>
      p.status !== "partial" ||
      !events.some((e) => {
        if (e === p || !sameOrder(e, p)) return false;
        const gap = ms(e.time) - ms(p.time);
        if (gap < 0 || gap > 30 * DAY_MS) return false;
        // Partial emails are cumulative and share the minute, so the bigger fill is the later one.
        if (e.status === "partial") return e.orderedQuantity === p.orderedQuantity && e.quantity > p.quantity;
        // A short-filled order still ends with a "filled" email stating only the cumulative filled quantity.
        return e.status === "filled" && e.quantity >= p.quantity && e.quantity <= (p.orderedQuantity ?? Infinity) && !ended(p, e);
      }),
  );
}

interface Work {
  id: string;
  first: TradeEvent;
  direction: "long" | "short";
  mult: number;
  openedAt: string;
  closedAt?: string;
  expired: boolean;
  qty: number;
  cost: number;
  maxQty: number;
  bought: number;
  sold: number;
  entryQty: number;
  entryValue: number;
  exitQty: number;
  exitValue: number;
  closedCost: number;
  realized: number;
  acb: number;
  unmatched: number;
  events: TradeEvent[];
  lossSales: { t: number; after: number }[];
}

const canOpen = (f: TradeEvent) => (f.side === "buy" ? f.effect !== "close" : !!f.option && f.effect === "open");

function startWork(f: TradeEvent, id: string, direction: "long" | "short"): Work {
  return {
    id,
    first: f,
    direction,
    mult: f.option ? 100 : 1,
    openedAt: f.time,
    expired: false,
    qty: 0,
    cost: 0,
    maxQty: 0,
    bought: 0,
    sold: 0,
    entryQty: 0,
    entryValue: 0,
    exitQty: 0,
    exitValue: 0,
    closedCost: 0,
    realized: 0,
    acb: 0,
    unmatched: 0,
    events: [],
    lossSales: [],
  };
}

function countSide(w: Work, f: TradeEvent, qty: number) {
  if (f.side === "buy") w.bought += qty;
  else w.sold += qty;
  if (!w.events.includes(f)) w.events.push(f);
}

function addOpen(w: Work, f: TradeEvent, qty: number, value: number) {
  w.qty += qty;
  w.cost += value;
  w.entryQty += qty;
  w.entryValue += value;
  w.maxQty = Math.max(w.maxQty, w.qty);
  w.acb = w.cost / w.qty / w.mult;
  countSide(w, f, qty);
}

function addUnmatched(w: Work, f: TradeEvent, qty: number, value: number) {
  w.unmatched += qty;
  w.exitQty += qty;
  w.exitValue += value;
  countSide(w, f, qty);
}

function toPosition(w: Work, today: string, superficialLoss: boolean): Position {
  const f = w.first;
  const open = w.qty > EPS;
  const realizedPnl = round2(w.realized);
  return {
    id: w.id,
    account: f.account,
    symbol: f.symbol,
    instrument: instrumentKey(f),
    kind: f.option ? "option" : "stock",
    option: f.option,
    direction: w.direction,
    currency: f.currency,
    status: w.expired ? "expired" : open ? "open" : "closed",
    openedAt: w.openedAt,
    closedAt: open ? undefined : w.closedAt,
    holdDays: daysBetween(day(w.openedAt), open || !w.closedAt ? today : day(w.closedAt)),
    quantity: open ? w.qty : 0,
    maxQuantity: w.maxQty,
    boughtQty: w.bought,
    soldQty: w.sold,
    avgEntry: w.entryQty ? w.entryValue / w.entryQty / w.mult : 0,
    avgExit: w.exitQty ? w.exitValue / w.exitQty / w.mult : undefined,
    costBasis: open ? w.cost : w.closedCost,
    acb: w.acb,
    realizedPnl,
    pnlPct: w.closedCost ? (realizedPnl / w.closedCost) * 100 : 0,
    superficialLoss,
    incomplete: w.unmatched > EPS,
    unmatchedQty: w.unmatched,
    events: w.events,
  };
}

export function buildLedger(events: TradeEvent[], today: string): LedgerResult {
  const fills = dropSupersededPartials(events)
    .filter((e) => (e.status === "filled" || e.status === "partial") && e.quantity > 0)
    .sort((a, b) => ms(a.time) - ms(b.time));

  const works: Work[] = [];
  const current = new Map<string, Work>();
  const start = (f: TradeEvent, id: string, direction: "long" | "short") => {
    const w = startWork(f, id, direction);
    works.push(w);
    return w;
  };

  for (const f of fills) {
    const key = `${f.account}|${securityKey(f)}`;
    const value = f.total ?? f.quantity * (f.price ?? 0) * (f.option ? 100 : 1);
    const w = current.get(key);
    let rest = f.quantity;
    let target = w;

    if (w) {
      if ((w.direction === "long") === (f.side === "buy")) {
        addOpen(w, f, rest, value);
        continue;
      }
      const closeQty = rest >= w.qty - EPS ? w.qty : rest;
      const part = (value * closeQty) / f.quantity;
      const avg = w.cost / w.qty;
      const pnl = w.direction === "long" ? part - avg * closeQty : avg * closeQty - part;
      w.realized += pnl;
      w.closedCost += avg * closeQty;
      w.cost -= avg * closeQty;
      w.qty -= closeQty;
      w.exitQty += closeQty;
      w.exitValue += part;
      countSide(w, f, closeQty);
      if (w.qty <= EPS) {
        w.qty = 0;
        w.cost = 0;
        w.closedAt = f.time;
        current.delete(key);
      }
      if (round2(pnl) < 0) w.lossSales.push({ t: ms(f.time), after: w.qty });
      rest -= closeQty;
      if (rest <= EPS) continue;
    }

    const restValue = (value * rest) / f.quantity;
    if (canOpen(f)) {
      const next = start(f, w ? `${f.id}:cross` : f.id, f.side === "buy" ? "long" : "short");
      addOpen(next, f, rest, restValue);
      current.set(key, next);
      continue;
    }
    if (!target) {
      target = start(f, f.id, f.side === "sell" ? "long" : "short");
      target.closedAt = f.time;
    }
    addUnmatched(target, f, rest, restValue);
  }

  for (const w of current.values()) {
    const option = w.first.option;
    if (!option || today <= option.expiry) continue;
    w.closedAt = `${option.expiry}T16:00:00-05:00`;
    w.realized += w.direction === "long" ? -w.cost : w.cost;
    if (w.direction === "long" && w.cost > 0) w.lossSales.push({ t: ms(w.closedAt), after: 0 });
    w.closedCost += w.cost;
    w.exitQty += w.qty;
    w.qty = 0;
    w.cost = 0;
    w.expired = true;
  }

  const buys = fills.filter((f) => f.side === "buy").map((f) => ({ key: securityKey(f), account: f.account, t: ms(f.time) }));
  // shortcut: approximates CRA's identical-property rule; confirm with a tax professional
  const superficial = (w: Work) => {
    if (!/non-registered/i.test(w.first.account)) return false;
    const key = securityKey(w.first);
    return w.lossSales.some(
      (s) =>
        buys.some((b) => b.key === key && b.t > s.t && b.t <= s.t + 30 * DAY_MS) ||
        (s.after > EPS && buys.some((b) => b.key === key && b.account === w.first.account && b.t < s.t && b.t >= s.t - 30 * DAY_MS)),
    );
  };

  return {
    positions: works.map((w) => toPosition(w, today, superficial(w))),
    orders: [...events].sort((a, b) => ms(b.time) - ms(a.time)),
  };
}

const countable = (p: Position) => p.status !== "open" && !p.incomplete;
const closedDay = (p: Position) => day(p.closedAt ?? p.openedAt);

export function filterPositions(positions: Position[], f: TradeFilter, journal: Record<string, TradeJournal>): Position[] {
  return positions.filter((p) => {
    const date = closedDay(p);
    return (
      (!f.account || p.account === f.account) &&
      (!f.kind || p.kind === f.kind) &&
      (!f.from || date >= f.from) &&
      (!f.to || date <= f.to) &&
      (!f.tag || !!journal[p.id]?.tags.includes(f.tag))
    );
  });
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function tradeStats(closed: Position[]): TradeStats[] {
  const counted = closed.filter(countable);
  return CURRENCIES.flatMap((currency) => {
    const list = counted.filter((p) => p.currency === currency);
    if (!list.length) return [];
    const wins = list.filter((p) => p.realizedPnl > 0);
    const losses = list.filter((p) => p.realizedPnl < 0);
    const grossWin = sum(wins.map((p) => p.realizedPnl));
    const grossLoss = sum(losses.map((p) => p.realizedPnl));
    const totalPnl = round2(sum(list.map((p) => p.realizedPnl)));
    const byPnl = [...list].sort((a, b) => b.realizedPnl - a.realizedPnl);
    return [
      {
        currency,
        count: list.length,
        wins: wins.length,
        losses: losses.length,
        winRate: (wins.length / list.length) * 100,
        totalPnl,
        avgWin: wins.length ? grossWin / wins.length : 0,
        avgLoss: losses.length ? grossLoss / losses.length : 0,
        profitFactor: losses.length ? grossWin / -grossLoss : null,
        expectancy: totalPnl / list.length,
        best: byPnl[0],
        worst: byPnl[byPnl.length - 1],
        avgHoldDays: sum(list.map((p) => p.holdDays)) / list.length,
      },
    ];
  });
}

export function cumulativePnl(closed: Position[]): { date: string; [currency: string]: number | string }[] {
  const counted = closed.filter(countable).sort((a, b) => closedDay(a).localeCompare(closedDay(b)));
  const present = CURRENCIES.filter((c) => counted.some((p) => p.currency === c));
  const running: Record<string, number> = Object.fromEntries(present.map((c) => [c, 0]));
  const rows: { date: string; [currency: string]: number | string }[] = [];
  for (const p of counted) {
    running[p.currency] = round2(running[p.currency] + p.realizedPnl);
    const date = closedDay(p);
    const last = rows[rows.length - 1];
    if (last?.date === date) Object.assign(last, running);
    else rows.push({ date, ...running });
  }
  return rows;
}

export function dailyPnl(closed: Position[]): Record<string, Record<TradeCurrency, number>> {
  const out: Record<string, Record<TradeCurrency, number>> = {};
  for (const p of closed.filter(countable)) {
    const entry = (out[closedDay(p)] ??= { USD: 0, CAD: 0 });
    entry[p.currency] = round2(entry[p.currency] + p.realizedPnl);
  }
  return out;
}

export function pnlByTicker(closed: Position[]): { symbol: string; currency: TradeCurrency; pnl: number; count: number }[] {
  const groups = new Map<string, { symbol: string; currency: TradeCurrency; pnl: number; count: number }>();
  for (const p of closed.filter(countable)) {
    const key = `${p.currency}|${p.symbol}`;
    const g = groups.get(key) ?? { symbol: p.symbol, currency: p.currency, pnl: 0, count: 0 };
    g.pnl = round2(g.pnl + p.realizedPnl);
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.pnl - a.pnl);
}

export function tagStats(
  closed: Position[],
  journal: Record<string, TradeJournal>,
): { tag: string; count: number; winRate: number; totalPnl: number; avgPct: number }[] {
  const groups = new Map<string, Position[]>();
  for (const p of closed.filter(countable)) {
    for (const tag of new Set(journal[p.id]?.tags ?? [])) groups.set(tag, [...(groups.get(tag) ?? []), p]);
  }
  return [...groups.entries()]
    .map(([tag, list]) => ({
      tag,
      count: list.length,
      winRate: (list.filter((p) => p.realizedPnl > 0).length / list.length) * 100,
      totalPnl: round2(sum(list.map((p) => p.realizedPnl))),
      avgPct: sum(list.map((p) => p.pnlPct)) / list.length,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

// shortcut: assumes Wealthsimple's standard 1.5% FX fee, Plus/Premium pay less
// shortcut: used only when there are no conversion emails, swap in a live rate if precision matters
const FALLBACK_USD_PER_CAD = 0.72;

export function usdPerCad(fx: FxConversion[]): number {
  let cad = 0;
  let usd = 0;
  for (const c of fx) {
    if (c.fromCurrency === "CAD" && c.toCurrency === "USD") {
      cad += c.fromAmount;
      usd += c.toAmount;
    } else if (c.fromCurrency === "USD" && c.toCurrency === "CAD") {
      usd += c.fromAmount;
      cad += c.toAmount;
    }
  }
  return cad > 0 && usd > 0 ? usd / cad : FALLBACK_USD_PER_CAD;
}

export function inUsd(positions: Position[], rate: number): Position[] {
  return positions.map((p) =>
    p.currency === "USD"
      ? p
      : {
          ...p,
          currency: "USD",
          realizedPnl: round2(p.realizedPnl * rate),
          costBasis: p.costBasis * rate,
          avgEntry: p.avgEntry * rate,
          avgExit: p.avgExit === undefined ? undefined : p.avgExit * rate,
          acb: p.acb * rate,
        },
  );
}

const FX_FEE = 0.015;

export function fxSummary(fx: FxConversion[]): {
  conversions: (FxConversion & { rate: number; estFee: number })[];
  totalEstFee: Record<TradeCurrency, number>;
} {
  const totalEstFee: Record<TradeCurrency, number> = { USD: 0, CAD: 0 };
  const conversions = fx.map((c) => {
    const estFee = round2(c.fromAmount * FX_FEE);
    totalEstFee[c.fromCurrency] = round2(totalEstFee[c.fromCurrency] + estFee);
    return { ...c, rate: c.fromAmount ? c.toAmount / c.fromAmount : 0, estFee };
  });
  return { conversions, totalEstFee };
}

export function dividendSummary(dividends: Dividend[], year: string) {
  const totals = (list: Dividend[]) =>
    CURRENCIES.flatMap((currency) => {
      const amount = round2(sum(list.filter((d) => d.currency === currency).map((d) => d.amount)));
      return amount ? [{ currency, amount }] : [];
    });
  const groups = new Map<string, { symbol: string; currency: TradeCurrency; amount: number; count: number }>();
  for (const d of dividends) {
    const key = `${d.currency}|${d.symbol}`;
    const g = groups.get(key) ?? { symbol: d.symbol, currency: d.currency, amount: 0, count: 0 };
    g.amount = round2(g.amount + d.amount);
    g.count += 1;
    groups.set(key, g);
  }
  return {
    year: totals(dividends.filter((d) => d.time.slice(0, 4) === year)),
    allTime: totals(dividends),
    bySymbol: [...groups.values()].sort((a, b) => b.amount - a.amount),
  };
}
