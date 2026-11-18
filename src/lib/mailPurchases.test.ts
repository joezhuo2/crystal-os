import { describe, expect, it } from "vitest";
import type { MailItem } from "@/lib/mail";
import { billAlerts, isInvestmentMail, mailPurchases, parseAmount, upcomingBills } from "./mailPurchases";

let seq = 0;
const mail = (over: Partial<MailItem>): MailItem => ({
  id: `m${++seq}`,
  accountId: "a",
  provider: "google",
  account: "me@example.com",
  category: "order",
  confident: true,
  classifiedBy: "rules",
  from: "Shop",
  fromAddress: "orders@shop.example",
  subject: "Your order",
  snippet: "",
  receivedAt: "2026-11-10T15:00:00Z",
  url: "https://mail.example/1",
  ...over,
});
const total = (value: string, order?: string) => [{ label: "Total", value }, ...(order ? [{ label: "Order number", value: order }] : [])];

describe("parseAmount", () => {
  it("reads the number out of a money string", () => {
    expect(parseAmount("CA$1,234.50")).toBe(1234.5);
    expect(parseAmount("45 CAD")).toBe(45);
    expect(parseAmount("$0.00")).toBeNull();
    expect(parseAmount("free")).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe("mailPurchases", () => {
  it("takes order emails with a total, once per order", () => {
    const items = [
      mail({ id: "ship", details: total("$20.00", "A-12345"), receivedAt: "2026-11-12T15:00:00Z" }),
      mail({ id: "confirm", details: total("$20.00", "a-12345"), receivedAt: "2026-11-10T15:00:00Z" }),
      mail({ id: "plain", from: "Cafe", details: total("$4.50") }),
      mail({ id: "nototal" }),
      mail({ id: "bill", category: "bill", amount: "$80.00" }),
    ];
    expect(mailPurchases(items, new Set())).toEqual([
      { sourceId: "order:shop.example:a-12345", name: "Shop", amount: 20, date: "2026-11-10" },
      { sourceId: "mail:plain", name: "Cafe", amount: 4.5, date: "2026-11-10" },
    ]);
  });

  it("skips investments, refunds and anything already logged or dismissed", () => {
    const items = [
      mail({ id: "ws", from: "Wealthsimple", fromAddress: "support@wealthsimple.com", details: total("$500.00") }),
      mail({ id: "fill", subject: "Your order has been filled", details: total("$500.00") }),
      mail({ id: "refund", details: [...total("$9.00"), { label: "Status", value: "Refunded" }] }),
      mail({ id: "seen", details: total("$9.00") }),
      mail({ id: "seen2", details: total("$9.00", "B-99999") }),
    ];
    expect(mailPurchases(items, new Set(["mail:seen", "order:shop.example:b-99999"]))).toEqual([]);
    expect(isInvestmentMail(mail({ from: "Questrade" }))).toBe(true);
    expect(isInvestmentMail(mail({}))).toBe(false);
  });
});

describe("bills", () => {
  it("lists unpaid bills by due date and reminds the day before and on the day", () => {
    const items = [
      mail({ id: "hydro", category: "bill", from: "Hydro", amount: "$80.10", dueDate: "2026-11-20" }),
      mail({ id: "phone", category: "bill", from: "Phone", dueDate: "2026-11-19" }),
      mail({ id: "paid", category: "bill", dueDate: "2026-11-19" }),
      mail({ id: "undated", category: "bill" }),
    ];
    const bills = upcomingBills(items, new Set(["mail:paid"]));
    expect(bills.map((b) => [b.name, b.amount, b.dueDate])).toEqual([["Phone", null, "2026-11-19"], ["Hydro", 80.1, "2026-11-20"]]);
    expect(billAlerts(bills, "2026-11-18", "2026-11-19").map((a) => a.title)).toEqual(["Phone bill due tomorrow"]);
    expect(billAlerts(bills, "2026-11-20", "2026-11-21").map((a) => a.key)).toEqual(["bill-due:mail:hydro"]);
  });
});
