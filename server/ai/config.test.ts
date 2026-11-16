import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAiConfig } from "./config";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ai-config-"));
});

afterAll(() => rm(dir, { recursive: true, force: true }));

describe("ai config", () => {
  it("falls back to the defaults with an empty env", () => {
    expect(createAiConfig({}).status()).toEqual({
      claude: { configured: false, model: "claude-sonnet-5-5" },
      nim: { configured: false, baseUrl: "https://integrate.api.nvidia.com/v1", model: "moonshotai/kimi-k3" },
      omniroute: { configured: true, hasKey: false, baseUrl: "http://localhost:20128/v1", model: "auto/coding" },
    });
  });

  it("seeds keys, URLs and models from env", () => {
    const ai = createAiConfig({
      ANTHROPIC_API_KEY: " sk-ant-1234567890 ",
      AI_CLAUDE_MODEL: "claude-opus-5-5",
      NVIDIA_API_KEY: "nvapi-1234567890",
      NVIDIA_BASE_URL: "https://nim.example/v1/",
      OMNIROUTE_MODEL: "auto/fast",
    });
    expect(ai.get("claude")).toMatchObject({ apiKey: "sk-ant-1234567890", model: "claude-opus-5-5" });
    expect(ai.status().nim).toEqual({ configured: true, baseUrl: "https://nim.example/v1", model: "moonshotai/kimi-k3" });
    expect(ai.status().omniroute.model).toBe("auto/fast");
    expect(ai.configured("claude")).toBe(true);
    expect(createAiConfig({}).configured("claude", "override-key")).toBe(true);
  });

  it.each([
    [{ claude: { apiKey: "sk-ant-x\nEVIL=1" } }],
    [{ nim: { baseUrl: "ftp://nim.example" } }],
    [{ nim: { baseUrl: "https://nim.example\nEVIL=1" } }],
    [{ nim: { model: "ok/model" }, omniroute: { model: "bad model" } }],
    [{ claude: "key" }],
  ])("rejects %j without applying anything", (patch) => {
    const ai = createAiConfig({});
    expect(() => ai.update(patch)).toThrow();
    expect(ai.status()).toEqual(createAiConfig({}).status());
  });

  it("applies a partial update, resets blanks to defaults and persists to .env.local", async () => {
    const ai = createAiConfig({}, dir);
    await ai.update({
      claude: { apiKey: "sk-ant-test-key-123", model: "claude-haiku-5-5" },
      omniroute: { baseUrl: "http://127.0.0.1:9000/v1/", model: "auto/coding" },
    });
    expect(ai.status().claude).toEqual({ configured: true, model: "claude-haiku-5-5" });
    expect(ai.status().omniroute.baseUrl).toBe("http://127.0.0.1:9000/v1");
    let env = await readFile(path.join(dir, ".env.local"), "utf-8");
    expect(env).toContain("ANTHROPIC_API_KEY=sk-ant-test-key-123");
    expect(env).toContain("OMNIROUTE_BASE_URL=http://127.0.0.1:9000/v1");

    await ai.update({ claude: { apiKey: null, model: "" }, omniroute: { baseUrl: "" } });
    expect(ai.status().claude).toEqual({ configured: false, model: "claude-sonnet-5-5" });
    expect(ai.status().omniroute.baseUrl).toBe("http://localhost:20128/v1");
    env = await readFile(path.join(dir, ".env.local"), "utf-8");
    expect(env).not.toContain("ANTHROPIC_API_KEY");
    expect(env).not.toContain("OMNIROUTE_BASE_URL");
  });
});
