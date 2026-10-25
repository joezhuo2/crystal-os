import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let reply: ((ok: boolean) => void) | null = null;
vi.mock("@/lib/apiRequest", () => ({
  shouldRetry: () => false,
  apiRequest: () =>
    new Promise((resolve, reject) => {
      reply = (ok) => (ok ? resolve({ event: {} }) : reject(new Error("offline")));
    }),
}));

const { useUpdateEvent } = await import("./useGoogleCalendar");
import type { CalendarEvent, EventInput } from "./useGoogleCalendar";

const event = { id: "e1", summary: "Standup", allDay: false, startDate: "2026-09-30", startTime: "09:00", endDate: "2026-09-30", endTime: "09:30" } as CalendarEvent;
const input: EventInput = { summary: "Standup", allDay: false, startDate: "2026-10-01", startTime: "10:10", endDate: "2026-10-01", endTime: "10:40" };
const key = ["gcal", "events", "primary"];

function setup() {
  reply = null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(key, { events: [event] });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useUpdateEvent(), { wrapper });
  const cached = () => client.getQueryData<{ events: CalendarEvent[] }>(key)?.events[0];
  return { result, cached, invalidate };
}

describe("useUpdateEvent", () => {
  it("moves a single occurrence in the cache before the save answers", async () => {
    const { result, cached } = setup();
    act(() => result.current.mutate({ calendarId: "primary", eventId: "e1", scope: "single", input }));
    await waitFor(() => expect(cached()).toMatchObject({ startDate: "2026-10-01", startTime: "10:10", endTime: "10:40" }));
    await waitFor(() => expect(reply).not.toBeNull());
    await act(async () => reply?.(true));
  });

  it("leaves a whole series to the refetch, and refetches after a failed save", async () => {
    const { result, cached, invalidate } = setup();
    act(() => result.current.mutate({ calendarId: "primary", eventId: "e1", scope: "all", input }));
    await waitFor(() => expect(reply).not.toBeNull());
    expect(cached()?.startTime).toBe("09:00");
    await act(async () => reply?.(false));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["gcal", "events"] }));
  });
});
