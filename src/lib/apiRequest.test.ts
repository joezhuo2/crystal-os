import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, shouldRetry } from "./apiRequest";
import { apiToken, forgetApiToken } from "./apiToken";

vi.mock("./apiToken", () => ({ apiToken: vi.fn(), forgetApiToken: vi.fn() }));

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.mocked(apiToken).mockResolvedValue("tok-abc");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("apiRequest", () => {
  it("attaches the local API token as a bearer header", async () => {
    const fetchMock = mockFetch({ json: async () => ({ ok: true }) });

    await apiRequest("/api/obsidian/notes");

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-abc");
  });

  it("reads the token on every call rather than caching it", async () => {
    const fetchMock = mockFetch({ json: async () => ({}) });

    await apiRequest("/api/obsidian/notes");
    vi.mocked(apiToken).mockResolvedValue("tok-refreshed");
    await apiRequest("/api/obsidian/notes");

    const [, second] = fetchMock.mock.calls[1];
    expect(new Headers(second.headers).get("Authorization")).toBe("Bearer tok-refreshed");
  });

  it("preserves caller-supplied headers", async () => {
    const fetchMock = mockFetch({ json: async () => ({}) });

    await apiRequest("/api/obsidian/quick-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok-abc");
  });

  it("reports a token that cannot be fetched as a 503 without calling the API", async () => {
    vi.mocked(apiToken).mockRejectedValue(new Error("The local API refused to start a session (403)"));
    const fetchMock = mockFetch({ json: async () => ({}) });

    await expect(apiRequest("/api/obsidian/notes")).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's error message", async () => {
    mockFetch({
      ok: false,
      status: 503,
      json: async () => ({ error: "OBSIDIAN_VAULT_PATH is not set in .env.local" }),
    });

    await expect(apiRequest("/api/obsidian/notes")).rejects.toThrow(
      "OBSIDIAN_VAULT_PATH is not set in .env.local",
    );
  });

  it("falls back to a prefixed status message on a non-JSON error", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(apiRequest("/x", undefined, "Vault API error")).rejects.toThrow(
      "Vault API error: 500",
    );
  });

  it("throws an ApiError carrying the status code", async () => {
    mockFetch({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) });

    await expect(apiRequest("/x")).rejects.toMatchObject({ status: 401 });
    expect(forgetApiToken).toHaveBeenCalled();
  });
});

describe("shouldRetry", () => {
  it("never retries an expired or missing session", () => {
    expect(shouldRetry(0, new ApiError("Unauthorized", 401))).toBe(false);
    expect(shouldRetry(0, new ApiError("Forbidden", 403))).toBe(false);
  });

  it("retries a server error once", () => {
    expect(shouldRetry(0, new ApiError("Boom", 500))).toBe(true);
    expect(shouldRetry(1, new ApiError("Boom", 500))).toBe(false);
  });

  it("retries a non-ApiError once", () => {
    expect(shouldRetry(0, new Error("network"))).toBe(true);
    expect(shouldRetry(1, new Error("network"))).toBe(false);
  });
});
