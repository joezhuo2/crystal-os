import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Connect } from "vite";
import { createAiConfig } from "./config";
import { createAiMiddleware } from "./plugin";

let server: Server;
let base: string;
let dir: string;
const realFetch = fetch;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ai-plugin-"));
  const middleware = createAiMiddleware(
    createAiConfig({ ANTHROPIC_API_KEY: "sk-ant-secret-key-1" }, dir),
    async (req) => (req.headers.authorization === "Bearer ok" ? { id: "u" } : null),
  );
  server = createServer((req, res) => middleware(req as Connect.IncomingMessage, res, () => res.end("next")));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => vi.unstubAllGlobals());

const headers = { authorization: "Bearer ok", "content-type": "application/json" };
const post = (route: string, body: unknown) => realFetch(`${base}${route}`, { method: "POST", headers, body: JSON.stringify(body) });

describe("ai middleware", () => {
  it("rejects requests without a user", async () => {
    for (const route of ["/status", "/config", "/chat"]) expect((await realFetch(`${base}${route}`)).status).toBe(401);
  });

  it("leaves other routes alone", async () => {
    expect(await (await realFetch(`${base}x/status`)).text()).toBe("next");
  });

  it("reports status and saves config without ever returning a key", async () => {
    const status = await (await realFetch(`${base}/status`, { headers })).text();
    expect(JSON.parse(status).claude).toEqual({ configured: true, model: "claude-sonnet-5-5" });
    expect(status).not.toContain("sk-ant-secret-key-1");

    expect((await post("/config", { nim: { baseUrl: "javascript:alert(1)" } })).status).toBe(400);
    const saved = await (await post("/config", { nim: { apiKey: "nvapi-secret-key-2", model: "moonshotai/kimi-k3" } })).text();
    expect(JSON.parse(saved).nim.configured).toBe(true);
    expect(saved).not.toContain("nvapi-secret-key-2");
  });

  it("forwards a chat and returns the text", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: "pong" }] })));
    vi.stubGlobal("fetch", upstream);
    const res = await post("/chat", { provider: "claude", messages: [{ role: "user", content: "ping" }] });
    expect(await res.json()).toEqual({ text: "pong" });
    expect(upstream.mock.calls[0][1].headers["x-api-key"]).toBe("sk-ant-secret-key-1");
  });
});
