import { describe, expect, it } from "vitest";
import {
  buildLedger,
  cumulativePnl,
  dailyPnl,
  filterPositions,
  fxSummary,
  inUsd,
  pnlByTicker,
  tagStats,
  tradeStats,
  usdPerCad,
  type Position,
} from "./tradeLedger";
import { formatMoney, formatPct, instrumentLabel, type TradeEvent, type TradeJournal } from "./trades";

let n = 0;
const ev = (over: Partial<TradeEvent>): TradeEvent => ({
  id: `e${++n}`,
  source: "email",
  status: "filled",
  account: "Non-registered",
  side: "buy",
  orderType: "Limit",
  symbol: "NVDA",
  quantity: 1,
  price: 100,
  currency: "USD",
  time: "2026-10-01T10:00:00-04:00",
  ...over,
});

const at = (date: string, time = "10:00") => `${date}T${time}:00-04:00`;
const put = { strike: 17, right: "put" as const, expiry: "2026-10-30" };
const TODAY = "2026-11-14";
const ledger = (events: TradeEvent[], today = TODAY) => buildLedger(events, today).positions;
const journal = (tags: string[]): TradeJournal => ({ tags, updatedAt: "2026-11-01T00:00:00Z" });

describe("buildLedger average cost", () => {
  it("averages several buys and realizes partial sells against the average", () => {
    const [p] = ledger([
      ev({ quantity: 10, price: 10, time: at("2026-10-01") }),
      ev({ quantity: 10, price: 20, time: at("2026-10-02") }),
      ev({ side: "sell", quantity: 5, price: 18, time: at("2026-10-03") }),
      ev({ side: "sell", quantity: 15, price: 12, time: at("2026-10-05") }),
    ]);
    expect(p.status).toBe("closed");
    expect(p.realizedPnl).toBeCloseTo(-30);
    expect(p.avgEntry).toBeCloseTo(15);
    expect(p.avgExit).toBeCloseTo(13.5);
    expect(p.acb).toBeCloseTo(15);
    expect(p.maxQuantity).toBe(20);
    expect(p.costBasis).toBeCloseTo(300);
    expect(p.pnlPct).toBeCloseTo(-10);
    expect(p.boughtQty).toBe(20);
    expect(p.soldQty).toBe(20);
    expect(p.holdDays).toBe(4);
    expect(p.closedAt).toBe(at("2026-10-05"));
  });

  it("keeps an open position with its open ACB and the realized part", () => {
    const [p] = ledger([
      ev({ quantity: 10, price: 10, time: at("2026-10-01") }),
      ev({ quantity: 10, price: 20, time: at("2026-10-02") }),
      ev({ side: "sell", quantity: 5, price: 18, time: at("2026-10-03") }),
    ]);
    expect(p.status).toBe("open");
    expect(p.quantity).toBe(15);
    expect(p.costBasis).toBeCloseTo(225);
    expect(p.acb).toBeCloseTo(15);
    expect(p.realizedPnl).toBeCloseTo(15);
    expect(p.closedAt).toBeUndefined();
    expect(p.holdDays).toBe(44);
  });

  it("prefers the stated total over quantity x price", () => {
    const [p] = ledger([
      ev({ quantity: 2, price: 206.8552, total: 413.71 }),
      ev({ side: "sell", quantity: 2, price: 210, total: 420, time: at("2026-10-02") }),
    ]);
    expect(p.realizedPnl).toBeCloseTo(6.29);
  });

  it("starts a new position with a new id after a round trip", () => {
    const a = ev({ time: at("2026-10-01") });
    const b = ev({ time: at("2026-10-03") });
    const positions = ledger([a, ev({ side: "sell", time: at("2026-10-02") }), b]);
    expect(positions.map((p) => [p.id, p.status])).toEqual([
      [a.id, "closed"],
      [b.id, "open"],
    ]);
  });

  it("closes and reopens when an option sell-to-open crosses through zero", () => {
    const buy = ev({ symbol: "APLD", option: put, quantity: 2, price: 1, effect: "open" });
    const sto = ev({ symbol: "APLD", option: put, side: "sell", effect: "open", quantity: 5, price: 2, time: at("2026-10-02") });
    const [first, second] = ledger([buy, sto], "2026-10-15");
    expect(first).toMatchObject({ id: buy.id, status: "closed", direction: "long", realizedPnl: 200 });
    expect(second).toMatchObject({ id: `${sto.id}:cross`, status: "open", direction: "short", quantity: 3, costBasis: 600 });
    expect(second.events).toEqual([sto]);
  });

  it("uses the 100 multiplier for options", () => {
    const [p] = ledger([
      ev({ symbol: "APLD", option: put, quantity: 2, price: 1.5, effect: "open" }),
      ev({ symbol: "APLD", option: put, side: "sell", effect: "close", quantity: 2, price: 2, time: at("2026-10-02") }),
    ]);
    expect(p.kind).toBe("option");
    expect(p.instrument).toBe("APLD 17.00P 2026-10-30");
    expect(p.realizedPnl).toBeCloseTo(100);
    expect(p.avgEntry).toBeCloseTo(1.5);
    expect(p.avgExit).toBeCloseTo(2);
    expect(p.acb).toBeCloseTo(1.5);
  });
});

