import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@/contexts/AppContext";
import { appUi } from "@/lib/appUi";
import { recordRecent, setRecentsOwner } from "@/lib/recents";
import { ACTIVE_KEY } from "@/lib/harness/store";
import type { ChatMessage, ChatMeta } from "@/lib/harness/types";

let tasks: Task[] = [];

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ updateTask: vi.fn(), rescheduleTasks: vi.fn() }),
  useTasks: () => tasks,
  useTransactions: () => [],
  useTaskCategories: () => [{ id: "c1", name: "Work", color: "hsl(0 0% 50%)" }],
  useFinancialCategories: () => [],
}));
vi.mock("@/hooks/useVault", () => ({ useVaultNotes: () => ({ data: undefined }) }));
vi.mock("@/hooks/usePortal", () => ({ usePortalOcclusion: () => {} }));
vi.mock("@/lib/platform", async (orig) => ({ ...(await orig<object>()), isDesktop: () => false }));
let calendarEvents: unknown[] = [];
vi.mock("@/hooks/useGoogleCalendar", () => ({
  calendarWasConnected: () => true,
  useCalendarStatus: () => ({ data: { connected: true }, isLoading: false }),
  useCalendarEvents: () => ({ data: { events: calendarEvents }, isLoading: false }),
}));

let nebulaChats: ChatMeta[] = [];
let nebulaMessages: Record<string, ChatMessage[]> = {};
vi.mock("@/hooks/useHarness", () => ({
  useNebulaSearchIndex: () => ({
    chats: nebulaChats,
    projects: [{ id: "p1", name: "crystal-os", path: "C:/code/crystal-os", createdAt: 0 }],
    messagesOf: (id: string) => nebulaMessages[id],
  }),
}));

const { default: CommandPalette } = await import("./CommandPalette");

const task = (over: Partial<Task>): Task => ({
  id: "t",
  name: "Task",
  startDate: "2026-10-09",
  startTime: "09:00",
  endDate: "2026-10-09",
  endTime: "10:00",
  priority: "medium",
  categoryId: "c1",
  completed: false,
  ...over,
});

const onNavigate = vi.fn();
const onClose = vi.fn();
const renderPalette = () => render(<CommandPalette open onClose={onClose} onNavigate={onNavigate} />);

beforeEach(() => {
  // cmdk scrolls the selected item into view and watches its list's size; jsdom has neither.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  localStorage.clear();
  setRecentsOwner("user-1");
  onNavigate.mockClear();
  onClose.mockClear();
  tasks = [];
});

afterEach(() => {
  appUi.reset();
  setRecentsOwner(null);
});

