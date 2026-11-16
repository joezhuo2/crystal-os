import { describe, expect, it } from "vitest";
import { acbCsv, acbReport } from "./acbReport";
import type { FxConversion, TradeEvent } from "./trades";

let n = 0;
const ev = (over: Partial<TradeEvent>): TradeEvent => ({
  id: `e${n++}`,
  source: "manual",
  status: "filled",
  account: "Non-registered",
  side: "buy",
  orderType: "Market",
  symbol: "ABC",
  quantity: 10,
  currency: "CAD",
  time: "2026-03-02T15:00:00.000Z",
  ...over,
});

const TODAY = "2026-11-16";

describe("acbReport", () => {
  it("averages the cost of buys and takes a sale's share of it", () => {
    const report = acbReport(
      [
        ev({ total: 1000 }),
        ev({ total: 1200, time: "2026-04-02T15:00:00.000Z" }),
        ev({ side: "sell", quantity: 5, total: 700, time: "2026-05-02T15:00:00.000Z" }),
      ],
      [],
      "2026",
      TODAY,
    );
    expect(report.dispositions).toEqual([{ date: "2026-05-02", security: "ABC", quantity: 5, proceeds: 700, acb: 550, gain: 150 }]);
    expect(report.holdings).toEqual([{ security: "ABC", quantity: 15, acb: 1650, perUnit: 110 }]);
    expect(report.totals).toEqual({ proceeds: 700, acb: 550, gain: 150 });
    expect(report.skipped).toBe(0);
  });

  it("leaves registered accounts out and pools the non-registered ones", () => {
    const report = acbReport(
      [
        ev({ account: "TFSA", total: 5000 }),
        ev({ total: 1000 }),
        ev({ account: "TFSA", side: "sell", total: 9000, time: "2026-05-02T15:00:00.000Z" }),
        ev({ side: "sell", total: 900, time: "2026-06-02T15:00:00.000Z" }),
      ],
      [],
      "2026",
      TODAY,
    );
    expect(report.dispositions).toEqual([{ date: "2026-06-02", security: "ABC", quantity: 10, proceeds: 900, acb: 1000, gain: -100 }]);
    expect(report.holdings).toEqual([]);
  });

  it("converts USD at the average rate of the conversions", () => {
    const fx: FxConversion[] = [{ id: "f", account: "Non-registered", fromAmount: 1000, fromCurrency: "CAD", toAmount: 800, toCurrency: "USD", time: "2026-01-02T15:00:00.000Z" }];
    const report = acbReport(
      [ev({ currency: "USD", total: 800 }), ev({ currency: "USD", side: "sell", total: 880, time: "2026-05-02T15:00:00.000Z" })],
      fx,
      "2026",
      TODAY,
    );
    expect(report.cadPerUsd).toBeCloseTo(1.25);
    expect(report.dispositions[0]).toMatchObject({ proceeds: 1100, acb: 1000, gain: 100 });
  });

  it("carries cost in from earlier years and reports only the chosen year", () => {
    const events = [
      ev({ total: 1000, time: "2025-03-02T15:00:00.000Z" }),
      ev({ side: "sell", quantity: 4, total: 600, time: "2025-09-02T15:00:00.000Z" }),
      ev({ side: "sell", quantity: 6, total: 300, time: "2026-02-02T15:00:00.000Z" }),
    ];
    expect(acbReport(events, [], "2026", TODAY).dispositions).toEqual([{ date: "2026-02-02", security: "ABC", quantity: 6, proceeds: 300, acb: 600, gain: -300 }]);
    const last = acbReport(events, [], "2025", TODAY);
    expect(last.dispositions.map((d) => d.gain)).toEqual([200]);
    expect(last.holdings).toEqual([{ security: "ABC", quantity: 6, acb: 600, perUnit: 100 }]);
  });

  it("writes off a long option that expired, and skips short sales and written options", () => {
    const option = { strike: 50, right: "call" as const, expiry: "2026-06-19" };
    const report = acbReport(
      [
        ev({ option, effect: "open", quantity: 1, total: 250 }),
        ev({ symbol: "XYZ", side: "sell", total: 100 }),
        ev({ symbol: "MU", option, side: "sell", effect: "open", quantity: 1, total: 90 }),
      ],
      [],
      "2026",
      TODAY,
    );
    expect(report.dispositions).toEqual([{ date: "2026-06-19", security: "ABC 50.00C 2026-06-19", quantity: 1, proceeds: 0, acb: 250, gain: -250, expired: true }]);
    expect(report.skipped).toBe(2);
    expect(report.holdings).toEqual([]);
  });
});

describe("acbCsv", () => {
  it("lists the dispositions, the total and the holdings, quoting where needed", () => {
    const csv = acbCsv({
      year: "2026",
      cadPerUsd: 1.25,
      dispositions: [{ date: "2026-05-02", security: "A,B", quantity: 5, proceeds: 700, acb: 550, gain: 150 }],
      holdings: [{ security: "ABC", quantity: 15, acb: 1650, perUnit: 110 }],
      totals: { proceeds: 700, acb: 550, gain: 150 },
      skipped: 0,
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Date,Security,Quantity,Proceeds (CAD),ACB (CAD),Gain or loss (CAD),Note");
    expect(lines[1]).toBe('2026-05-02,"A,B",5,700.00,550.00,150.00,');
    expect(lines[2]).toBe("Total,,,700.00,550.00,150.00,");
    expect(lines).toContain("ABC,15,1650.00,110.0000");
  });
});