describe("buildLedger option expiry", () => {
  const long = ev({ symbol: "APLD", option: put, quantity: 8, price: 0.01, total: 8, effect: "open", time: at("2026-10-29") });

  it("expires a long option at zero after the expiry date", () => {
    const [p] = ledger([long], "2026-10-31");
    expect(p).toMatchObject({ status: "expired", realizedPnl: -8, quantity: 0, costBasis: 8, pnlPct: -100 });
    expect(p.closedAt?.startsWith("2026-10-30")).toBe(true);
    expect(p.avgExit).toBe(0);
    expect(p.holdDays).toBe(1);
  });

  it("keeps it open on the expiry date itself", () => {
    expect(ledger([long], "2026-10-30")[0].status).toBe("open");
  });

  it("lets a short keep the premium when it expires", () => {
    const [p] = ledger([ev({ symbol: "APLD", option: put, side: "sell", effect: "open", quantity: 1, price: 0.5 })]);
    expect(p).toMatchObject({ status: "expired", direction: "short", realizedPnl: 50, pnlPct: 100 });
  });

  it("expires only what is left after a partial close", () => {
    const [p] = ledger([
      ev({ symbol: "APLD", option: put, quantity: 4, price: 1, effect: "open" }),
      ev({ symbol: "APLD", option: put, side: "sell", effect: "close", quantity: 2, price: 1.5, time: at("2026-10-02") }),
    ]);
    expect(p.status).toBe("expired");
    expect(p.realizedPnl).toBeCloseTo(100 - 200);
  });
});

describe("buildLedger shorts", () => {
  it("realizes sell-to-open then buy-to-close", () => {
    const [p] = ledger([
      ev({ symbol: "APLD", option: put, side: "sell", effect: "open", quantity: 2, price: 1 }),
      ev({ symbol: "APLD", option: put, side: "buy", effect: "close", quantity: 2, price: 0.4, time: at("2026-10-02") }),
    ]);
    expect(p).toMatchObject({ direction: "short", status: "closed", incomplete: false });
    expect(p.realizedPnl).toBeCloseTo(120);
    expect(p.pnlPct).toBeCloseTo(60);
    expect(p.avgEntry).toBeCloseTo(1);
    expect(p.avgExit).toBeCloseTo(0.4);
  });

  it("treats a buy-to-close with no short as unmatched", () => {
    const [p] = ledger([ev({ symbol: "APLD", option: put, side: "buy", effect: "close", quantity: 2, price: 0.4 })]);
    expect(p).toMatchObject({ direction: "short", incomplete: true, unmatchedQty: 2, realizedPnl: 0, status: "closed" });
  });
});

describe("buildLedger partial fills", () => {
  it("drops partials superseded by a later partial and the final fill", () => {
    const opt = { symbol: "APLD", option: put, effect: "open" as const };
    const events = [
      ev({ ...opt, status: "partial", quantity: 1, orderedQuantity: 8, total: 1, time: at("2026-10-01", "10:48") }),
      ev({ ...opt, status: "partial", quantity: 3, orderedQuantity: 8, total: 3, time: at("2026-10-01", "10:48") }),
      ev({ ...opt, status: "filled", quantity: 8, total: 8, time: at("2026-10-01", "10:49") }),
    ];
    const { positions, orders } = buildLedger(events, "2026-10-15");
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(8);
    expect(positions[0].events).toEqual([events[2]]);
    expect(orders).toHaveLength(3);
  });

  it("keeps the last partial when the rest of the order is cancelled", () => {
    const events = [
      ev({ status: "partial", quantity: 100, orderedQuantity: 263, total: 1000, time: at("2026-10-01") }),
      ev({ status: "cancelled", quantity: 263, price: 9, time: at("2026-10-01", "16:00") }),
    ];
    const { positions, orders } = buildLedger(events, TODAY);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ quantity: 100, costBasis: 1000, status: "open" });
    expect(orders.map((o) => o.id)).toEqual([events[1].id, events[0].id]);
  });

  it("drops a partial when the order ends with a short 'filled' email for the cumulative quantity", () => {
    const opt = { symbol: "APLD", option: put, effect: "open" as const };
    const events = [
      ev({ ...opt, status: "partial", quantity: 1, orderedQuantity: 10, total: 3, time: at("2026-10-01", "09:40") }),
      ev({ ...opt, status: "filled", quantity: 2, total: 6, time: at("2026-10-01", "09:51") }),
    ];
    const [p, ...rest] = ledger(events, "2026-10-15");
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ quantity: 2, costBasis: 6 });
  });

  it("keeps a partial whose order was cancelled before a new order filled", () => {
    const events = [
      ev({ status: "partial", quantity: 1, orderedQuantity: 10, total: 100, time: at("2026-10-01", "09:40") }),
      ev({ status: "cancelled", quantity: 10, price: 100, time: at("2026-10-01", "10:00") }),
      ev({ status: "filled", quantity: 2, total: 200, time: at("2026-10-01", "11:00") }),
    ];
    expect(ledger(events)[0]).toMatchObject({ quantity: 3, costBasis: 300 });
  });

  it("ignores cancelled, expired and rejected orders", () => {
    expect(ledger([ev({ status: "cancelled" }), ev({ status: "expired" }), ev({ status: "rejected" })])).toEqual([]);
  });
});

