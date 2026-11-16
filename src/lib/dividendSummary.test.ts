import { describe, expect, it } from "vitest";
import { dividendSummary } from "./tradeLedger";
import type { Dividend } from "./trades";

const paid = (symbol: string, amount: number, time: string, currency: Dividend["currency"] = "CAD"): Dividend => ({
  id: `${symbol}-${time}`,
  source: "email",
  account: "TFSA",
  symbol,
  amount,
  currency,
  time,
});

describe("dividendSummary", () => {
  const list = [
    paid("XEQT", 10.1, "2025-12-30T12:00:00.000Z"),
    paid("XEQT", 10.2, "2026-03-30T12:00:00.000Z"),
    paid("NVDA", 1.5, "2026-06-30T12:00:00.000Z", "USD"),
  ];

  it("totals the year and all time per currency, and each ticker", () => {
    expect(dividendSummary(list, "2026")).toEqual({
      year: [
        { currency: "USD", amount: 1.5 },
        { currency: "CAD", amount: 10.2 },
      ],
      allTime: [
        { currency: "USD", amount: 1.5 },
        { currency: "CAD", amount: 20.3 },
      ],
      bySymbol: [
        { symbol: "XEQT", currency: "CAD", amount: 20.3, count: 2 },
        { symbol: "NVDA", currency: "USD", amount: 1.5, count: 1 },
      ],
    });
  });

  it("is empty with no dividends", () => {
    expect(dividendSummary([], "2026")).toEqual({ year: [], allTime: [], bySymbol: [] });
  });
});
