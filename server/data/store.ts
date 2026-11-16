import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Db, type Query, type Row, type Table, TABLES, runQuery, tablesFor } from "./query";

const DIR = "data";
const META = "meta.json";

export interface DataMeta {
  importedAt?: string;
  skippedAt?: string;
}

export function createDataStore(rootDir: string) {
  const dir = path.join(rootDir, DIR);
  let queue: Promise<unknown> = Promise.resolve();

  async function readJson<T>(name: string, empty: T, ok: (value: unknown) => boolean): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(path.join(dir, name), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty;
      throw err;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!ok(parsed)) throw new Error(`${name} is not in the expected format`);
    return parsed as T;
  }

  async function writeJson(name: string, value: unknown) {
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(value), { encoding: "utf-8", mode: 0o600 });
    await rename(tmp, file);
  }

  const readTable = (table: Table) => readJson<Row[]>(`${table}.json`, [], Array.isArray);

  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    run(q: Query): Promise<Row[] | null> {
      return serial(async () => {
        const db: Db = {};
        for (const table of tablesFor(q)) db[table] = await readTable(table);
        const { data, changed } = runQuery(db, q, { now: () => new Date().toISOString(), newId: randomUUID });
        for (const table of changed) await writeJson(`${table}.json`, db[table]);
        return data;
      });
    },

    meta(): Promise<DataMeta> {
      return readJson<DataMeta>(META, {}, (v) => !!v && typeof v === "object" && !Array.isArray(v));
    },

    merge(incoming: Db, meta: DataMeta): Promise<void> {
      return serial(async () => {
        for (const table of TABLES) {
          const rows = incoming[table];
          if (!rows?.length) continue;
          const ids = new Set(rows.map((r) => r.id));
          await writeJson(`${table}.json`, [...(await readTable(table)).filter((r) => !ids.has(r.id)), ...rows]);
        }
        await writeJson(META, meta);
      });
    },
  };
}

export type DataStore = ReturnType<typeof createDataStore>;
