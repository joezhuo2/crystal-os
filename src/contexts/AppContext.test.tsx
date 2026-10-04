import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { APP_DATA_KEYS, useTasks, type Task } from "./AppContext";

const task = (id: string, completed = false): Task => ({
  id,
  name: id,
  startDate: "2026-10-04",
  startTime: "09:00",
  endDate: "2026-10-04",
  endTime: "10:00",
  priority: "medium",
  categoryId: "c1",
  completed,
});

function setup(tasks: Task[]) {
  const client = new QueryClient();
  client.setQueryData(APP_DATA_KEYS.tasks, tasks);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const openTasks = (tasks: Task[]) => tasks.filter((t) => !t.completed);

describe("useTasks", () => {
  it("reads the tasks the provider wrote to the cache", () => {
    const { wrapper } = setup([task("a"), task("b")]);
    const { result } = renderHook(() => useTasks(), { wrapper });
    expect(result.current.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("skips the re-render when an edit leaves the selected slice unchanged", async () => {
    const { client, wrapper } = setup([task("a"), task("b", true)]);
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders++;
        return useTasks(openTasks);
      },
      { wrapper },
    );
    const first = result.current;
    const before = renders;

    // Renaming a completed task changes the list but not the open slice.
    await act(async () => {
      client.setQueryData<Task[]>(APP_DATA_KEYS.tasks, (prev) =>
        prev!.map((t) => (t.id === "b" ? { ...t, name: "renamed" } : t)),
      );
      // React Query batches observer notifications onto a timer.
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(renders).toBe(before);
    expect(result.current).toBe(first);

    await act(async () => {
      client.setQueryData<Task[]>(APP_DATA_KEYS.tasks, (prev) =>
        prev!.map((t) => (t.id === "a" ? { ...t, name: "renamed" } : t)),
      );
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(renders).toBe(before + 1);
    expect(result.current[0].name).toBe("renamed");
  });
});
