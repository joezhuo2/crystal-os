import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiHandler } from "./standalone";

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer(
    createApiHandler({
      env: { OBSIDIAN_VAULT_PATH: "/nonexistent" },
      // Rejects everyone; no Supabase call is ever made.
      requireUser: async () => null,
      rootDir: process.cwd(),
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** node:http rather than fetch, so the Origin header is sent verbatim. */
function call(method: string, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      });
      req.on("error", reject);
      req.end();
    },
  );
}

describe("createApiHandler", () => {
  it("answers the health check", async () => {
    const res = await call("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it("returns JSON 404 for routes no middleware claims", async () => {
    const res = await call("GET", "/nope");
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/Unknown route/);
  });

  it("routes /api/obsidian through the auth gate", async () => {
    const res = await call("GET", "/api/obsidian/notes");
    expect(res.status).toBe(401);
  });

  it("routes /api/calendar through the auth gate", async () => {
    const res = await call("GET", "/api/calendar/status");
    expect(res.status).toBe(401);
  });

  it("allows preflight from the desktop webview origin", async () => {
    const res = await call("OPTIONS", "/api/obsidian/notes", {
      Origin: "http://tauri.localhost",
    });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://tauri.localhost");
    expect(String(res.headers["access-control-allow-headers"])).toMatch(/Authorization/);
  });

  it("refuses cross-origin access from any other origin", async () => {
    const preflight = await call("OPTIONS", "/api/obsidian/notes", {
      Origin: "https://evil.example",
    });
    expect(preflight.status).toBe(403);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();

    const get = await call("GET", "/api/health", { Origin: "https://evil.example" });
    expect(get.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