describe("buildLedger grouping", () => {
  it("keeps the same ticker in CAD and USD apart", () => {
    const positions = ledger([
      ev({ currency: "USD", price: 200 }),
      ev({ currency: "CAD", price: 49.76 }),
      ev({ currency: "CAD", side: "sell", price: 50, time: at("2026-10-02") }),
    ]);
    expect(positions.map((p) => [p.currency, p.status])).toEqual([
      ["USD", "open"],
      ["CAD", "closed"],
    ]);
    expect(positions[1].realizedPnl).toBeCloseTo(0.24);
  });

  it("keeps accounts apart", () => {
    expect(ledger([ev({ account: "TFSA" }), ev({ account: "Non-registered" })])).toHaveLength(2);
  });
});

describe("buildLedger unmatched sells", () => {
  it("marks a sell with no prior buy incomplete and leaves it out of stats", () => {
    const sale = ev({ side: "sell", quantity: 3, price: 50 });
    const positions = ledger([sale]);
    expect(positions[0]).toMatchObject({ id: sale.id, incomplete: true, unmatchedQty: 3, realizedPnl: 0, status: "closed", direction: "long" });
    expect(positions[0].avgExit).toBe(50);
    expect(tradeStats(positions)).toEqual([]);
    expect(cumulativePnl(positions)).toEqual([]);
    expect(pnlByTicker(positions)).toEqual([]);
    expect(dailyPnl(positions)).toEqual({});
    expect(tagStats(positions, { [sale.id]: journal(["fomo"]) })).toEqual([]);
  });

  it("realizes only the matched part of an oversized sell", () => {
    const [p, ...rest] = ledger([ev({ quantity: 5, price: 10 }), ev({ side: "sell", quantity: 8, price: 12, time: at("2026-10-02") })]);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ status: "closed", incomplete: true, unmatchedQty: 3, soldQty: 8 });
    expect(p.realizedPnl).toBeCloseTo(10);
  });

  it("does not let an option sell-to-close open a short", () => {
    const [p, ...rest] = ledger([ev({ symbol: "APLD", option: put, side: "sell", effect: "close", quantity: 2, price: 1 })]);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ incomplete: true, unmatchedQty: 2, status: "closed" });
  });
});

