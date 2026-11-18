import { makeResult, parseStoredResults, upsertResult, type FunResult } from "@/lib/funGames";
import { parseStoredApps, type PortalApp } from "@/lib/portalApps";

export const GAMES_KEY = "crystal-os-fun-games";
export const ACTIVE_KEY = "crystal-os-fun-active";
export const RESULTS_KEY = "crystal-os-fun-results";

export interface FunState {
  games: PortalApp[];
  activeId: string | null;
  results: FunResult[];
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the change still applies for this session */
  }
}

function load(): FunState {
  const games = parseStoredApps(read(GAMES_KEY));
  const active = read(ACTIVE_KEY);
  return {
    games,
    activeId: games.some((g) => g.id === active) ? active : (games[0]?.id ?? null),
    results: parseStoredResults(read(RESULTS_KEY)),
  };
}

let state: FunState = load();
const listeners = new Set<() => void>();

function set(next: FunState) {
  state = next;
  write(GAMES_KEY, JSON.stringify(next.games.map(({ id, name, url }) => ({ id, name, url }))));
  write(ACTIVE_KEY, next.activeId);
  write(RESULTS_KEY, JSON.stringify(next.results));
  listeners.forEach((l) => l());
}

export const fun = {
  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  add(game: PortalApp) {
    if (state.games.some((g) => g.id === game.id)) return;
    set({ ...state, games: [...state.games, game], activeId: game.id });
  },

  remove(id: string) {
    const index = state.games.findIndex((g) => g.id === id);
    if (index === -1) return;
    const games = state.games.filter((g) => g.id !== id);
    const activeId = state.activeId === id ? (games[Math.min(index, games.length - 1)]?.id ?? null) : state.activeId;
    set({ games, activeId, results: state.results.filter((r) => r.game !== id) });
  },

  setActive(id: string) {
    if (id === state.activeId || !state.games.some((g) => g.id === id)) return;
    set({ ...state, activeId: id });
  },

  record(game: string, text: string, date: string) {
    if (!state.games.some((g) => g.id === game)) return;
    const results = upsertResult(state.results, makeResult(game, text, date));
    if (results !== state.results) set({ ...state, results });
  },

  _reset() {
    state = load();
    listeners.forEach((l) => l());
  },
};
