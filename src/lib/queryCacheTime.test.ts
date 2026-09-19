import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { retimeCachedQueries } from "./queryCacheTime";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("retimeCachedQueries", () => {
  it("evicts data cached before the switch on the new, shorter time", () => {
    const client = new QueryClient();
    client.setQueryData(["old"], 1);
    expect(client.getQueryCache().find({ queryKey: ["old"] })?.gcTime).toBe(5 * 60_000);

    retimeCachedQueries(client, 60_000);
    vi.advanceTimersByTime(59_000);
    expect(client.getQueryData(["old"])).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(client.getQueryData(["old"])).toBeUndefined();
  });

  it("keeps queries a view is using, and applies the new time once it stops", () => {
    const client = new QueryClient();
    client.setQueryData(["live"], 1);
    const observer = new QueryObserver(client, { queryKey: ["live"], queryFn: () => 1, enabled: false });
    const unsubscribe = observer.subscribe(() => undefined);

    retimeCachedQueries(client, 60_000);
    vi.advanceTimersByTime(5 * 60_000);
    expect(client.getQueryData(["live"])).toBe(1);

    unsubscribe();
    vi.advanceTimersByTime(60_000);
    expect(client.getQueryData(["live"])).toBeUndefined();
  });

  it("lengthens the window when switched back", () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 60_000 } } });
    client.setQueryData(["old"], 1);

    retimeCachedQueries(client, 5 * 60_000);
    vi.advanceTimersByTime(2 * 60_000);
    expect(client.getQueryData(["old"])).toBe(1);
  });
});
