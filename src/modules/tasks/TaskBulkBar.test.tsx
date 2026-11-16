import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";
import { taskSelection } from "@/lib/taskSelection";
import { toLocalDateStr } from "@/lib/utils";

const updateTask = vi.fn();
const completeTask = vi.fn();
const deleteTask = vi.fn();
const rescheduleTasks = vi.fn();

const today = toLocalDateStr();
const base = (id: string, name: string, over: Partial<Task> = {}): Task => ({
  id,
  name,
  startDate: today,
  startTime: "23:00",
  endDate: today,
  endTime: "23:59",
  priority: "medium",
  categoryId: "c1",
  completed: false,
  ...over,
});
const tasks = [base("a", "Alpha"), base("b", "Beta"), base("c", "Gamma"), base("d", "Delta")];

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ updateTask, completeTask, deleteTask, rescheduleTasks }),
  useTaskCategories: () => [{ id: "c1", name: "Work", color: "hsl(0 0% 50%)" }],
  useTasks: () => tasks,
  useLoadError: () => false,
}));
vi.mock("./CapacityBar", () => ({ CapacityCard: () => null }));
vi.mock("./PomodoroTimer", () => ({ default: () => null }));
vi.mock("@/components/views/CategoryManager", () => ({ CategoryManagerButton: () => null }));

const { default: TasksPage } = await import("./TasksPage");

const card = (name: string) => screen.getByText(name).closest("[data-task-id]") as HTMLElement;

describe("The Engine's bulk edit", () => {
  beforeEach(() => {
    taskSelection.clear();
    completeTask.mockClear();
    deleteTask.mockClear();
  });

  it("shows no bar until a card is Ctrl-clicked, and a plain click selects nothing", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByText("Alpha"));
    expect(screen.queryByRole("toolbar", { name: "Selected tasks" })).toBeNull();
    fireEvent.click(screen.getByText("Alpha"), { ctrlKey: true });
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(card("Alpha").dataset.selected).toBe("true");
  });

  it("completes a Shift-click range in one call and clears the selection", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByText("Alpha"), { ctrlKey: true });
    fireEvent.click(screen.getByText("Gamma"), { shiftKey: true });
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(completeTask).toHaveBeenCalledTimes(1);
    expect(completeTask.mock.calls[0][0].map((t: Task) => t.id)).toEqual(["a", "b", "c"]);
    expect(screen.queryByRole("toolbar", { name: "Selected tasks" })).toBeNull();
  });

  it("deletes the selected tasks in one call", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByText("Beta"), { ctrlKey: true });
    fireEvent.click(screen.getByText("Delta"), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteTask).toHaveBeenCalledWith(["b", "d"]);
  });
});

describe("The Engine's inline quick edit", () => {
  it("changes the priority from the card's chip without expanding the card", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change the priority of Alpha" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Urgent" }));
    expect(screen.getByRole("button", { name: "Show details of Alpha" }).getAttribute("aria-expanded")).toBe("false");
    expect(updateTask).toHaveBeenCalledWith("a", { priority: "urgent" });
  });
});

describe("The Engine's day views", () => {
  it("shows today's tasks under a week strip", async () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    const strip = await screen.findByRole("group", { name: "Week" });
    expect(strip.querySelectorAll("button")).toHaveLength(7);
    expect(strip.querySelector("[aria-pressed=true]")?.textContent).toContain("4");
    expect(screen.getByText("Alpha")).toBeTruthy();
  });
});
