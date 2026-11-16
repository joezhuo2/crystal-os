import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ENTRIES,
  buildDiagnosticsReport,
  clearDiagnostics,
  describeError,
  getDiagnostics,
  installGlobalErrorHandlers,
  recordDiagnostic,
} from "./diagnostics";

afterEach(() => {
  clearDiagnostics();
});

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
    recordDiagnostic("data", "insert tasks → 500", new Date("2026-09-30T12:00:00Z"));
    const report = await buildDiagnosticsReport(new Date("2026-09-30T12:05:00Z"));
    expect(report).toMatch(/^Crystal OS \S+ \(web\)/);
    expect(report).toContain("Generated: 2026-09-30T12:05:00.000Z");
    expect(report).toContain("Recent errors (1) from this session (in memory):");
    expect(report).toContain("2026-09-30T12:00:00.000Z [data] insert tasks → 500");
  });

  it("says when there is nothing to report", async () => {
    expect(await buildDiagnosticsReport()).toContain("(none)");
  });
});