describe("buildLedger superficial loss", () => {
  const lossTrip = (account = "Non-registered") => [
    ev({ account, quantity: 10, price: 20, time: at("2026-10-01") }),
    ev({ account, side: "sell", quantity: 10, price: 15, time: at("2026-10-10") }),
  ];

  it("flags a non-registered loss rebought within 30 days, in any account", () => {
    const positions = ledger([...lossTrip(), ev({ account: "TFSA", time: at("2026-11-05") })]);
    expect(positions[0].superficialLoss).toBe(true);
  });

  it("does not flag when the rebuy is more than 30 days later", () => {
    expect(ledger([...lossTrip(), ev({ time: at("2026-11-12") })])[0].superficialLoss).toBe(false);
  });

  it("does not flag a different currency listing", () => {
    expect(ledger([...lossTrip(), ev({ currency: "CAD", time: at("2026-10-12") })])[0].superficialLoss).toBe(false);
  });

  it("never flags a registered account", () => {
    expect(ledger([...lossTrip("TFSA"), ev({ account: "TFSA", time: at("2026-10-12") })])[0].superficialLoss).toBe(false);
  });

  it("never flags a gain", () => {
    const positions = ledger([
      ev({ quantity: 10, price: 10, time: at("2026-10-01") }),
      ev({ side: "sell", quantity: 10, price: 15, time: at("2026-10-10") }),
      ev({ time: at("2026-10-12") }),
    ]);
    expect(positions[0].superficialLoss).toBe(false);
  });

  it("flags a partial loss sale while still holding shares bought in the prior 30 days", () => {
    const positions = ledger([
      ev({ quantity: 10, price: 20, time: at("2026-10-01") }),
      ev({ side: "sell", quantity: 4, price: 15, time: at("2026-10-10") }),
    ]);
    expect(positions[0].superficialLoss).toBe(true);
  });

  it("does not flag a partial loss sale when the holding is older than 30 days", () => {
    const positions = ledger([
      ev({ quantity: 10, price: 20, time: at("2026-08-01") }),
      ev({ side: "sell", quantity: 4, price: 15, time: at("2026-10-10") }),
    ]);
    expect(positions[0].superficialLoss).toBe(false);
  });
});

describe("stats", () => {
  const trip = (pnl: number, opts: Partial<TradeEvent> = {}, date = "2026-10-02") => [
    ev({ ...opts, quantity: 1, price: 100, time: at("2026-10-01") }),
    ev({ ...opts, side: "sell", quantity: 1, price: 100 + pnl, time: at(date) }),
  ];

  it("computes win rate, profit factor and expectancy per currency", () => {
    const positions = ledger([
      ...trip(100, { symbol: "A" }),
      ...trip(50, { symbol: "B" }, "2026-10-04"),
      ...trip(-30, { symbol: "C" }, "2026-10-04"),
      ...trip(20, { symbol: "D", currency: "CAD" }),
    ]);
    const [usd, cad] = tradeStats(positions);
    expect(usd).toMatchObject({ currency: "USD", count: 3, wins: 2, losses: 1, totalPnl: 120, avgWin: 75, avgLoss: -30, profitFactor: 5, expectancy: 40 });
    expect(usd.winRate).toBeCloseTo(66.667, 2);
    expect(usd.best?.symbol).toBe("A");
    expect(usd.worst?.symbol).toBe("C");
    expect(usd.avgHoldDays).toBeCloseTo(7 / 3);
    expect(cad).toMatchObject({ currency: "CAD", count: 1, profitFactor: null, winRate: 100, avgLoss: 0 });
  });

  it("returns null profit factor without losses and ignores open positions", () => {
    const [usd] = tradeStats(ledger([...trip(10), ev({ symbol: "OPEN" })]));
    expect(usd).toMatchObject({ count: 1, profitFactor: null });
  });

  it("builds cumulative, daily and per-ticker series", () => {
    const positions = ledger([
      ...trip(100, { symbol: "A" }),
      ...trip(-30, { symbol: "A", account: "TFSA" }, "2026-10-04"),
      ...trip(20, { symbol: "B", currency: "CAD" }, "2026-10-04"),
    ]);
    expect(cumulativePnl(positions)).toEqual([
      { date: "2026-10-02", USD: 100, CAD: 0 },
      { date: "2026-10-04", USD: 70, CAD: 20 },
    ]);
    expect(dailyPnl(positions)).toEqual({ "2026-10-02": { USD: 100, CAD: 0 }, "2026-10-04": { USD: -30, CAD: 20 } });
    expect(pnlByTicker(positions)).toEqual([
      { symbol: "A", currency: "USD", pnl: 70, count: 2 },
      { symbol: "B", currency: "CAD", pnl: 20, count: 1 },
    ]);
  });

  it("aggregates journal tags", () => {
    const positions = ledger([...trip(100, { symbol: "A" }), ...trip(-50, { symbol: "B" }), ...trip(20, { symbol: "C" })]);
    const j = { [positions[0].id]: journal(["breakout"]), [positions[1].id]: journal(["breakout", "fomo"]) };
    expect(tagStats(positions, j)).toEqual([
      { tag: "breakout", count: 2, winRate: 50, totalPnl: 50, avgPct: 25 },
      { tag: "fomo", count: 1, winRate: 0, totalPnl: -50, avgPct: -50 },
    ]);
  });
});

