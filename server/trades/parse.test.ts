import { describe, expect, it } from "vitest";
import { parseTradesCsv, parseWealthsimpleEmail } from "./parse";

const RECEIVED = "2026-10-30T12:00:00.000Z";

function parse(subject: string, lines: string[]) {
  return parseWealthsimpleEmail({
    messageId: "m1",
    subject,
    text: ["Here's a summary of the order", subject, ...lines, "Wealthsimple,"].join("\n"),
    receivedAt: RECEIVED,
    url: "https://mail.example/m1",
  });
}

function trade(subject: string, lines: string[]) {
  const r = parse(subject, lines);
  if (r?.kind !== "trade") throw new Error("expected a trade");
  return r.event;
}

const OPTION = ["Account: Non-registered", "Type: Limit Buy to Open", "Option: APLD 17.00 put", "Contracts: 8", "Expiry: 2026-10-30"];

describe("parseWealthsimpleEmail", () => {
  it("parses an option fill with a USD price and EDT time", () => {
    expect(trade("Your order has been filled", [...OPTION, "Average price: US$0.01", "Total cost: US$8.00", "Time: October 29, 2026 10:48 EDT"])).toEqual({
      id: "m1",
      source: "email",
      status: "filled",
      account: "Non-registered",
      side: "buy",
      effect: "open",
      orderType: "Limit",
      symbol: "APLD",
      option: { strike: 17, right: "put", expiry: "2026-10-30" },
      quantity: 8,
      price: 0.01,
      total: 8,
      currency: "USD",
      time: "2026-10-29T14:48:00.000Z",
      url: "https://mail.example/m1",
    });
  });

  it("parses a partial fill as k of N", () => {
    const e = trade("Your order has been partially filled", [...OPTION, "Average price: US$1.00", "Total cost: US$100.00", "Time: October 29, 2026 10:48 EDT"].map((l) => l.replace("Contracts: 8", "Contracts: 1 of 8")));
    expect(e).toMatchObject({ status: "partial", quantity: 1, orderedQuantity: 8, total: 100 });
  });

  it("parses a stock fill with commas, EST time and singular shares", () => {
    const e = trade("Your order has been filled", ["Account: TFSA", "Type: Limit Buy", "Symbol: nvda", "Shares: 1 share", "Average price: US$1,206.8552", "Total cost: US$1,206.86", "Time: November 12, 2026 09:30 EST"]);
    expect(e).toMatchObject({ symbol: "NVDA", quantity: 1, price: 1206.8552, total: 1206.86, time: "2026-11-12T14:30:00.000Z" });
    expect(trade("Your order has been filled", ["Account: TFSA", "Type: Limit Sell", "Symbol: CLS.TO", "Shares: 113 shares", "Average price: $9.50", "Total value: $1,073.50"])).toMatchObject({
      symbol: "CLS.TO",
      side: "sell",
      quantity: 113,
      currency: "CAD",
      total: 1073.5,
      time: RECEIVED,
    });
  });

  it("handles Fractional and Market order types and partial share counts", () => {
    expect(trade("Your order has been filled", ["Account: Non-registered", "Type: Fractional Sell", "Symbol: NVDA", "Shares: 0.0231", "Average price: $52.19", "Total value: $1.21"])).toMatchObject({
      orderType: "Fractional",
      side: "sell",
      quantity: 0.0231,
      currency: "CAD",
    });
    expect(trade("Your order has been partially filled", ["Account: Non-registered", "Type: Market Sell", "Symbol: XYZ", "Shares: 100 of 263", "Average price: US$6.07", "Total value: US$607.00"])).toMatchObject({
      orderType: "Market",
      status: "partial",
      quantity: 100,
      orderedQuantity: 263,
    });
  });

  it("parses to-close and generic order types", () => {
    expect(trade("Your order has been filled", ["Account: RRSP", "Type: Stop limit Sell to Open", "Option: MU 90.50 call", "Contracts: 2", "Expiry: 2026-12-18", "Average price: US$2.00"])).toMatchObject({
      orderType: "Stop limit",
      side: "sell",
      effect: "open",
      option: { strike: 90.5, right: "call" },
    });
  });

  it("keeps the ordered quantity and limit price for cancelled and expired orders", () => {
    const lines = [...OPTION, "Limit price: US$0.16", "Time: October 29, 2026 10:48 EDT"];
    expect(trade("Your order has been cancelled", lines)).toMatchObject({ status: "cancelled", quantity: 8, price: 0.16 });
    expect(trade("Your order has been cancelled", lines)).not.toHaveProperty("total");
    expect(trade("Your order has expired", lines)).toMatchObject({ status: "expired", quantity: 8 });
    expect(trade("Your order has been rejected", ["Account: TFSA", "Type: Limit Buy", "Symbol: APLD", "Shares: 67 shares", "Limit price: US$25.50"])).toMatchObject({ status: "rejected", quantity: 67, price: 25.5 });
  });

  it("falls back to the received time when the Time line is missing or unparseable", () => {
    expect(trade("Your order has been filled", [...OPTION, "Time: soon"]).time).toBe(RECEIVED);
  });

  it("reads the status from the body when the subject is missing", () => {
    const r = parseWealthsimpleEmail({ messageId: "m2", subject: "", text: ["Your order has been filled", ...OPTION].join("\n"), receivedAt: RECEIVED });
    expect(r).toMatchObject({ kind: "trade", event: { status: "filled" } });
  });

  it("parses an FX conversion and strips the parenthesised account", () => {
    expect(parse("Your funds have been converted", ["Account: Non-registered (******ABC123)", "Amount submitted: $2,000.00 CAD", "Amount received: 1,402.39 USD"])).toEqual({
      kind: "fx",
      fx: {
        id: "m1",
        account: "Non-registered",
        fromAmount: 2000,
        fromCurrency: "CAD",
        toAmount: 1402.39,
        toCurrency: "USD",
        time: RECEIVED,
        url: "https://mail.example/m1",
      },
    });
  });

  it("returns null for unrelated or incomplete emails", () => {
    expect(parse("Your statement is ready", ["Account: TFSA"])).toBeNull();
    expect(parse("Your order has been filled", ["Account: TFSA", "Type: Limit Buy"])).toBeNull();
    expect(parse("Your order has been filled", ["Account: TFSA", "Type: Limit Buy", "Option: APLD 17.00 put", "Contracts: 1"])).toBeNull();
    expect(parse("Your funds have been converted", ["Account: TFSA"])).toBeNull();
  });
});

