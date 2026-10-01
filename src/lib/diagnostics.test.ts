import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ENTRIES,
  buildDiagnosticsReport,
  clearDiagnostics,
  createLoggingFetch,
  describeError,
  getDiagnostics,
  installGlobalErrorHandlers,
  recordDiagnostic,
  summariseErrorBody,
} from "./diagnostics";

afterEach(() => {
  clearDiagnostics();
});

/** Lets the background `response.clone().text()` settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("describeError", () => {
  it("names an Error and keeps a few stack frames", () => {
    const err = new TypeError("boom");
    err.stack = "TypeError: boom\n    at a (x.ts:1:1)\n    at b (x.ts:2:2)";
    expect(describeError(err)).toBe("TypeError: boom | at a (x.ts:1:1) | at b (x.ts:2:2)");
  });

  it("handles strings, objects and values JSON cannot encode", () => {
    expect(describeError("plain")).toBe("plain");
    expect(describeError({ code: 1 })).toBe('{"code":1}');
    expect(describeError(undefined)).toBe("undefined");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(describeError(cyclic)).toBe("[object Object]");
  });
});

describe("recordDiagnostic", () => {
  it("keeps only the newest MAX_ENTRIES and truncates long messages", () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) recordDiagnostic("error", `e${i}`);
    const list = getDiagnostics();
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0].message).toBe("e5");

    const long = recordDiagnostic("error", "x".repeat(5_000));
    expect(long.message.length).toBe(1_001);
    expect(long.message.endsWith("…")).toBe(true);
  });
});

describe("summariseErrorBody", () => {
  it("joins PostgREST error fields", () => {
    const body = JSON.stringify({ code: "23505", message: "duplicate key", details: "Key (id)=(1)", hint: null });
    expect(summariseErrorBody(body)).toBe("23505 · duplicate key · Key (id)=(1)");
  });

  it("falls back to the raw text", () => {
    expect(summariseErrorBody("Bad Gateway")).toBe("Bad Gateway");
  });
});

describe("createLoggingFetch", () => {
  const url = "http://localhost:54321/rest/v1/tasks?id=eq.secret-title";

  it("records a failed write with path, status and error, but no query or body", async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(409, { code: "23505", message: "duplicate key" }));
    const res = await createLoggingFetch(base)(url, { method: "post", body: '{"title":"private"}' });
    expect(res.status).toBe(409);
    await settle();

    const [entry] = getDiagnostics();
    expect(entry.kind).toBe("supabase");
    expect(entry.message).toBe("POST /rest/v1/tasks → 409: 23505 · duplicate key");
    expect(entry.message).not.toContain("secret");
    expect(entry.message).not.toContain("private");
  });

  it("leaves the response body readable for the caller", async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(400, { message: "bad" }));
    const res = await createLoggingFetch(base)(url, { method: "PATCH" });
    expect(await res.json()).toEqual({ message: "bad" });
  });

  it("ignores reads, successes and auth", async () => {
    const fail = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const ok = vi.fn().mockResolvedValue(jsonResponse(201, {}));
    await createLoggingFetch(fail)(url);
    await createLoggingFetch(ok)(url, { method: "POST" });
    await createLoggingFetch(fail)("http://localhost:54321/auth/v1/token", { method: "POST" });
    await settle();
    expect(getDiagnostics()).toHaveLength(0);
  });

  it("records a network failure and rethrows it", async () => {
    const base = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(createLoggingFetch(base)(url, { method: "DELETE" })).rejects.toThrow("Failed to fetch");
    expect(getDiagnostics()[0].message).toMatch(/^DELETE \/rest\/v1\/tasks failed: TypeError: Failed to fetch/);
  });

  it("reads the method from a Request", async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(403, { message: "rls" }));
    await createLoggingFetch(base)(new Request(url, { method: "PUT" }));
    await settle();
    expect(getDiagnostics()[0].message).toBe("PUT /rest/v1/tasks → 403: rls");
  });
});

describe("installGlobalErrorHandlers", () => {
  it("records unhandled rejections and uncaught errors until removed", () => {
    const remove = installGlobalErrorHandlers(window);
    expect(installGlobalErrorHandlers(window)).toBe(remove);

    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: "nope" });
    window.dispatchEvent(rejection);
    window.dispatchEvent(new ErrorEvent("error", { message: "kaput", filename: "app.js", lineno: 3, colno: 7 }));

    expect(getDiagnostics().map((e) => [e.kind, e.message])).toEqual([
      ["rejection", "nope"],
      ["error", "kaput (app.js:3:7)"],
    ]);

    remove();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(getDiagnostics()).toHaveLength(2);
  });
});

describe("buildDiagnosticsReport", () => {
  it("lists this session's entries under an app header on the web", async () => {
    recordDiagnostic("supabase", "POST /rest/v1/tasks → 500", new Date("2026-09-30T12:00:00Z"));
    const report = await buildDiagnosticsReport(new Date("2026-09-30T12:05:00Z"));
    expect(report).toMatch(/^Crystal OS \S+ \(web\)/);
    expect(report).toContain("Generated: 2026-09-30T12:05:00.000Z");
    expect(report).toContain("Recent errors (1) from this session (in memory):");
    expect(report).toContain("2026-09-30T12:00:00.000Z [supabase] POST /rest/v1/tasks → 500");
  });

  it("says when there is nothing to report", async () => {
    expect(await buildDiagnosticsReport()).toContain("(none)");
  });
});
