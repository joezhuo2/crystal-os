import { describe, expect, it } from "vitest";
import type { Transaction } from "@/contexts/AppContext";
import {
  accountBalances,
  amountLabel,
  budgetAlerts,
  budgetLines,
  cashFlow,
  categorise,
  dueOccurrences,
  goalProgress,
  monthlyCost,
  netTrend,
  netWorth,
  netWorthTrend,
  periodStart,
  since,
  spendingSlices,
  stepDate,
  totals,
  type Recurring,
} from "./finance";

let seq = 0;
const tx = (over: Partial<Transaction>): Transaction => ({ id: `t${++seq}`, name: "x", amount: 10, type: "expense", categoryId: "", date: "2026-11-10", ...over });

const cats = [
  { id: "food", name: "Food", color: "red", budget: 100 },
  { id: "rent", name: "Rent", color: "blue" },
];

describe("periods and totals", () => {
  it("starts each period on the right day", () => {
    expect(periodStart("month", "2026-11-18")).toBe("2026-11-01");
    expect(periodStart("3m", "2026-01-18")).toBe("2025-11-01");
    expect(periodStart("ytd", "2026-11-18")).toBe("2026-01-01");
    expect(periodStart("all", "2026-11-18")).toBeNull();
  });

  it("leaves transfers out of income, spending and the savings rate", () => {
    const list = [tx({ type: "income", amount: 200 }), tx({ amount: 50 }), tx({ type: "transfer", amount: 500 }), tx({ amount: 5, date: "2026-10-01" })];
    expect(totals(since(list, "2026-11-01"))).toEqual({ income: 200, spent: 50, net: 150, savingsRate: 75 });
    expect(totals([tx({})]).savingsRate).toBeNull();
    expect(amountLabel(tx({ type: "transfer", amount: 5 }))).toBe("⇄ $5.00");
  });
});

describe("charts", () => {
  it("buckets one month by day and longer spans by month", () => {
    const list = [tx({ date: "2026-11-02", amount: 4 }), tx({ date: "2026-11-02", type: "income", amount: 9 }), tx({ date: "2026-09-30", amount: 1 }), tx({ type: "transfer" })];
    const days = cashFlow(list, "2026-11-01", "2026-11-03");
    expect(days.map((d) => d.label)).toEqual(["11-01", "11-02", "11-03"]);
    expect(days[1]).toEqual({ label: "11-02", income: 9, expense: 4, net: 5 });
    expect(cashFlow(list, "2026-09-01", "2026-11-03").map((m) => [m.label, m.expense])).toEqual([["Sep", 1], ["Oct", 0], ["Nov", 4]]);
    expect(cashFlow(list, null, "2027-01-03").map((m) => m.label)).toEqual(["Sep 26", "Oct 26", "Nov 26", "Dec 26", "Jan 27"]);
    expect(cashFlow([], null, "2026-11-03")).toHaveLength(1);
  });

  it("groups spending with no category, or a deleted one, as Uncategorised", () => {
    const slices = spendingSlices([tx({ categoryId: "food", amount: 3 }), tx({ categoryId: "" }), tx({ categoryId: "gone", amount: 2 }), tx({ type: "income" })], cats);
    expect(slices.map((s) => [s.name, s.value])).toEqual([["Uncategorised", 12], ["Food", 3]]);
  });

  it("runs the net total by day, with the year once it spans two", () => {
    expect(netTrend([tx({ date: "2026-11-02" }), tx({ date: "2026-11-01", type: "income", amount: 30 }), tx({ type: "transfer" })])).toEqual([
      { date: "11-01", savings: 30 },
      { date: "11-02", savings: 20 },
    ]);
    expect(netTrend([tx({ date: "2025-12-31" }), tx({ date: "2026-01-01" })])[0].date).toBe("2025-12-31");
  });
});

describe("budgets", () => {
  it("measures this month's spending against each category budget", () => {
    const lines = budgetLines([tx({ categoryId: "food", amount: 85 }), tx({ categoryId: "food", date: "2026-10-30", amount: 500 }), tx({ categoryId: "rent" })], cats, "2026-11");
    expect(lines).toEqual([{ id: "food", name: "Food", color: "red", budget: 100, spent: 85, ratio: 0.85 }]);
    expect(budgetAlerts(lines, "2026-11").map((a) => a.key)).toEqual(["budget:food:2026-11:80"]);
    expect(budgetAlerts([{ ...lines[0], spent: 120, ratio: 1.2 }], "2026-11")[0].key).toBe("budget:food:2026-11:100");
    expect(budgetAlerts([{ ...lines[0], ratio: 0.79 }], "2026-11")).toEqual([]);
  });
});

