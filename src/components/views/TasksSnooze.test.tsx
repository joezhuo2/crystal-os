import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";
import { toLocalDateStr, addDays } from "@/lib/utils";

const updateTask = vi.fn();
const completeTask = vi.fn();
const deleteTask = vi.fn();

const taskCategories = [{ id: "c1", name: "Work", color: "hsl(0 0% 50%)" }];

let tasks: Task[] = [];

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ updateTask, completeTask, deleteTask }),
  useTaskCategories: () => taskCategories,
  useTasks: () => tasks,
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

describe("The Engine with snoozed tasks", () => {
  beforeEach(() => {
    updateTask.mockClear();
    tasks = [
      base({ id: "a", name: "Awake" }),
      base({ id: "b", name: "Later", snoozedUntil: addDays(today, 3) }),
      base({ id: "c", name: "Kid", parentId: "b" }),
      base({ id: "d", name: "Dream", someday: true }),
      base({ id: "e", name: "Woke", snoozedUntil: today }),
    ];
  });

  it("keeps snoozed tasks out of the list and counts them in the Snoozed section", () => {
    render(<TasksPage />);
    expect(screen.getByText("Awake")).toBeTruthy();
    expect(screen.getByText("Woke")).toBeTruthy();
    expect(screen.queryByText("Later")).toBeNull();
    expect(screen.queryByText("Dream")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show 2 snoozed" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the section, and Unsnooze clears the snooze", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 snoozed" }));
    expect(screen.getByRole("button", { name: "Hide 2 snoozed" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Later")).toBeTruthy();
    expect(screen.getByText("Dream")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unsnooze Dream" }));
    expect(updateTask).toHaveBeenCalledWith("d", { snoozedUntil: undefined, someday: undefined });
  });

  it("snoozes from the menu on an awake card", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze Awake" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Tomorrow/ }));
    expect(updateTask).toHaveBeenCalledWith("a", { snoozedUntil: addDays(today, 1), someday: undefined });
  });

  it("sends a task to Someday", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Snooze Awake" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Someday/ }));
    expect(updateTask).toHaveBeenCalledWith("a", { snoozedUntil: undefined, someday: true });
  });

  it("drops focus from the clock after a mouse-opened menu closes on Escape", () => {
    render(<TasksPage />);
    const clock = screen.getByRole("button", { name: "Snooze Awake" });
    clock.focus();
    fireEvent.click(clock, { detail: 1 });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).not.toBe(clock);
  });

  it("keeps focus on the clock when the menu was opened from the keyboard", () => {
    render(<TasksPage />);
    const clock = screen.getByRole("button", { name: "Snooze Awake" });
    clock.focus();
    fireEvent.click(clock, { detail: 0 });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(clock);
  });

  it("hides the section when nothing is snoozed", () => {
    tasks = [base({ id: "a", name: "Awake" })];
    render(<TasksPage />);
    expect(screen.queryByRole("button", { name: /snoozed/ })).toBeNull();
  });
});

describe("The Engine with completed tasks", () => {
  beforeEach(() => {
    tasks = [
      base({ id: "a", name: "Open" }),
      base({ id: "b", name: "Done one", completed: true }),
      base({ id: "c", name: "Done two", completed: true }),
      base({ id: "d", name: "Napping", snoozedUntil: addDays(today, 2) }),
    ];
  });

  it("folds completed tasks under a button above the snoozed one", () => {
    render(<TasksPage />);
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.queryByText("Done one")).toBeNull();
    expect(screen.queryByText("Done two")).toBeNull();
    const completed = screen.getByRole("button", { name: "Show 2 completed" });
    const snoozed = screen.getByRole("button", { name: "Show 1 snoozed" });
    expect(completed.compareDocumentPosition(snoozed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the completed tasks when expanded, and folds them again", () => {
    render(<TasksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 completed" }));
    expect(screen.getByText("Done one")).toBeTruthy();
    expect(screen.getByText("Done two")).toBeTruthy();
    expect(screen.queryByText("Napping")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide 2 completed" }));
    expect(screen.getByRole("button", { name: "Show 2 completed" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("has no button when nothing is completed", () => {
    tasks = [base({ id: "a", name: "Open" })];
    render(<TasksPage />);
    expect(screen.queryByRole("button", { name: /completed/ })).toBeNull();
  });
});