describe("parseTradesCsv", () => {
  const ACTIVITY = [
    "transaction_date,account_type,activity_type,activity_sub_type,direction,symbol,currency,quantity,unit_price,net_cash_amount,name",
    '2026-10-01,TFSA,Trade,BUY,LONG,nvda,USD,2,206.5,-413,"Nvidia, Inc."',
    "2026-10-02,TFSA,Trade,SELL,SHORT,NVDA,USD,2,210,420,",
    "2026-10-03,TFSA,Dividend,,,NVDA,USD,,,1.5,",
    "2026-10-04,TFSA,Trade,BUY,LONG,,USD,1,1,-1,",
  ].join("\n");

  it("imports trade rows of the activities export and skips the rest", () => {
    const { events, dividends, skipped } = parseTradesCsv(ACTIVITY);
    expect(skipped).toBe(1);
    expect(events).toHaveLength(2);
    expect(dividends).toEqual([
      { id: expect.stringMatching(/^csv:div:[0-9a-f]{40}$/), source: "csv", account: "TFSA", symbol: "NVDA", amount: 1.5, currency: "USD", time: "2026-10-03T00:00:00.000Z" },
    ]);
    expect(events[0]).toMatchObject({ source: "csv", status: "filled", account: "TFSA", side: "buy", symbol: "NVDA", quantity: 2, price: 206.5, total: 413, currency: "USD", time: "2026-10-01T00:00:00.000Z" });
    expect(events[1]).toMatchObject({ side: "sell", total: 420 });
  });

  it("is idempotent: the same rows always get the same ids", () => {
    const ids = (csv: string) => parseTradesCsv(csv).events.map((e) => e.id);
    expect(ids(ACTIVITY)).toEqual(ids(ACTIVITY));
    expect(ids(ACTIVITY)[0]).toMatch(/^csv:[0-9a-f]{40}$/);
    expect(new Set(ids(ACTIVITY)).size).toBe(2);
  });

  it("keeps identical rows within one file apart", () => {
    const row = "2026-10-01,TFSA,Trade,BUY,LONG,NVDA,USD,1,10,-10";
    const { events } = parseTradesCsv(`transaction_date,account_type,activity_type,activity_sub_type,direction,symbol,currency,quantity,unit_price,net_cash_amount\n${row}\n${row}`);
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });

  it("accepts the simple header, quoted commas, CRLF and a BOM", () => {
    const csv = '﻿Date,Account,Side,Symbol,Quantity,Price,Currency\r\n2026-10-05,"RRSP, joint",buy,"shop",3,"1,050.25",cad\r\n';
    const { events, skipped } = parseTradesCsv(csv);
    expect(skipped).toBe(0);
    expect(events[0]).toMatchObject({ account: "RRSP, joint", side: "buy", symbol: "SHOP", quantity: 3, price: 1050.25, currency: "CAD" });
    expect(events[0].total).toBeUndefined();
  });

  it("skips rows with an unknown currency or bad date and tolerates an empty file", () => {
    expect(parseTradesCsv("date,account,side,symbol,quantity,price,currency\nnope,TFSA,buy,AAA,1,1,USD\n2026-10-05,TFSA,buy,AAA,1,1,EUR").skipped).toBe(2);
    expect(parseTradesCsv("")).toEqual({ events: [], dividends: [], skipped: 0 });
  });
});

describe("dividend emails", () => {
  it("reads labelled lines", () => {
    expect(parse("You received a dividend", ["Account: TFSA (******ABC123)", "Symbol: xeqt", "Amount: US$12.34"])).toEqual({
      kind: "dividend",
      dividend: { id: "m1", source: "email", account: "TFSA", symbol: "XEQT", amount: 12.34, currency: "USD", time: RECEIVED, url: "https://mail.example/m1" },
    });
  });

  it("reads a sentence, taking the ticker in brackets and not the account", () => {
    const r = parse("Your dividend has arrived", ["You received a dividend of $1,204.50 CAD from Royal Bank of Canada (RY.TO) in your Non-registered account (TFSA)."]);
    expect(r).toMatchObject({ kind: "dividend", dividend: { symbol: "RY.TO", amount: 1204.5, currency: "CAD", account: "Non-registered" } });
  });

  it("ignores a dividend email with no ticker or no amount", () => {
    expect(parse("Dividend reinvestment is now on", ["You can change this in settings."])).toBeNull();
    expect(parse("You received a dividend", ["Symbol: NVDA"])).toBeNull();
  });

  it("still reads an order email whose body mentions dividends", () => {
    const r = parse("Your order has been filled", ["Account: TFSA", "Type: Market Buy", "Symbol: NVDA", "Shares: 1", "Average price: US$5.00", "Dividends are paid in cash."]);
    expect(r).toMatchObject({ kind: "trade" });
  });
});
