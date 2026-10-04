import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureSidecar = vi.fn();
const sidecarLost = vi.fn();
vi.mock("./sidecarNative", () => ({ ensureSidecar, sidecarLost }));
vi.mock("./platform", () => ({
  usesSidecar: () => true,
  apiUrl: (path: string) => `http://127.0.0.1:8787${path}`,
}));

const { ApiError, apiRequest } = await import("./apiRequest");
const { supabase } = await import("./supabase");

beforeEach(() => {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: null }, error: null } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("apiRequest in the packaged desktop app", () => {
  it("starts the sidecar before the first request", async () => {
    const order: string[] = [];
    ensureSidecar.mockImplementation(async () => void order.push("ensure"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        order.push("fetch");
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );
    await apiRequest("/api/calendar/status");
    expect(order).toEqual(["ensure", "fetch"]);
  });

  it("reports a sidecar that will not start as a 503", async () => {
    ensureSidecar.mockRejectedValue("The local API (crystal-api) did not start in time.");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = (await apiRequest("/api/calendar/status").catch((e) => e)) as InstanceType<typeof ApiError>;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/did not start/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forgets the sidecar when a request cannot connect", async () => {
    ensureSidecar.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("/api/calendar/status")).rejects.toThrow("Failed to fetch");
    expect(sidecarLost).toHaveBeenCalledTimes(1);
  });
});
