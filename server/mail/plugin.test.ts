import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Connect } from "vite";
import { createMailMiddleware } from "./plugin";

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mail-plugin-"));
  const middleware = createMailMiddleware(
    { googleClientId: "gid", googleClientSecret: "gsecret", rootDir: dir },
    async (req) => (req.headers.authorization === "Bearer ok" ? { id: "u" } : null),
  );
  server = createServer((req, res) => middleware(req as Connect.IncomingMessage, res, () => res.end()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mail`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

const authed = { headers: { authorization: "Bearer ok" } };

describe("mail middleware", () => {
  it("rejects requests without a user", async () => {
    for (const route of ["/status", "/auth/start?provider=google", "/digest"]) {
      expect((await fetch(`${base}${route}`)).status).toBe(401);
    }
  });

  it("reports status without tokens", async () => {
    const res = await fetch(`${base}/status`, authed);
    expect(await res.json()).toEqual({
      providers: { google: { configured: true }, microsoft: { configured: false } },
      ai: { configured: false, model: "claude-haiku-5-5" },
      accounts: [],
    });
  });

  it("names the missing env vars for an unconfigured provider", async () => {
    const res = await fetch(`${base}/auth/start?provider=microsoft`, authed);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/MICROSOFT_CLIENT_ID/);
  });

  it("rejects a callback with an unknown state", async () => {
    const res = await fetch(`${base}/auth/callback?code=c&state=forged`);
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Invalid or expired OAuth state/);
  });

  it("rejects a callback whose state has expired", async () => {
    const start = await fetch(`${base}/auth/start?provider=google`, authed);
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");
    expect(new URL(url).searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");

    const spy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60 * 1000);
    try {
      const res = await fetch(`${base}/auth/callback?code=c&state=${state}`);
      expect(res.status).toBe(400);
    } finally {
      spy.mockRestore();
    }
  });

  it("saves the AI key and model without ever returning the key", async () => {
    const post = (body: unknown) =>
      fetch(`${base}/ai`, { method: "POST", headers: { ...authed.headers, "content-type": "application/json" }, body: JSON.stringify(body) });

    expect((await post({ apiKey: "sk-ant-x\nEVIL=1" })).status).toBe(400);
    expect((await post({ model: "bad model" })).status).toBe(400);

    const saved = await post({ apiKey: "sk-ant-test-key-123", model: "claude-sonnet-5-5" });
    expect(await saved.json()).toEqual({ configured: true, model: "claude-sonnet-5-5" });
    const status = await (await fetch(`${base}/status`, authed)).text();
    expect(status).toContain('"configured":true');
    expect(status).not.toContain("sk-ant-test-key-123");
    await vi.waitFor(async () => {
      const env = await readFile(path.join(dir, ".env.local"), "utf-8");
      expect(env).toContain("ANTHROPIC_API_KEY=sk-ant-test-key-123");
      expect(env).toContain("MAIL_AI_MODEL=claude-sonnet-5-5");
    });

    const cleared = await post({ apiKey: null, model: "" });
    expect(await cleared.json()).toEqual({ configured: false, model: "claude-haiku-5-5" });
    await vi.waitFor(async () => {
      expect(await readFile(path.join(dir, ".env.local"), "utf-8")).not.toContain("ANTHROPIC_API_KEY");
    });
  });

  it("returns an empty digest with no accounts and 404s unknown accounts", async () => {
    const digest = await (await fetch(`${base}/digest?days=500`, authed)).json();
    expect(digest).toMatchObject({ items: [], errors: [] });
    const del = await fetch(`${base}/accounts/nope`, { method: "DELETE", ...authed });
    expect(del.status).toBe(404);
  });
});
