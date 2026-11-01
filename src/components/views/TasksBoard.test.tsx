import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";
import { toLocalDateStr } from "@/lib/utils";
import { taskDrag } from "@/lib/subtasks";

const updateTask = vi.fn();
const completeTask = vi.fn();
const rescheduleTasks = vi.fn();

const taskCategories = [
  { id: "c1", name: "Work", color: "hsl(0 0% 50%)" },
  { id: "c2", name: "Home", color: "hsl(200 50% 50%)" },
];

let tasks: Task[] = [];

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ updateTask, completeTask, deleteTask: vi.fn(), rescheduleTasks }),
  useTaskCategories: () => taskCategories,
  useTasks: () => tasks,
}));
vi.mock("@/lib/appActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/appActivity")>()),
  useAppActivity: () => ({ visible: true, still: true }),
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

const openBoard = () => {
  const view = render(<TasksPage />);
  fireEvent.click(screen.getByRole("button", { name: /Board/ }));
  return view;
};
const cell = (container: HTMLElement, key: string) => container.querySelector(`[data-cell="${key}"]`) as HTMLElement;
const dataTransfer = (id: string) => ({ dropEffect: "", getData: () => id });

describe("Board priority rows", () => {
  beforeEach(() => {
    updateTask.mockClear();
    completeTask.mockClear();
    rescheduleTasks.mockClear();
    taskDrag.id = null;
    tasks = [
      base({ id: "u", name: "Ship it", priority: "urgent" }),
      ...[1, 2, 3, 4, 5].map((n) => base({ id: `m${n}`, name: `Chore ${n}` })),
    ];
  });

  it("puts each card in its priority row and shows the first three of a cell", () => {
    const { container } = openBoard();
    expect(cell(container, "c1:urgent").textContent).toContain("Ship it");
    const medium = cell(container, "c1:medium");
    expect(medium.textContent).toContain("Chore 3");
    expect(medium.textContent).not.toContain("Chore 4");

    fireEvent.click(screen.getByRole("button", { name: "Show 2 more Medium tasks in Work" }));
    expect(medium.textContent).toContain("Chore 5");
    fireEvent.click(screen.getByRole("button", { name: "Show fewer Medium tasks in Work" }));
    expect(medium.textContent).not.toContain("Chore 4");
  });

  it("outlines the target cell only, and a drop sets category and priority", () => {
    const { container } = openBoard();
    taskDrag.id = "m1";
    const target = cell(container, "c2:high");
    fireEvent.dragOver(target, { dataTransfer: dataTransfer("m1") });
    expect(target.dataset.dropTarget).toBe("true");
    expect(container.querySelectorAll("[data-drop-target]")).toHaveLength(1);

    fireEvent.drop(target, { dataTransfer: dataTransfer("m1") });
    expect(rescheduleTasks).toHaveBeenCalledWith(
      [{ id: "m1", updates: { categoryId: "c2", priority: "high", parentId: undefined } }],
      "Chore 1 moved to Home · High",
    );
    expect(container.querySelectorAll("[data-drop-target]")).toHaveLength(0);
  });

  it("does not outline the card's own cell", () => {
    const { container } = openBoard();
    taskDrag.id = "m1";
    fireEvent.dragOver(cell(container, "c1:medium"), { dataTransfer: dataTransfer("m1") });
    expect(container.querySelectorAll("[data-drop-target]")).toHaveLength(0);
  });
});