describe("Command palette recents", () => {
  it("lists recent tasks, notes and events when the query is empty, newest first", () => {
    tasks = [task({ id: "t1", name: "Write report" })];
    recordRecent({ kind: "task", id: "t1", title: "Write report" }, 1);
    recordRecent({ kind: "note", id: "Projects/Plan.md", title: "Plan" }, 2);
    recordRecent({ kind: "event", id: "e1", title: "Standup", calendarId: "primary", date: "2026-10-09" }, 3);
    renderPalette();

    const group = screen.getByText("Recent").closest("[cmdk-group]") as HTMLElement;
    const rows = [...group.querySelectorAll("[cmdk-item]")].map((el) => el.querySelector("p")?.textContent);
    expect(rows).toEqual(["Standup", "Plan", "Write report"]);
  });

  it("leaves out deleted tasks and shows a renamed task's current name", () => {
    tasks = [task({ id: "t1", name: "Renamed" })];
    recordRecent({ kind: "task", id: "t1", title: "Old name" });
    recordRecent({ kind: "task", id: "gone", title: "Deleted task" });
    renderPalette();
    expect(screen.getByText("Renamed")).toBeInTheDocument();
    expect(screen.queryByText("Old name")).toBeNull();
    expect(screen.queryByText("Deleted task")).toBeNull();
  });

  it("hides the group once something is typed", () => {
    recordRecent({ kind: "note", id: "Plan.md", title: "Plan" });
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zz" } });
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("reopens a task's edit form, a note in The Archive and an event in The Horizon", () => {
    const t1 = task({ id: "t1", name: "Write report" });
    tasks = [t1];
    recordRecent({ kind: "task", id: "t1", title: "Write report" });
    const { unmount } = renderPalette();
    fireEvent.click(screen.getByText("Write report"));
    expect(appUi.getState().editingTask).toBe(t1);
    expect(appUi.getState().showTaskForm).toBe(true);
    unmount();

    recordRecent({ kind: "note", id: "Plan.md", title: "Plan" });
    const second = renderPalette();
    fireEvent.click(screen.getByText("Plan"));
    expect(appUi.getState().selectedNotePath).toBe("Plan.md");
    expect(onNavigate).toHaveBeenLastCalledWith("archive");
    second.unmount();

    recordRecent({ kind: "event", id: "e1", title: "Standup", calendarId: "work", date: "2026-10-12" });
    renderPalette();
    fireEvent.click(screen.getByText("Standup"));
    expect(appUi.getState().openEvent).toEqual({ id: "e1", calendarId: "work", date: "2026-10-12" });
    expect(onNavigate).toHaveBeenLastCalledWith("calendar");
  });
});

describe("Command palette Settings sections", () => {
  it("are not listed until something is typed", () => {
    renderPalette();
    expect(screen.queryByText("Settings → Notifications")).toBeNull();
  });

  it("match a section by its settings, not only its title", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "do not disturb" } });
    expect(screen.getByText("Settings → Notifications")).toBeInTheDocument();
    expect(screen.queryByText("Settings → Performance")).toBeNull();
  });

  it("leaves out desktop-only sections on the web", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "launch at login" } });
    expect(screen.queryByText("Settings → Startup")).toBeNull();
  });

  it("jump to the section on Settings", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "aurora" } });
    fireEvent.click(screen.getByText("Settings → The Atmosphere"));
    expect(appUi.getState().settingsSection).toBe("atmosphere");
    expect(onNavigate).toHaveBeenCalledWith("settings");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Command palette free-slot finder", () => {
  afterEach(() => {
    vi.useRealTimers();
    calendarEvents = [];
  });

  it("finds the next free block around events and opens the Horizon form on it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 5, 8, 0));
    calendarEvents = [
      {
        id: "e1",
        allDay: false,
        startDate: "2026-10-05",
        startTime: "09:00",
        endDate: "2026-10-05",
        endTime: "12:00",
      },
    ];
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "next 2h" } });
    fireEvent.click(screen.getByText("Next free 2h: Today, 12:00–14:00"));
    expect(appUi.getState().newEventSlot).toEqual({ date: "2026-10-05", start: "12:00", end: "14:00" });
    expect(appUi.getState().showEventForm).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith("calendar");
  });
});

describe("Command palette Nebula chats", () => {
  afterEach(() => {
    nebulaChats = [];
    nebulaMessages = {};
  });

  const chat = (id: string, title: string): ChatMeta => ({
    id, projectId: "p1", title, createdAt: 0, updatedAt: 0, pinned: false, tier: "high", effort: "medium", mode: "auto",
  });

  it("finds a chat by its messages and opens it in The Nebula", () => {
    nebulaChats = [chat("c1", "Refactor"), chat("c2", "Docs")];
    nebulaMessages = { c1: [{ id: "m1", role: "user", blocks: [{ kind: "text", text: "the login loop again" }], createdAt: 0 }] };
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "login" } });
    const group = screen.getByText("Nebula Chats").closest("[cmdk-group]") as HTMLElement;
    expect([...group.querySelectorAll("[cmdk-item] p")].map((p) => p.textContent)).toEqual(["Refactor", "the login loop again"]);
    fireEvent.click(screen.getByText("Refactor"));
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("c1");
    expect(onNavigate).toHaveBeenCalledWith("nebula");
  });

  it("shows the project name when only the title matches", () => {
    nebulaChats = [chat("c1", "Fix login")];
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "login" } });
    expect(screen.getByText("crystal-os")).toBeTruthy();
  });
});
