import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";

const addTask = vi.fn();
const updateTask = vi.fn();

const taskCategories = [{ id: "c1", name: "Work", color: "hsl(0 0% 50%)" }];

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ addTask, updateTask }),
  useTaskCategories: () => taskCategories,
}));

// jsdom has no layout, so ThemedSelect's keep-the-active-row-visible call needs a stub.
Element.prototype.scrollIntoView = () => {};

const { TaskForm } = await import("./TasksPage");

function pickRepeat(label: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Repeat" }));
  fireEvent.click(screen.getByRole("option", { name: label }));
}

const editing: Task = {
  id: "t1",
  name: "Gym",
  startDate: "2026-09-01",
  startTime: "09:00",
  endDate: "2026-09-01",
  endTime: "10:00",
  priority: "medium",
  categoryId: "c1",
  completed: false,
};

describe("TaskForm repeats", () => {
  beforeEach(() => {
    addTask.mockClear();
    updateTask.mockClear();
  });

  it("saves a weekly repeat on the chosen weekdays", () => {
    render(<TaskForm onClose={() => {}} editingTask={editing} />);
    pickRepeat("Weekly on…");
    // 2026-09-01 is a Tuesday, so it starts selected; swap it for Mon/Wed/Fri.
    fireEvent.click(screen.getByRole("button", { name: "Tue" }));
    for (const day of ["Mon", "Wed", "Fri"]) fireEvent.click(screen.getByRole("button", { name: day }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ repeat: { kind: "weekly", weekdays: [1, 3, 5] } }));
  });

  it("saves an after-completion repeat with its day count", () => {
    render(<TaskForm onClose={() => {}} editingTask={editing} />);
    pickRepeat("N days after done");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Days" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ repeat: { kind: "after", every: 4 } }));
  });

  it("clears the repeat when set back to does not repeat", () => {
    render(<TaskForm onClose={() => {}} editingTask={{ ...editing, repeat: { kind: "monthly" } }} />);
    expect(screen.getByText(/On the 1st of each month/)).toBeInTheDocument();
    pickRepeat("Does not repeat");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    const updates = updateTask.mock.calls[0][1];
    expect("repeat" in updates).toBe(true);
    expect(updates.repeat).toBeUndefined();
  });

  it("does not repeat a weekly task with no weekdays picked", () => {
    render(<TaskForm onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Task name..."), { target: { value: "Chore" } });
    pickRepeat("Weekly on…");
    const selected = screen.getAllByRole("button", { pressed: true });
    for (const b of selected) fireEvent.click(b);
    expect(screen.getByText(/Pick at least one day/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));
    expect(addTask).toHaveBeenCalledWith(expect.objectContaining({ repeat: undefined }));
  });
});

describe("TaskForm estimates", () => {
  beforeEach(() => {
    addTask.mockClear();
    updateTask.mockClear();
  });

  it("saves a quick-pick estimate on a new task", () => {
    render(<TaskForm onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Task name..."), { target: { value: "Write report" } });
    fireEvent.click(screen.getByRole("button", { name: "1h" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));
    expect(addTask).toHaveBeenCalledWith(expect.objectContaining({ name: "Write report", estimateMinutes: 60 }));
  });

  it("takes a custom number of minutes", () => {
    render(<TaskForm onClose={() => {}} editingTask={editing} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Estimate in minutes" }), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(updateTask).toHaveBeenCalledWith("t1", expect.objectContaining({ estimateMinutes: 50 }));
  });

  it("clears an estimate when its lit chip is tapped again", () => {
    render(<TaskForm onClose={() => {}} editingTask={{ ...editing, estimateMinutes: 30 }} />);
    const chip = screen.getByRole("button", { name: "30m" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    const updates = updateTask.mock.calls[0][1];
    expect("estimateMinutes" in updates).toBe(true);
    expect(updates.estimateMinutes).toBeUndefined();
  });
});