describe("categorise", () => {
  const rules = [
    { id: "1", keyword: "uber", categoryId: "transport" },
    { id: "2", keyword: "Uber Eats", categoryId: "food" },
    { id: "3", keyword: " ", categoryId: "blank" },
  ];

  it("prefers the longest matching rule, then the latest transaction of the same name", () => {
    expect(categorise("UBER EATS toronto", rules, [])).toBe("food");
    expect(categorise("Uber trip", rules, [])).toBe("transport");
    const history = [tx({ name: "Coffee", categoryId: "old", date: "2026-01-01" }), tx({ name: "coffee ", categoryId: "new", date: "2026-02-01" }), tx({ name: "Coffee", categoryId: "" })];
    expect(categorise("coffee", rules, history)).toBe("new");
    expect(categorise("Unknown", rules, history)).toBe("");
    expect(categorise("  ", rules, history)).toBe("");
  });
});

describe("recurring", () => {
  it("steps dates, holding a month-end anchor", () => {
    expect(stepDate("2026-11-10", "weekly")).toBe("2026-11-17");
    expect(stepDate("2026-11-10", "biweekly")).toBe("2026-11-24");
    expect(stepDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(stepDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(stepDate("2026-12-15", "monthly")).toBe("2027-01-15");
    expect(stepDate("2024-02-29", "yearly")).toBe("2025-02-28");
  });

  it("lists every occurrence due up to today and the next one after", () => {
    const rent = { interval: "monthly" as const, startDate: "2026-08-31", nextDate: "2026-09-30" };
    expect(dueOccurrences(rent, "2026-11-18")).toEqual({ dates: ["2026-09-30", "2026-10-31"], nextDate: "2026-11-30" });
    expect(dueOccurrences(rent, "2026-09-29")).toEqual({ dates: [], nextDate: "2026-09-30" });
    expect(dueOccurrences({ interval: "weekly", startDate: "2020-01-01", nextDate: "2020-01-01" }, "2026-11-18", 3).dates).toHaveLength(3);
  });

  it("adds up recurring expenses per month", () => {
    const r = (over: Partial<Recurring>): Recurring => ({ id: "r", name: "n", amount: 12, type: "expense", categoryId: null, accountId: null, interval: "monthly", startDate: "2026-01-01", nextDate: "2026-12-01", ...over });
    expect(monthlyCost([r({}), r({ interval: "yearly", amount: 120 }), r({ type: "income", amount: 999 })])).toBe(22);
  });
});

describe("accounts", () => {
  const accounts = [
    { id: "chq", name: "Chequing", openingBalance: 1000 },
    { id: "inv", name: "Wealthsimple", openingBalance: 0 },
  ];
  const list = [
    tx({ accountId: "chq", type: "income", amount: 500, date: "2026-10-05" }),
    tx({ accountId: "chq", amount: 100, date: "2026-11-02" }),
    tx({ accountId: "chq", toAccountId: "inv", type: "transfer", amount: 300, date: "2026-11-03" }),
    tx({ amount: 77 }),
    tx({ accountId: "deleted", amount: 5 }),
  ];

  it("moves transfers between accounts without changing net worth", () => {
    const balances = accountBalances(accounts, list);
    expect([...balances]).toEqual([["chq", 1100], ["inv", 300]]);
    expect(netWorth(balances)).toBe(1400);
    expect(netWorth(accountBalances(accounts, list, "2026-10-31"))).toBe(1500);
  });

  it("charts net worth at each month end, ending today", () => {
    const trend = netWorthTrend(accounts, list, "2026-11-18", 3);
    expect(trend).toEqual([
      { label: "Sep", worth: 1000 },
      { label: "Oct", worth: 1500 },
      { label: "Nov", worth: 1400 },
    ]);
  });

  it("tracks a goal from its account, or from the amount typed in", () => {
    const balances = accountBalances(accounts, list);
    const goal = { id: "g", name: "Trip", target: 600, deadline: "2027-02-15", accountId: "inv", saved: 50 };
    expect(goalProgress(goal, balances, "2026-11-18")).toEqual({ saved: 300, left: 300, ratio: 0.5, perMonth: 100 });
    expect(goalProgress({ ...goal, accountId: null, deadline: null }, balances, "2026-11-18")).toEqual({ saved: 50, left: 550, ratio: 50 / 600, perMonth: null });
    expect(goalProgress({ ...goal, target: 100 }, balances, "2026-11-18")).toMatchObject({ left: 0, ratio: 1, perMonth: null });
  });
});
