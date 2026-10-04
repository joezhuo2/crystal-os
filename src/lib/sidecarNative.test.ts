import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { ensureSidecar, sidecarLost } = await import("./sidecarNative");

beforeEach(() => {
  invoke.mockReset();
  sidecarLost();
});

describe("ensureSidecar", () => {
  it("asks Rust once for concurrent and later callers", async () => {
    invoke.mockResolvedValue(undefined);
    await Promise.all([ensureSidecar(), ensureSidecar()]);
    await ensureSidecar();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("sidecar_ensure");
  });

  it("tries again after a failed start", async () => {
    invoke.mockRejectedValueOnce("did not start in time").mockResolvedValueOnce(undefined);
    await expect(ensureSidecar()).rejects.toBe("did not start in time");
    await ensureSidecar();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("asks again once a request lost the connection", async () => {
    invoke.mockResolvedValue(undefined);
    await ensureSidecar();
    sidecarLost();
    await ensureSidecar();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
