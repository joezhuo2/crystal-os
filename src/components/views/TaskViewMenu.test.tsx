import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";
import { toLocalDateStr } from "@/lib/utils";
import { taskView } from "@/lib/taskView";

const taskCategories = [
  { id: "c1", name: "Work", color: "hsl(0 0% 50%)" },
  { id: "c2", name: "Home", color: "hsl(120 50% 50%)" },
];

let tasks: Task[] = [];

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ updateTask: vi.fn(), completeTask: vi.fn(), deleteTask: vi.fn() }),
  useTaskCategories: () => taskCategories,
  useTasks: () => tasks,
}));
vi.mock("./CapacityBar", () => ({ CapacityCard: () => null }));
vi.mock("./PomodoroTimer", () => ({ default: () => null }));
vi.mock("./CategoryManager", () => ({ CategoryManagerButton: () => null }));

const { default: TasksPage } = await import("./TasksPage");

const today = toLocalDateStr();
const base = (over: Partial<Task>): Task => ({
  id: "t",
  name: "Task",
  startDate: today,
  startTime: "09:00",
  endDate: today,
  endTime: "10:00",
  priority: "medium",
  categoryId: "c1",
  completed: false,
  ...over,
});

const visibleNames = () => screen.queryAllByText(/^(Alpha|Bravo|Charlie)$/).map((el) => el.textContent);

describe("Sort & Filter", () => {
  beforeEach(() => {
    localStorage.clear();
    taskView._reset();
    tasks = [
      base({ id: "a", name: "Bravo", priority: "low" }),
      base({ id: "b", name: "Alpha", priority: "urgent", categoryId: "c2" }),
      base({ id: "c", name: "Charlie", priority: "high" }),
    ];
  });

  it("opens, closes on Escape, and applies a sort", async () => {
    render(<TasksPage />);
    expect(visibleNames()).toEqual(["Alpha", "Charlie", "Bravo"]);

    const trigger = screen.getByRole("button", { name: /Sort & Filter/ });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByRole("dialog")).toBeTruthy();

    act(() => taskView.setSort({ key: "name", dir: "desc" }));
    // The list fades out, swaps, and fades back in.
    await waitFor(() => expect(visibleNames()).toEqual(["Charlie", "Bravo", "Alpha"]));
    expect(trigger.textContent).toContain("Name");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("filters by category chip, badges the count, and resets", async () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: /Sort & Filter/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Home", pressed: false }));
    await waitFor(() => expect(visibleNames()).toEqual(["Alpha"]));
    expect(screen.getByLabelText("1 filter active")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    await waitFor(() => expect(visibleNames()).toHaveLength(3));
  });

  it("shows an empty state when nothing matches", async () => {
    taskView.setFilters({ name: "zzz" });
    render(<TasksPage />);
    expect(visibleNames()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(visibleNames()).toHaveLength(3));
  });
});
