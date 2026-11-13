import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMailStore } from "./store";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mail-store-"));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

describe("mail store", () => {
  it("round-trips accounts and replaces a reconnected address", async () => {
    const store = createMailStore(dir);
    expect(await store.list()).toEqual([]);

    const a = await store.upsert("google", "me@gmail.com", "rt-1");
    await store.upsert("microsoft", "me@outlook.com", "rt-2");
    const again = await store.upsert("google", "Me@gmail.com", "rt-3");
    expect(again.id).toBe(a.id);

    const fresh = createMailStore(dir);
    expect((await fresh.list()).map((x) => [x.provider, x.refreshToken])).toEqual([
      ["google", "rt-3"],
      ["microsoft", "rt-2"],
    ]);

    await fresh.setToken(a.id, "rt-4");
    expect((await fresh.list())[0].refreshToken).toBe("rt-4");
    expect(await fresh.remove(a.id)).toMatchObject({ email: "Me@gmail.com" });
    expect(JSON.parse(await readFile(path.join(dir, "mail-accounts.json"), "utf-8")).accounts).toHaveLength(1);
  });

  it("treats a corrupt file as empty", async () => {
    await writeFile(path.join(dir, "mail-accounts.json"), "{not json");
    const store = createMailStore(dir);
    expect(await store.list()).toEqual([]);
    await store.upsert("google", "me@gmail.com", "rt");
    expect(await store.list()).toHaveLength(1);
  });
});
