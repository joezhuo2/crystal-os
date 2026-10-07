import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";
import { pomodoro } from "@/lib/pomodoro";
import { taskDrag } from "@/lib/subtasks";
import { toLocalDateStr } from "@/lib/utils";

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

const tasks: Task[] = [
  base({ id: "a", name: "Write report" }),
  base({ id: "b", name: "Review PR" }),
  base({ id: "done", name: "Finished", completed: true }),
];

vi.mock("@/contexts/AppContext", () => ({ useTasks: () => tasks }));

// jsdom has no layout; the combobox scrolls its active row into view.
Element.prototype.scrollIntoView = () => {};

const { default: PomodoroTask } = await import("./PomodoroTask");

afterEach(() => {
  pomodoro._reset();
  taskDrag.id = null;
});

describe("PomodoroTask", () => {
  it("shows No task until one is linked", () => {
    render(<PomodoroTask />);
    expect(screen.getByRole("combobox", { name: "Focus task" }).textContent).toContain("No task");
  });

  it("links the picked task and offers only open ones", () => {
    render(<PomodoroTask />);
    fireEvent.click(screen.getByRole("combobox", { name: "Focus task" }));
    expect(screen.queryByRole("option", { name: /Finished/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Review PR/ }));
    expect(pomodoro.getState().task).toEqual({ id: "b", title: "Review PR" });
    expect(screen.getByRole("combobox", { name: "Focus task" }).textContent).toContain("Review PR");
  });

  it("unlinks with No task", () => {
    pomodoro.setTask({ id: "a", title: "Write report" });
    render(<PomodoroTask />);
    fireEvent.click(screen.getByRole("combobox", { name: "Focus task" }));
    fireEvent.click(screen.getByRole("option", { name: /No task/ }));
    expect(pomodoro.getState().task).toBeNull();
  });

  it("links a task card dropped on it", () => {
    render(<PomodoroTask />);
    const zone = screen.getByTestId("pomodoro-task-drop");
    taskDrag.id = "a";
    fireEvent.dragOver(zone, { dataTransfer: { dropEffect: "none" } });
    expect(zone.getAttribute("data-drop")).toBe("true");
    fireEvent.drop(zone, { dataTransfer: { getData: () => "a" } });
    expect(pomodoro.getState().task).toEqual({ id: "a", title: "Write report" });
    expect(zone.getAttribute("data-drop")).toBe("false");
  });

  it("ignores a dropped completed task", () => {
    render(<PomodoroTask />);
    const zone = screen.getByTestId("pomodoro-task-drop");
    taskDrag.id = "done";
    fireEvent.dragOver(zone);
    expect(zone.getAttribute("data-drop")).toBe("false");
    fireEvent.drop(zone);
    expect(pomodoro.getState().task).toBeNull();
  });
});
