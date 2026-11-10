import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const taskResults: Array<{ data: unknown[] | null; error: { message: string } | null }> = [];
const taskRow = {
  id: "t1",
  name: "Write report",
  start_date: "2026-10-04",
  start_time: "09:00",
  end_date: "2026-10-04",
  end_time: "10:00",
  priority: "medium",
  category_id: "c1",
  completed: false,
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order", "gt", "limit"]) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          table === "tasks"
            ? taskResults.shift()
            : { data: table.endsWith("categories") ? [{ id: "c1", name: "Work", color: "red" }] : [], error: null },
        );
      return chain;
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { AppProvider, useAppActions, useLoadError, useTasks } from "./AppContext";

function mount() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AppProvider>{children}</AppProvider>
    </QueryClientProvider>
  );
  return renderHook(() => ({ tasks: useTasks(), failed: useLoadError(), actions: useAppActions() }), { wrapper });
}

describe("AppProvider reload after a failed load", () => {
  beforeEach(() => {
    taskResults.length = 0;
    taskResults.push({ data: null, error: { message: "Failed to fetch" } }, { data: [taskRow], error: null });
  });

  it("exposes the error, then loads the tasks when the network comes back", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.tasks).toEqual([]);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.tasks.map((t) => t.id)).toEqual(["t1"]));
    await waitFor(() => expect(result.current.failed).toBe(false));
  });

  it("loads the tasks when the user retries", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.actions.reloadData());
    await waitFor(() => expect(result.current.tasks.map((t) => t.id)).toEqual(["t1"]));
    await waitFor(() => expect(result.current.failed).toBe(false));
  });
});
