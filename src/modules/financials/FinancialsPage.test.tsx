import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Transaction } from "@/contexts/AppContext";

const tx = (over: Partial<Transaction> & Pick<Transaction, "id" | "name">): Transaction => ({
  amount: 10,
  type: "expense",
  categoryId: "c1",
  date: "2026-06-10",
  ...over,
});

const transactions: Transaction[] = [
  tx({ id: "t1", name: "Coffee beans", categoryId: "gone" }),
  tx({ id: "t2", name: "Old rent", date: "2026-01-05" }),
  tx({ id: "t3", name: "Groceries", date: "2026-06-12" }),
  tx({ id: "t4", name: "Hydro", date: "2026-06-01", sourceId: "mail:1" }),
];

const deleteTransaction = vi.fn();
const addTransaction = vi.fn();
const skip = vi.fn();

vi.mock("@/contexts/AppContext", () => ({
  useTransactions: (select?: (t: Transaction[]) => unknown) => (select ? select(transactions) : transactions),
  useFinancialCategories: () => categories,
  useAppActions: () => ({ addTransaction, updateTransaction: vi.fn(), deleteTransaction }),
}));

const categories = [{ id: "c1", name: "Food", color: "red", budget: null }];

vi.mock("@/hooks/useFinance", () => ({
  useFinance: () => ({ accounts: [], recurring: [], rules: [], goals: [], skips: [] }),
  useFinanceActions: () => ({ save: vi.fn(), remove: vi.fn(), skip }),
}));

vi.mock("./FinanceCharts", () => ({
  ChartFrame: () => null,
  LineAreaChart: () => null,
  DonutChart: () => null,
}));
vi.mock("./VaultPanels", () => ({
  AccountsCard: () => null,
  BudgetsCard: () => null,
  GoalsCard: () => null,
  UpcomingCard: () => null,
}));
vi.mock("./VaultDialogs", () => ({
  CsvImportDialog: () => null,
  ReceiptDialog: () => null,
  RecurringDialog: () => null,
  RulesDialog: () => null,
}));
vi.mock("@/components/ItemNoteLink", () => ({ ItemNoteLink: () => null }));
vi.mock("@/components/views/CategoryManager", () => ({ CategoryManagerButton: () => null }));

import FinancialsPage, { TransactionDrawer } from "./FinancialsPage";

describe("FinancialsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00"));
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("shows a transaction with a deleted category as Uncategorised", () => {
    render(<FinancialsPage />);
    expect(screen.getByText("Coffee beans").parentElement).toHaveTextContent("Uncategorised");
    expect(document.body).not.toHaveTextContent("null");
  });

  it("does not list a transaction older than the default period", () => {
    render(<FinancialsPage />);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.queryByText("Old rent")).not.toBeInTheDocument();
  });

  it("filters the list by the search box", () => {
    render(<FinancialsPage />);
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "grocer" } });
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.queryByText("Coffee beans")).not.toBeInTheDocument();
  });

  it("deleting an emailed transaction also skips the email", () => {
    render(<FinancialsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Hydro" }));
    expect(deleteTransaction).toHaveBeenCalledWith("t4");
    expect(skip).toHaveBeenCalledWith("mail:1");
  });

  it("keeps the drawer submit disabled for a zero or negative amount", () => {
    render(<TransactionDrawer onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Lunch" } });
    const submit = screen.getByRole("button", { name: "Add Transaction" });
    for (const value of ["0", "-5", ""]) {
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value } });
      expect(submit).toBeDisabled();
    }
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12.5" } });
    expect(submit).toBeEnabled();
  });
});
