import { describe, expect, it, vi } from "vitest";
import { candidates, DOWN_MS, isRouteFailure, modelOptionValue, Router, type ProbeResult } from "./modelRouter";
import type { NebulaConfig } from "./types";

const config: NebulaConfig = {
  omnirouteBaseUrl: "http://localhost:20128/v1",
  omnirouteModel: "auto/coding",
  nimBaseUrl: "https://integrate.api.nvidia.com/v1",
  nimModels: { kimi: "moonshotai/kimi-k3", deepseek: "deepseek-ai/deepseek-v4-flash-0731", nemotron: "nvidia/nemotron-3-ultra-550b-a55b" },
  claudeModel: "opus",
  projectsRoot: "C:/Projects",
  disabledMcp: [],
};

const ok = (extra: Partial<ProbeResult> = {}): ProbeResult => ({ ok: true, status: 200, error: null, missingModels: [], hasKey: true, ...extra });

describe("candidates", () => {
  it("orders medium as the three NIM slots, then OmniRoute", () => {
    expect(candidates("medium", config).map((c) => c.label)).toEqual([
      "moonshotai/kimi-k3",
      "deepseek-ai/deepseek-v4-flash-0731",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "OmniRoute auto/coding",
    ]);
    expect(candidates("low", config).map((c) => c.model)).toEqual(["auto/coding"]);
    expect(candidates("high", config)).toEqual([]);
  });

  it("labels slots with the configured model ids, not the default names", () => {
    const glm = { ...config, nimModels: { ...config.nimModels, kimi: "z-ai/glm-5.3", deepseek: "z-ai/glm-5.3-flash" } };
    const labels = candidates("medium", glm).map((c) => c.label);
    expect(labels.slice(0, 2)).toEqual(["z-ai/glm-5.3", "z-ai/glm-5.3-flash"]);
    expect(labels.join(" ")).not.toMatch(/Kimi|DeepSeek V4/);
  });

  it("encodes the ACP model option as a provider/model tuple", () => {
    expect(modelOptionValue(candidates("low", config)[0])).toBe('["omniroute","auto/coding"]');
  });
});

describe("Router", () => {
  it("skips NIM without a key and falls through to OmniRoute", async () => {
    const probe = vi.fn(async (p: "nvidia" | "omniroute") => (p === "nvidia" ? ok({ hasKey: false }) : ok({ hasKey: false })));
    const router = new Router(probe);
    const { usable, skipped } = await router.available("medium", config);
    expect(usable.map((c) => c.label)).toEqual(["OmniRoute auto/coding"]);
    expect(skipped).toHaveLength(3);
    expect(skipped[0].reason).toBe("no NVIDIA API key");
    // Probes are cached: one per provider.
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("skips models the endpoint does not list", async () => {
    const router = new Router(async (p) => (p === "nvidia" ? ok({ missingModels: ["moonshotai/kimi-k3"] }) : ok()));
    const { usable } = await router.available("medium", config);
    expect(usable[0].label).toBe("deepseek-ai/deepseek-v4-flash-0731");
  });

  it("marks a failed candidate down for a minute", async () => {
    let now = 1_000;
    const router = new Router(async () => ok(), () => now);
    const [kimi] = candidates("medium", config);
    router.markDown(kimi);
    expect((await router.available("medium", config)).usable[0].label).toBe("deepseek-ai/deepseek-v4-flash-0731");
    now += DOWN_MS + 1;
    expect((await router.available("medium", config)).usable[0].label).toBe("moonshotai/kimi-k3");
  });

  it("returns the candidates after a failed one", async () => {
    const router = new Router(async () => ok());
    const [, deepseek] = candidates("medium", config);
    const { usable } = await router.available("medium", config, deepseek);
    expect(usable.map((c) => c.label)).toEqual(["nvidia/nemotron-3-ultra-550b-a55b", "OmniRoute auto/coding"]);
  });

  it("still offers the last candidate when nothing looks usable", async () => {
    const router = new Router(async () => ({ ok: false, status: null, error: "connection refused", missingModels: [], hasKey: false }));
    const { usable } = await router.available("low", config);
    expect(usable.map((c) => c.label)).toEqual(["OmniRoute auto/coding"]);
  });

  it("treats a throwing probe as unavailable", async () => {
    const router = new Router(async () => {
      throw new Error("ipc down");
    });
    const { skipped } = await router.available("medium", config);
    expect(skipped.length).toBeGreaterThan(0);
  });
});

describe("isRouteFailure", () => {
  it("recognises provider and network failures", () => {
    for (const m of ["429 Too Many Requests", "MISSING_CREDENTIAL for nvidia-nim", "connect ECONNREFUSED 127.0.0.1:20128", "Request timed out", "503 Service Unavailable"]) {
      expect(isRouteFailure(m)).toBe(true);
    }
    expect(isRouteFailure("Invalid params: sessionId")).toBe(false);
  });
});
