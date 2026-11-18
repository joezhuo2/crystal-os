import { describe, expect, it } from "vitest";
import type { Transaction } from "@/contexts/AppContext";
import { csvTransactions, newCsvRows, parseCsv, parseCsvAmount, parseCsvDate } from "./financeCsv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, a BOM and blank lines", () => {
    expect(parseCsv('﻿a,"b, ""c""",d\r\n\r\n1,2,3')).toEqual([["a", 'b, "c"', "d"], ["1", "2", "3"]]);
    expect(parseCsv("a;b\n1;2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("cells", () => {
  it("reads the usual bank date formats", () => {
    expect(parseCsvDate("2026-11-03")).toBe("2026-11-03");
    expect(parseCsvDate("20261103")).toBe("2026-11-03");
    expect(parseCsvDate("11/03/2026")).toBe("2026-11-03");
    expect(parseCsvDate("25/12/26")).toBe("2026-12-25");
    expect(parseCsvDate("Nov 3, 2026")).toBe("2026-11-03");
    expect(parseCsvDate("Description")).toBeNull();
    expect(parseCsvDate("13/13/2026")).toBeNull();
  });

  it("reads signed amounts", () => {
    expect(parseCsvAmount("-$1,234.50")).toBe(-1234.5);
    expect(parseCsvAmount("(45.00)")).toBe(-45);
    expect(parseCsvAmount("12.00 DR")).toBe(-12);
    expect(parseCsvAmount("7")).toBe(7);
    expect(parseCsvAmount("")).toBeNull();
    expect(parseCsvAmount("n/a")).toBeNull();
  });
});

describe("csvTransactions", () => {
  it("maps a headed export with one signed amount column", () => {
    const csv = "Transaction Date,Description,Amount,Balance\n2026-11-03,COFFEE  SHOP,-4.50,100\n2026-11-04,PAYROLL,2000.00,2100\nbad,row,x,y";
    expect(csvTransactions(csv)).toEqual({
      rows: [
        { date: "2026-11-03", name: "COFFEE SHOP", amount: 4.5, type: "expense" },
        { date: "2026-11-04", name: "PAYROLL", amount: 2000, type: "income" },
      ],
      skipped: 1,
    });
    expect(csvTransactions(csv, true).rows.map((r) => r.type)).toEqual(["income", "expense"]);
  });

  it("maps debit and credit columns, with or without a header", () => {
    const headed = "Date,Details,Withdrawals,Deposits\n11/03/2026,RENT,1500.00,\n11/05/2026,REFUND,,20.00";
    const bare = "11/03/2026,RENT,1500.00,\n11/05/2026,REFUND,,20.00";
    const expected = [
      { date: "2026-11-03", name: "RENT", amount: 1500, type: "expense" },
      { date: "2026-11-05", name: "REFUND", amount: 20, type: "income" },
    ];
    expect(csvTransactions(headed).rows).toEqual(expected);
    expect(csvTransactions(bare).rows).toEqual(expected);
    expect(csvTransactions("2026-11-03,COFFEE,-4.50").rows).toEqual([{ date: "2026-11-03", name: "COFFEE", amount: 4.5, type: "expense" }]);
    expect(csvTransactions("")).toEqual({ rows: [], skipped: 0 });
  });
});

describe("newCsvRows", () => {
  it("drops rows already logged but keeps real repeats in the file", () => {
    const coffee = { date: "2026-11-03", name: "Coffee", amount: 4.5, type: "expense" as const };
    const existing = [{ ...coffee, id: "1", name: " coffee", categoryId: "" }] as Transaction[];
    expect(newCsvRows([coffee, coffee, { ...coffee, amount: 5 }], existing)).toEqual([coffee, { ...coffee, amount: 5 }]);
    expect(newCsvRows([coffee], existing)).toEqual([]);
  });
});
