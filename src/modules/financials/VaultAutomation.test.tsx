import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DEFAULT_NOTIFY_SETTINGS } from "@/lib/notifySettings";

const h = vi.hoisted(() => ({
  loading: false,
  recurring: [] as unknown[],
  items: undefined as unknown,
  known: new Set<string>(),
  existing: new Set<string>(),
  categories: [] as unknown[],
  transactions: [] as unknown[],
  settings: {} as Record<string, unknown>,
  quiet: false,
  addTransaction: vi.fn(),
  save: vi.fn(),
  deliver: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/contexts/AppContext", () => ({
  useAppLoading: () => h.loading,
  useTransactions: () => h.transactions,
  useFinancialCategories: () => h.categories,
  useAppActions: () => ({ addTransaction: h.addTransaction }),
}));
vi.mock("@/hooks/useFinance", () => ({
  useFinanceQuery: () => ({ data: { accounts: [], recurring: h.recurring, rules: [], goals: [], skips: [] } }),
  useFinanceActions: () => ({ save: h.save }),
}));
vi.mock("./shared", () => ({ useMailItems: () => h.items, useKnownSources: () => h.known }));
vi.mock("@/lib/localDb", () => ({
  db: {
    from: () => ({
      select: () => ({
        eq: async (_column: string, sourceId: string) => ({ data: h.existing.has(sourceId) ? [{ id: "x" }] : [], error: null }),
      }),
    }),
  },
}));
vi.mock("@/lib/notifications", () => ({ deliver: h.deliver }));
vi.mock("@/lib/notifySettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifySettings")>()),
  isQuiet: () => h.quiet,
  useNotifySettings: () => h.settings,
}));

const { default: VaultAutomation } = await import("./VaultAutomation");

const rent = { id: "r1", name: "Rent", amount: 900, type: "expense", categoryId: null, accountId: "a1", interval: "monthly", startDate: "2026-09-20", nextDate: "2026-09-20" };
const order = {
  id: "m1",
  category: "order",
  from: "Shop",
  fromAddress: "hi@shop.test",
  subject: "Your order",
  receivedAt: new Date(2026, 10, 17, 9).toISOString(),
  details: [{ label: "Total", value: "$12.50" }],
};
const food = { id: "c1", name: "Food", color: "#fff", budget: 100 };
const spend = { id: "t1", name: "Lunch", amount: 90, type: "expense", categoryId: "c1", date: "2026-11-10" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 18, 12));
  Object.assign(h, { loading: false, recurring: [], items: undefined, known: new Set(), existing: new Set(), categories: [], transactions: [], quiet: false });
  h.settings = { ...DEFAULT_NOTIFY_SETTINGS };
  h.addTransaction.mockReset().mockResolvedValue(undefined);
  h.save.mockReset().mockResolvedValue(undefined);
  h.deliver.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("VaultAutomation recurring", () => {
  it("logs every missed occurrence and advances nextDate", async () => {
    h.recurring = [rent];
    render(<VaultAutomation />);
    await waitFor(() => expect(h.save).toHaveBeenCalledWith("recurring", { id: "r1", nextDate: "2026-11-20" }));
    expect(h.addTransaction.mock.calls.map(([tx]) => [tx.date, tx.sourceId])).toEqual([
      ["2026-09-20", "rec:r1:2026-09-20"],
      ["2026-10-20", "rec:r1:2026-10-20"],
    ]);
    expect(h.addTransaction.mock.calls[0][0]).toMatchObject({ name: "Rent", amount: 900, type: "expense", categoryId: "", accountId: "a1" });
  });

  it("skips an occurrence already in the database but still advances", async () => {
    h.recurring = [rent];
    h.existing = new Set(["rec:r1:2026-09-20"]);
    render(<VaultAutomation />);
    await waitFor(() => expect(h.save).toHaveBeenCalledWith("recurring", { id: "r1", nextDate: "2026-11-20" }));
    expect(h.addTransaction.mock.calls.map(([tx]) => tx.sourceId)).toEqual(["rec:r1:2026-10-20"]);
  });
});

describe("VaultAutomation mail purchases", () => {
  it("adds an order once as an expense", async () => {
    h.items = [order];
    render(<VaultAutomation />);
    await waitFor(() => expect(h.addTransaction).toHaveBeenCalledTimes(1));
    expect(h.addTransaction.mock.calls[0][0]).toMatchObject({ name: "Shop", amount: 12.5, type: "expense", date: "2026-11-17", sourceId: "mail:m1" });
  });

  it("does not add an order that is already known", async () => {
    h.items = [order];
    h.known = new Set(["mail:m1"]);
    render(<VaultAutomation />);
    await Promise.resolve();
    expect(h.addTransaction).not.toHaveBeenCalled();
  });
});

describe("VaultAutomation while loading", () => {
  it("writes nothing", async () => {
    h.loading = true;
    h.recurring = [rent];
    h.items = [order];
    render(<VaultAutomation />);
    await Promise.resolve();
    expect(h.addTransaction).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });
});

describe("VaultAutomation budget alerts", () => {
  beforeEach(() => {
    h.categories = [food];
    h.transactions = [spend];
  });

  it("delivers when on", () => {
    render(<VaultAutomation />);
    expect(h.deliver).toHaveBeenCalledWith([expect.objectContaining({ key: "budget:c1:2026-11:80" })]);
  });

  it("does not deliver when the setting is off", () => {
    h.settings = { ...DEFAULT_NOTIFY_SETTINGS, budgetAlerts: false };
    render(<VaultAutomation />);
    expect(h.deliver).not.toHaveBeenCalled();
  });

  it("does not deliver while quiet", () => {
    h.quiet = true;
    render(<VaultAutomation />);
    expect(h.deliver).not.toHaveBeenCalled();
  });
});
