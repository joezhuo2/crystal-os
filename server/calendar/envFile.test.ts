import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readEnvValue, removeEnvValue, upsertEnvValue } from "./envFile";

const KEY = "GOOGLE_REFRESH_TOKEN";

let dir: string;

async function seed(contents: string): Promise<void> {
  await writeFile(path.join(dir, ".env.local"), contents, "utf-8");
}

async function read(): Promise<string> {
  return readFile(path.join(dir, ".env.local"), "utf-8");
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "crystal-env-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("upsertEnvValue", () => {
  it("appends a new key without touching existing lines", async () => {
    await seed("# comment\nOBSIDIAN_VAULT_PATH=C:/vault\n");
    await upsertEnvValue(dir, KEY, "tok-1");

    expect(await read()).toBe(
      "# comment\nOBSIDIAN_VAULT_PATH=C:/vault\nGOOGLE_REFRESH_TOKEN=tok-1\n",
    );
  });

  it("replaces an existing key in place", async () => {
    await seed("A=1\nGOOGLE_REFRESH_TOKEN=old\nB=2\n");
    await upsertEnvValue(dir, KEY, "new");

    expect(await read()).toBe("A=1\nGOOGLE_REFRESH_TOKEN=new\nB=2\n");
  });

  it("preserves CRLF line endings", async () => {
    await seed("# comment\r\nOBSIDIAN_VAULT_PATH=C:/vault\r\n");
    await upsertEnvValue(dir, KEY, "tok-1");

    const raw = await read();
    expect(raw).toBe(
      "# comment\r\nOBSIDIAN_VAULT_PATH=C:/vault\r\nGOOGLE_REFRESH_TOKEN=tok-1\r\n",
    );
    expect(raw.includes("\n\n")).toBe(false);
  });

  it("replaces in place in a CRLF file", async () => {
    await seed("A=1\r\nGOOGLE_REFRESH_TOKEN=old\r\nB=2\r\n");
    await upsertEnvValue(dir, KEY, "new");

    expect(await read()).toBe("A=1\r\nGOOGLE_REFRESH_TOKEN=new\r\nB=2\r\n");
  });

  it("keeps a file that has no trailing newline unterminated", async () => {
    await seed("A=1");
    await upsertEnvValue(dir, KEY, "tok");

    expect(await read()).toBe("A=1\nGOOGLE_REFRESH_TOKEN=tok");
  });

  it("creates the file when it does not exist", async () => {
    await upsertEnvValue(dir, KEY, "tok");
    expect(await read()).toMatch(/^GOOGLE_REFRESH_TOKEN=tok\r?\n$/);
  });

  it("matches an `export`-prefixed key rather than duplicating it", async () => {
    await seed("export GOOGLE_REFRESH_TOKEN=old\n");
    await upsertEnvValue(dir, KEY, "new");

    expect(await read()).toBe("GOOGLE_REFRESH_TOKEN=new\n");
  });

  it("does not match a key that merely shares a prefix", async () => {
    await seed("GOOGLE_REFRESH_TOKEN_BACKUP=keep\n");
    await upsertEnvValue(dir, KEY, "new");

    const raw = await read();
    expect(raw).toContain("GOOGLE_REFRESH_TOKEN_BACKUP=keep");
    expect(raw).toContain("GOOGLE_REFRESH_TOKEN=new");
  });
});

describe("readEnvValue", () => {
  it("reads a value back", async () => {
    await seed("A=1\nGOOGLE_REFRESH_TOKEN=tok\n");
    expect(await readEnvValue(dir, KEY)).toBe("tok");
  });

  it("returns null for a missing key and a missing file", async () => {
    expect(await readEnvValue(dir, KEY)).toBeNull();
    await seed("A=1\n");
    expect(await readEnvValue(dir, KEY)).toBeNull();
  });
});

describe("removeEnvValue", () => {
  it("drops only the target line", async () => {
    await seed("# keep\nA=1\nGOOGLE_REFRESH_TOKEN=tok\nB=2\n");
    await removeEnvValue(dir, KEY);

    expect(await read()).toBe("# keep\nA=1\nB=2\n");
  });

  it("is a no-op when the key is absent", async () => {
    await seed("A=1\n");
    await removeEnvValue(dir, KEY);
    expect(await read()).toBe("A=1\n");
  });
});
