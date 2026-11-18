import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Command, CommandList } from "@/components/ui/command";
import { pomodoro } from "@/lib/pomodoro";

const LINK = "https://github.com/acme/crystal-os/pull/7";
const addTask = vi.fn(async () => "new-id");
let tasks: { id: string; name: string; completed: boolean; notes?: string }[] = [];
const openProjectChat = vi.fn();

vi.mock("@/contexts/AppContext", () => ({
  useAppActions: () => ({ addTask }),
  useTasks: () => tasks,
  useTaskCategories: () => [{ id: "c1", name: "Work" }],
}));
vi.mock("@/hooks/useHarness", () => ({
  useNebulaSearchIndex: () => ({ projects: [{ id: "p1", name: "Crystal", path: "C:/code/crystal-os" }] }),
}));
vi.mock("@/lib/harness/store", () => ({ harness: { openProjectChat: (id: string) => openProjectChat(id) } }));
vi.mock("@/lib/setup", () => ({
  invoke: async () => ({
    reviews: [{ number: 7, title: "Add the arcade", url: LINK, repository: { nameWithOwner: "acme/crystal-os" }, updatedAt: "2026-11-10T00:00:00Z" }],
    issues: [],
  }),
}));

const { GitHubCommands } = await import("./GitHubCommands");

const onNavigate = vi.fn();
const onClose = vi.fn();

function renderList(list: "reviews" | "issues" = "reviews") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Command>
        <CommandList>
          <GitHubCommands list={list} itemClass="" tasksOn nebulaOn onNavigate={onNavigate} onClose={onClose} onBack={vi.fn()} onStep={vi.fn()} />
        </CommandList>
      </Command>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  tasks = [];
  addTask.mockClear();
  onNavigate.mockClear();
  onClose.mockClear();
  openProjectChat.mockClear();
  pomodoro._reset();
});

describe("GitHubCommands", () => {
  it("says so when nothing is assigned", async () => {
    renderList("issues");
    expect(await screen.findByText("No open issues are assigned to you.")).toBeTruthy();
  });

  it("creates a task that carries the pull request link", async () => {
    renderList();
    fireEvent.click(await screen.findByText("Add the arcade"));
    fireEvent.click(screen.getByText("Create a linked task"));
    await waitFor(() => expect(addTask).toHaveBeenCalledWith(expect.objectContaining({ name: "Review acme/crystal-os#7: Add the arcade", notes: LINK, categoryId: "c1" })));
    expect(onClose).toHaveBeenCalled();
  });

  it("starts a Pomodoro on the task already linked, without adding another", async () => {
    tasks = [{ id: "t1", name: "Review it", completed: false, notes: LINK }];
    renderList();
    fireEvent.click(await screen.findByText("Add the arcade"));
    expect(screen.getByText("Open the linked task")).toBeTruthy();
    fireEvent.click(screen.getByText("Start a Pomodoro"));
    await waitFor(() => expect(pomodoro.getState().task).toEqual({ id: "t1", title: "Review it" }));
    expect(pomodoro.getState().running).toBe(true);
    expect(addTask).not.toHaveBeenCalled();
  });

  it("opens the Nebula project whose folder is named after the repository", async () => {
    renderList();
    fireEvent.click(await screen.findByText("Add the arcade"));
    fireEvent.click(screen.getByText("Open Crystal in The Nebula"));
    expect(openProjectChat).toHaveBeenCalledWith("p1");
    expect(onNavigate).toHaveBeenCalledWith("nebula");
  });
});
