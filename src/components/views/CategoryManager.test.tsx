import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const updateFinancialCategory = vi.fn();

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({
    updateFinancialCategory,
    addTaskCategory: vi.fn(),
    addFinancialCategory: vi.fn(),
    deleteTaskCategory: vi.fn(),
    deleteFinancialCategory: vi.fn(),
  }),
  useTaskCategories: () => [{ id: "t1", name: "Work", color: "#112233" }],
  useFinancialCategories: () => [{ id: "f1", name: "Dining", color: "#445566", budget: 200 }],
}));

const { default: CategoryManager } = await import("./CategoryManager");

beforeEach(() => updateFinancialCategory.mockClear());

describe("CategoryManager", () => {
  it("renames a financial category on blur", () => {
    render(<CategoryManager mode="financial" onClose={vi.fn()} />);
    const name = screen.getByDisplayValue("Dining");
    fireEvent.change(name, { target: { value: "Eating out" } });
    fireEvent.blur(name);
    expect(updateFinancialCategory).toHaveBeenCalledWith("f1", { name: "Eating out" });
  });

  it("clears the budget when the field is emptied", () => {
    render(<CategoryManager mode="financial" onClose={vi.fn()} />);
    const budget = screen.getByLabelText("Monthly budget for Dining");
    fireEvent.change(budget, { target: { value: "" } });
    fireEvent.blur(budget);
    expect(updateFinancialCategory).toHaveBeenCalledWith("f1", { budget: null });
  });

  it("renders no budget inputs for task categories", () => {
    render(<CategoryManager mode="task" onClose={vi.fn()} />);
    expect(screen.queryByPlaceholderText("Budget/mo")).toBeNull();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });
});
