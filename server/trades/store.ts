import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Dividend, FxConversion, TradeEvent, TradeJournal, TradesData } from "./types";

const FILE = "trades.json";

export interface TradesState {
  known: Record<string, string[]>;
  events: TradeEvent[];
  fx: FxConversion[];
  dividends: Dividend[];
  edits: Record<string, TradeEvent | null>;
  journal: Record<string, TradeJournal>;
  lastSync: string | null;
}

function emptyState(): TradesState {
  return { known: {}, events: [], fx: [], dividends: [], edits: {}, journal: {}, lastSync: null };
}

export function toTradesData(state: TradesState): Pick<TradesData, "events" | "fx" | "dividends" | "journal" | "lastSync"> {
  const events = state.events
    .filter((e) => state.edits[e.id] !== null)
    .map((e) => state.edits[e.id] ?? e)
    .sort((a, b) => a.time.localeCompare(b.time));
  return {
    events,
    fx: [...state.fx].sort((a, b) => a.time.localeCompare(b.time)),
    dividends: [...state.dividends].sort((a, b) => a.time.localeCompare(b.time)),
    journal: state.journal,
    lastSync: state.lastSync,
  };
}

export function createTradesStore(rootDir: string) {
  const file = path.join(rootDir, FILE);
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<TradesState> {
    let raw: string;
    try {
      raw = await readFile(file, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw err;
    }
    try {
      const p = JSON.parse(raw) as Partial<TradesState> | null;
      return {
        known: p?.known && typeof p.known === "object" ? p.known : {},
        events: Array.isArray(p?.events) ? p.events : [],
        fx: Array.isArray(p?.fx) ? p.fx : [],
        dividends: Array.isArray(p?.dividends) ? p.dividends : [],
        edits: p?.edits && typeof p.edits === "object" ? p.edits : {},
        journal: p?.journal && typeof p.journal === "object" ? p.journal : {},
        lastSync: typeof p?.lastSync === "string" ? p.lastSync : null,
      };
    } catch {
      return emptyState();
    }
  }

  function update<T>(fn: (state: TradesState) => T): Promise<T> {
    const run = queue.then(async () => {
      const state = await read();
      const result = fn(state);
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
      await rename(tmp, file);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return { read, update };
}

export type TradesStore = ReturnType<typeof createTradesStore>;
