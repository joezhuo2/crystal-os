import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiRequest";
import { adoptUserStorage, cachedSupabaseSession, importData } from "./dataImport";
import { clearDiagnostics, getDiagnostics } from "./diagnostics";
import { db } from "./localDb";

vi.mock("./apiRequest", async (original) => ({ ...(await original<typeof import("./apiRequest")>()), apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const sent = () => JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body));

afterEach(() => {
  vi.clearAllMocks();
  clearDiagnostics();
  localStorage.clear();
});

describe("db", () => {
  it("sends the query the chain describes", async () => {
    request.mockResolvedValue({ data: [{ id: "c1" }] });
    const result = await db.from("task_completions").select("id").eq("task_id", "t1").order("completed_at", { ascending: false }).limit(1);
    expect(result).toEqual({ data: [{ id: "c1" }], error: null, status: 200 });
    expect(sent()).toEqual({
      table: "task_completions",
      op: "select",
      filters: [{ column: "task_id", op: "eq", value: "t1" }],
      columns: ["id"],
      order: { column: "completed_at", ascending: false },
      limit: 1,
    });
  });

  it("returns the written row from insert().select().single()", async () => {
    request.mockResolvedValue({ data: [{ id: "h1", name: "Read" }] });
    const { data, error } = await db.from("habits").insert({ name: "Read" }).select("id, name").single();
    expect(error).toBeNull();
    expect(data).toEqual({ id: "h1", name: "Read" });
    expect(sent()).toMatchObject({ op: "insert", rows: [{ name: "Read" }], returning: true, columns: ["id", "name"] });
  });

  it("splits upsert conflict columns", async () => {
    request.mockResolvedValue({ data: null });
    await db.from("habit_checks").upsert({ habit_id: "h1", day: "d" }, { onConflict: "habit_id,day", ignoreDuplicates: true });
    expect(sent()).toMatchObject({ op: "upsert", onConflict: ["habit_id", "day"], ignoreDuplicates: true });
  });

  it("maps failures to an error and a status, and logs failed writes", async () => {
    request.mockRejectedValueOnce(new ApiError("A row with this key already exists", 409));
    expect(await db.from("tasks").insert({ id: "t1" })).toEqual({
      data: null,
      error: { message: "A row with this key already exists", code: "23505" },
      status: 409,
    });
    request.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await db.from("tasks").update({ name: "secret" }).eq("id", "t1")).toMatchObject({ status: 0, error: { message: "Failed to fetch" } });
    request.mockRejectedValueOnce(new ApiError("down", 503));
    expect((await db.from("tasks").select("*")).status).toBe(503);

    const logged = getDiagnostics().map((d) => d.message);
    expect(logged).toEqual(["update tasks → no response: Failed to fetch"]);
  });
});

describe("import from Supabase", () => {
  const session = JSON.stringify({ refresh_token: "rt", user: { id: "u1" } });

  it("finds the cached Supabase session", () => {
    expect(cachedSupabaseSession()).toBeNull();
    localStorage.setItem("sb-abc-auth-token", "{broken");
    expect(cachedSupabaseSession()).toBeNull();
    localStorage.setItem("sb-abc-auth-token", session);
    expect(cachedSupabaseSession()).toEqual({ key: "sb-abc-auth-token", refreshToken: "rt", userId: "u1" });
  });

  it("copies per-user storage to the local user without overwriting", () => {
    localStorage.setItem("crystal-os-offline-queue:u1", "[1]");
    localStorage.setItem("recents:u1", "old");
    localStorage.setItem("recents:local", "kept");
    adoptUserStorage("u1");
    expect(localStorage.getItem("crystal-os-offline-queue:local")).toBe("[1]");
    expect(localStorage.getItem("recents:local")).toBe("kept");
  });

  it("drops the Supabase session only after a successful import", async () => {
    localStorage.setItem("sb-abc-auth-token", session);
    localStorage.setItem("crystal-os-offline-queue:u1", "[1]");
    request.mockRejectedValueOnce(new ApiError("Supabase sign-in failed", 401));
    await expect(importData({ refreshToken: "rt" })).rejects.toThrow("sign-in failed");
    expect(localStorage.getItem("sb-abc-auth-token")).toBe(session);

    request.mockResolvedValueOnce({ imported: 3 });
    expect(await importData({ refreshToken: "rt" })).toBe(3);
    expect(localStorage.getItem("sb-abc-auth-token")).toBeNull();
    expect(localStorage.getItem("crystal-os-offline-queue:local")).toBe("[1]");
  });
});
