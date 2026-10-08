import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";
import { toLocalDateStr } from "@/lib/utils";
import { COMPLETION_HOLD_MS } from "@/hooks/useCompletionHold";

const updateTask = vi.fn();
const completeTask = vi.fn();
const deleteTask = vi.fn();

const taskCategories = [{ id: "c1", name: "Work", color: "hsl(0 0% 50%)" }];

let tasks: Task[] = [];
let still = false;

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ updateTask, completeTask, deleteTask }),
  useTaskCategories: () => taskCategories,
  useTasks: () => tasks,
}));
vi.mock("@/lib/appActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/appActivity")>()),
  useAppActivity: () => ({ visible: true, still }),
}));
// The capacity bar and the timer read the calendar and the Pomodoro store; not under test here.
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

describe("checking off a task card", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    completeTask.mockClear();
    updateTask.mockClear();
    still = false;
    tasks = [base({ id: "a", name: "Write report" }), base({ id: "b", name: "Filed", completed: true })];
  });
  afterEach(() => vi.useRealTimers());

  it("shows the check at once and saves after the hold", () => {
    render(<TasksPage />);
    const check = screen.getByRole("button", { name: "Complete Write report" });
    fireEvent.click(check);
    expect(check.getAttribute("aria-pressed")).toBe("true");
    expect(completeTask).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS));
    expect(completeTask).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("a second click during the hold undoes it", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Complete Write report" }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen Write report" }));
    act(() => vi.advanceTimersByTime(COMPLETION_HOLD_MS * 2));
    expect(completeTask).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("saves at once in performance mode", () => {
    still = true;
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Complete Write report" }));
    expect(completeTask).toHaveBeenCalledTimes(1);
  });
});

describe("Board cards", () => {
  beforeEach(() => {
    still = true;
    tasks = [base({ id: "a", name: "Write report", notes: "Draft first", estimateMinutes: 30 })];
  });

  it("show the notes line and a details toggle, with the actions along the foot", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: /Board/ }));
    expect(screen.getByText("Draft first")).toBeTruthy();
    const details = screen.getByRole("button", { name: "Show details of Write report" });
    const edit = screen.getByRole("button", { name: "Edit Write report" });
    // The actions come after the details toggle: at the foot of the card.
    expect(details.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(edit.parentElement?.className).toContain("border-t");
  });
});