describe("filterPositions", () => {
  const positions: Position[] = ledger([
    ev({ symbol: "A", account: "TFSA", time: at("2026-09-01") }),
    ev({ symbol: "A", account: "TFSA", side: "sell", time: at("2026-09-05") }),
    ev({ symbol: "APLD", option: put, effect: "open", time: at("2026-10-20") }),
    ev({ symbol: "B", time: at("2026-11-01") }),
  ]);
  const j = { [positions[1].id]: journal(["lotto"]) };

  it("filters by account, kind, date range and tag", () => {
    const symbols = (f: Parameters<typeof filterPositions>[1]) => filterPositions(positions, f, j).map((p) => p.symbol);
    expect(symbols({})).toEqual(["A", "APLD", "B"]);
    expect(symbols({ account: "TFSA" })).toEqual(["A"]);
    expect(symbols({ kind: "option" })).toEqual(["APLD"]);
    expect(symbols({ kind: "stock" })).toEqual(["A", "B"]);
    expect(symbols({ from: "2026-09-05", to: "2026-10-30" })).toEqual(["A", "APLD"]);
    expect(symbols({ from: "2026-09-06" })).toEqual(["APLD", "B"]);
    expect(symbols({ tag: "lotto" })).toEqual(["APLD"]);
    expect(symbols({ tag: "none" })).toEqual([]);
  });
});

describe("fxSummary", () => {
  it("adds the rate and a 1.5% fee estimate in the source currency", () => {
    const base = { account: "Non-registered", time: "2026-10-01T10:00:00-04:00" };
    const { conversions, totalEstFee } = fxSummary([
      { ...base, id: "f1", fromAmount: 2000, fromCurrency: "CAD", toAmount: 1402.39, toCurrency: "USD" },
      { ...base, id: "f2", fromAmount: 100, fromCurrency: "USD", toAmount: 139, toCurrency: "CAD" },
      { ...base, id: "f3", fromAmount: 1000, fromCurrency: "CAD", toAmount: 700, toCurrency: "USD" },
    ]);
    expect(conversions[0].rate).toBeCloseTo(0.701195, 6);
    expect(conversions[0].estFee).toBe(30);
    expect(totalEstFee).toEqual({ CAD: 45, USD: 1.5 });
  });
});

describe("usdPerCad and inUsd", () => {
  const base = { account: "Non-registered", time: "2026-10-01T10:00:00-04:00" };

  it("averages the rate across conversions in both directions and falls back without any", () => {
    expect(
      usdPerCad([
        { ...base, id: "f1", fromAmount: 2000, fromCurrency: "CAD", toAmount: 1400, toCurrency: "USD" },
        { ...base, id: "f2", fromAmount: 100, fromCurrency: "USD", toAmount: 150, toCurrency: "CAD" },
      ]),
    ).toBeCloseTo(1500 / 2150, 6);
    expect(usdPerCad([])).toBe(0.72);
  });

  it("converts CAD positions to USD and leaves USD ones alone", () => {
    const positions = ledger([
      ev({ id: "c1", currency: "CAD", quantity: 1, price: 100, time: at("2026-10-01") }),
      ev({ id: "c2", currency: "CAD", side: "sell", quantity: 1, price: 150, time: at("2026-10-02") }),
      ev({ id: "u1", symbol: "AMD", quantity: 1, price: 10, time: at("2026-10-01") }),
      ev({ id: "u2", symbol: "AMD", side: "sell", quantity: 1, price: 12, time: at("2026-10-02") }),
    ]);
    const [cad, usd] = ["c1", "u1"].map((id) => inUsd(positions, 0.7).find((p) => p.id === id)!);
    expect(cad).toMatchObject({ currency: "USD", realizedPnl: 35, avgEntry: 70, avgExit: 105 });
    expect(cad.pnlPct).toBe(positions.find((p) => p.id === "c1")!.pnlPct);
    expect(usd).toBe(positions.find((p) => p.id === "u1"));
  });
});

describe("formatters", () => {
  it("formats money, percentages and instrument labels", () => {
    expect(formatMoney(1234.5, "USD")).toBe("US$1,234.50");
    expect(formatMoney(-8, "CAD")).toBe("-C$8.00");
    expect(formatMoney(12, "CAD", true)).toBe("+C$12.00");
    expect(formatMoney(-0.001, "USD", true)).toBe("US$0.00");
    expect(formatPct(66.666)).toBe("66.7%");
    expect(formatPct(5, true)).toBe("+5.0%");
    expect(formatPct(-0.01)).toBe("0.0%");
    expect(instrumentLabel({ symbol: "APLD", option: put })).toBe("APLD $17 Put · Oct 30");
    expect(instrumentLabel({ symbol: "TSLA", option: { strike: 402.5, right: "call", expiry: "2026-11-06" } })).toBe("TSLA $402.5 Call · Nov 6");
    expect(instrumentLabel({ symbol: "NVDA" })).toBe("NVDA");
  });
});
