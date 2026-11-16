import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Connect } from "vite";
import { createSessionMiddleware } from "../auth/localSession";
import { createLocalVerifier, createRequireUser } from "../auth/requireUser";
import { importFromSupabase } from "./import";
import { createDataMiddleware } from "./plugin";

let server: Server;
let origin: string;
let dir: string;
const importData = vi.fn<typeof importFromSupabase>();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "data-plugin-"));
  const data = createDataMiddleware(
    { rootDir: dir, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" },
    createRequireUser(createLocalVerifier("ok")),
    { importData },
  );
  const session = createSessionMiddleware("ok");
  server = createServer((req, res) =>
    session(req as Connect.IncomingMessage, res, () => data(req as Connect.IncomingMessage, res, () => res.end())),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

const call = (route: string, body?: unknown, token = "ok") =>
  fetch(`${origin}/api/data${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("local session", () => {
  it("hands the token to a same-origin page only", async () => {
    expect(await (await fetch(`${origin}/api/session`)).json()).toEqual({ token: "ok" });
    expect((await fetch(`${origin}/api/session`, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${origin}/api/session`, { headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await fetch(`${origin}/api/session`, { method: "POST" })).status).toBe(403);
  });
});

describe("data API", () => {
  it("refuses a missing or wrong token", async () => {
    expect((await call("/status", undefined, "nope")).status).toBe(401);
    expect((await fetch(`${origin}/api/data/status`)).status).toBe(401);
  });

  it("asks for an import until one is done", async () => {
    expect(await (await call("/status")).json()).toEqual({ needsImport: true });

    importData.mockRejectedValueOnce(new Error("boom"));
    expect((await call("/import", { email: "a@b.c", password: "pw" })).status).toBe(500);
    expect((await call("/import", {})).status).toBe(400);
    expect(await (await call("/status")).json()).toEqual({ needsImport: true });

    importData.mockResolvedValueOnce({ tasks: [{ id: "t1", name: "Imported" }], habits: [] });
    const res = await call("/import", { refreshToken: "rt" });
    expect(await res.json()).toEqual({ imported: 1 });
    expect(importData).toHaveBeenLastCalledWith({ url: "https://x.supabase.co", anonKey: "anon", credentials: { refreshToken: "rt" } });
    expect(await (await call("/status")).json()).toEqual({ needsImport: false });
  });

  it("stores rows as JSON files and reads them back", async () => {
    expect((await call("/query", { table: "tasks", op: "insert", rows: [{ id: "t2", name: "Local" }] })).status).toBe(200);
    const dup = await call("/query", { table: "tasks", op: "insert", rows: [{ id: "t2", name: "Again" }] });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: "23505" });

    const { data } = (await (await call("/query", { table: "tasks", op: "select", order: { column: "id", ascending: true }, columns: ["id", "name"] })).json()) as {
      data: unknown[];
    };
    expect(data).toEqual([
      { id: "t1", name: "Imported" },
      { id: "t2", name: "Local" },
    ]);
    const onDisk = JSON.parse(await readFile(path.join(dir, "data", "tasks.json"), "utf-8")) as unknown[];
    expect(onDisk).toHaveLength(2);
  });

  it("rejects a malformed query and an unknown route", async () => {
    expect((await call("/query", { table: "../x", op: "select" })).status).toBe(400);
    expect((await call("/nope", {})).status).toBe(404);
  });

  it("fails loudly on a corrupt file instead of overwriting it", async () => {
    const file = path.join(dir, "data", "transactions.json");
    await writeFile(file, "{not json");
    expect((await call("/query", { table: "transactions", op: "insert", rows: [{ name: "x" }] })).status).toBe(500);
    expect(await readFile(file, "utf-8")).toBe("{not json");
  });
});

describe("importFromSupabase", () => {
  it("signs in, pages every table, drops user_id and normalises timestamps", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}`, user_id: "u1", created_at: "2026-11-15T20:14:03.123456+00:00" }));
    const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/token") {
        expect(url.searchParams.get("grant_type")).toBe("password");
        expect(JSON.parse(String(init?.body))).toEqual({ email: "a@b.c", password: "pw" });
        return Response.json({ access_token: "at" });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer at");
      if (url.pathname === "/rest/v1/habits") return new Response("{}", { status: 404 });
      if (url.pathname === "/rest/v1/tasks") return Response.json(url.searchParams.get("offset") === "0" ? page : [{ id: "last", user_id: "u1" }]);
      return Response.json([]);
    });
    const db = await importFromSupabase({
      url: "https://x.supabase.co/",
      anonKey: "anon",
      credentials: { email: "a@b.c", password: "pw" },
      fetch: send as unknown as typeof fetch,
    });
    expect(db.tasks).toHaveLength(1001);
    expect(db.tasks?.[0]).toEqual({ id: "t0", created_at: "2026-11-15T20:14:03.123Z" });
    expect(db.habits).toEqual([]);
  });

  it("reports a rejected sign-in", async () => {
    const send = vi.fn(async () => Response.json({ error_description: "Invalid login credentials" }, { status: 400 }));
    await expect(
      importFromSupabase({ url: "https://x.supabase.co", anonKey: "anon", credentials: { refreshToken: "rt" }, fetch: send as unknown as typeof fetch }),
    ).rejects.toMatchObject({ status: 401, message: expect.stringContaining("Invalid login credentials") });
  });
});
