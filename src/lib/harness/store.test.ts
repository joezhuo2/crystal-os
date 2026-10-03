import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_KEY, harness, parseChatFile, parseStateFile, parseTheme, PREFS_KEY, selectProjectChats, selectProjectTokens, THEME_KEY } from "./store";
import { DEFAULT_THEME } from "./types";

const persistence = { saveState: vi.fn(async () => undefined), saveChat: vi.fn(async () => undefined), deleteChat: vi.fn(async () => undefined) };

beforeEach(() => {
  localStorage.clear();
  harness._reset();
  vi.clearAllMocks();
  harness.setPersistence(persistence);
  harness.hydrate(null);
});

describe("harness store", () => {
  it("creates projects once per path and chats with the default options", () => {
    const p = harness.addProject("app", "C:/Projects/app");
    expect(harness.addProject("again", "c:/projects/APP").id).toBe(p.id);
    const chat = harness.createChat(p.id);
    expect(chat).toMatchObject({ projectId: p.id, tier: "medium", effort: "high", mode: "auto", title: "New chat" });
    expect(harness.getState().activeChatId).toBe(chat.id);
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(chat.id);
    expect(persistence.saveState).toHaveBeenCalled();
  });

  it("titles a chat from its first user message", () => {
    const p = harness.addProject("app", "C:/p");
    const chat = harness.createChat(p.id);
    harness.appendMessage(chat.id, { id: "m", role: "user", blocks: [{ kind: "text", text: "  Fix the\nflaky login test " }], createdAt: 1 });
    expect(harness.getState().chats[0].title).toBe("Fix the flaky login test");
  });

  it("refuses tier and effort changes while running, but allows mode", () => {
    const p = harness.addProject("app", "C:/p");
    const chat = harness.createChat(p.id);
    harness.setRunning(chat.id, true);
    expect(harness.setChatOptions(chat.id, { tier: "high" })).toBe(false);
    expect(harness.setChatOptions(chat.id, { effort: "max" })).toBe(false);
    expect(harness.setChatOptions(chat.id, { mode: "plan" })).toBe(true);
    expect(harness.getState().chats[0]).toMatchObject({ tier: "medium", effort: "high", mode: "plan" });
    harness.setRunning(chat.id, false);
    expect(harness.setChatOptions(chat.id, { tier: "high" })).toBe(true);
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ tier: "high", mode: "plan" });
  });

  it("sorts chats pinned first, then newest", () => {
    const p = harness.addProject("app", "C:/p");
    const a = harness.createChat(p.id);
    const b = harness.createChat(p.id);
    harness.updateChat(a.id, { updatedAt: 10 });
    harness.updateChat(b.id, { updatedAt: 20 });
    expect(selectProjectChats(harness.getState(), p.id).map((c) => c.id)).toEqual([b.id, a.id]);
    harness.togglePin(a.id);
    expect(selectProjectChats(harness.getState(), p.id).map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it("deletes chats and removes projects with their chats", () => {
    const p = harness.addProject("app", "C:/p");
    const a = harness.createChat(p.id);
    const b = harness.createChat(p.id);
    harness.deleteChat(a.id);
    expect(persistence.deleteChat).toHaveBeenCalledWith(a.id);
    expect(harness.removeProject(p.id)).toEqual([b.id]);
    expect(harness.getState().chats).toEqual([]);
    expect(harness.getState().activeChatId).toBeNull();
  });

  it("adds tokens to the chat and to all-time totals", () => {
    const p = harness.addProject("app", "C:/p");
    const chat = harness.createChat(p.id);
    harness.addTokens(chat.id, { "Kimi K3": { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, estimated: true } });
    harness.addTokens(chat.id, { "Kimi K3": { input: 5, output: 1, cacheRead: 0, cacheWrite: 0, estimated: false } });
    expect(harness.getState().runtime[chat.id].tokens["Kimi K3"].input).toBe(15);
    expect(harness.getState().allTime["Kimi K3"]).toMatchObject({ input: 15, estimated: true });
    harness.resetAllTime();
    expect(harness.getState().allTime).toEqual({});
    expect(harness.getState().runtime[chat.id].tokens["Kimi K3"].input).toBe(15);
  });

  it("keeps per-project totals that survive deleting the chat", () => {
    const a = harness.addProject("a", "C:/a");
    const b = harness.addProject("b", "C:/b");
    const chatA = harness.createChat(a.id);
    const chatB = harness.createChat(b.id);
    harness.addTokens(chatA.id, { m: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, estimated: false } });
    harness.addTokens(chatB.id, { m: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, estimated: false } });
    harness.deleteChat(chatA.id);
    expect(selectProjectTokens(harness.getState(), a.id).m.input).toBe(10);
    expect(selectProjectTokens(harness.getState(), b.id).m.input).toBe(1);
    const saved = JSON.parse((persistence.saveState.mock.calls.at(-1) as unknown as [string])[0]);
    expect(saved.projectTokens[a.id].m.input).toBe(10);
    harness.removeProject(a.id);
    expect(selectProjectTokens(harness.getState(), a.id)).toEqual({});
  });

  it("rebuilds project totals from chat files when the state file predates them", () => {
    const legacy = JSON.stringify({
      version: 1,
      projects: [{ id: "p", name: "p", path: "C:/p", createdAt: 1 }],
      chats: [{ id: "c", projectId: "p", title: "c", tier: "low", effort: "high", mode: "auto", createdAt: 1, updatedAt: 2 }],
      tokens: {},
    });
    expect(harness.hydrate(legacy)).toBe(true);
    harness.backfillProjectTokens([{ chatId: "c", raw: JSON.stringify({ version: 1, id: "c", messages: [], tokens: { m: { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, estimated: true } } }) }]);
    expect(selectProjectTokens(harness.getState(), "p").m).toMatchObject({ input: 7, output: 3 });
    const current = JSON.parse((persistence.saveState.mock.calls.at(-1) as unknown as [string])[0]);
    expect(harness.hydrate(JSON.stringify(current))).toBe(false);
  });

  it("opens a project's unused chat instead of creating another", () => {
    const p = harness.addProject("app", "C:/p");
    const first = harness.openProjectChat(p.id);
    harness.setActiveChat(null);
    expect(harness.openProjectChat(p.id).id).toBe(first.id);
    expect(harness.getState().activeChatId).toBe(first.id);
    harness.appendMessage(first.id, { id: "m", role: "user", blocks: [{ kind: "text", text: "hi" }], createdAt: 1 });
    const second = harness.openProjectChat(p.id);
    expect(second.id).not.toBe(first.id);
    expect(selectProjectChats(harness.getState(), p.id)).toHaveLength(2);
  });

  it("persists a chat transcript as a versioned file", () => {
    const p = harness.addProject("app", "C:/p");
    const chat = harness.createChat(p.id);
    harness.appendMessage(chat.id, { id: "m", role: "user", blocks: [{ kind: "text", text: "hi" }], createdAt: 1 });
    harness.persistChat(chat.id);
    const [id, json] = persistence.saveChat.mock.calls[0] as unknown as [string, string];
    expect(id).toBe(chat.id);
    expect(JSON.parse(json)).toMatchObject({ version: 1, id: chat.id, messages: [{ id: "m" }] });
  });

  it("does not reload a chat that is already open", () => {
    const p = harness.addProject("app", "C:/p");
    const chat = harness.createChat(p.id);
    harness.appendMessage(chat.id, { id: "live", role: "user", blocks: [], createdAt: 1 });
    harness.loadChat(chat.id, JSON.stringify({ version: 1, id: chat.id, messages: [], tokens: {} }));
    expect(harness.getState().runtime[chat.id].messages.map((m) => m.id)).toEqual(["live"]);
  });
});

describe("parsing", () => {
  it("drops chats whose project is gone and repairs bad options", () => {
    const parsed = parseStateFile(
      JSON.stringify({
        version: 1,
        projects: [{ id: "p", name: "p", path: "C:/p", createdAt: 1 }],
        chats: [
          { id: "a", projectId: "p", title: "a", tier: "ultra", effort: "high", mode: "auto", createdAt: 1, updatedAt: 1 },
          { id: "b", projectId: "gone", title: "b", tier: "low", effort: "high", mode: "auto", createdAt: 1, updatedAt: 1 },
        ],
        tokens: {},
      }),
    );
    expect(parsed.chats.map((c) => c.id)).toEqual(["a"]);
    expect(parsed.chats[0].tier).toBe("medium");
    expect(parseStateFile("{broken").projects).toEqual([]);
  });

  it("reads a chat's saved context and tolerates files without one", () => {
    const ctx = { used: 1200, size: 200_000, model: "claude-opus-5" };
    expect(parseChatFile(JSON.stringify({ version: 1, id: "c", messages: [], tokens: {}, context: ctx })).context).toEqual(ctx);
    expect(parseChatFile(JSON.stringify({ version: 1, id: "c", messages: [], tokens: {}, context: { used: 5, model: "dsh" } })).context).toEqual({ used: 5, size: null, model: "dsh" });
    expect(parseChatFile(JSON.stringify({ version: 1, id: "c", messages: [], tokens: {} })).context).toBeUndefined();
    expect(parseChatFile(JSON.stringify({ version: 1, id: "c", messages: [], tokens: {}, context: { used: "x" } })).context).toBeUndefined();
  });

  it("keeps the latest context per chat and saves it with the transcript", () => {
    harness.loadChat("c", null);
    harness.setContext("c", { used: 10, size: 100, model: "m" });
    harness.setContext("c", { used: 40, size: 100, model: "m" });
    expect(harness.getState().runtime.c.context).toEqual({ used: 40, size: 100, model: "m" });
    harness.persistChat("c");
    expect(JSON.parse((persistence.saveChat.mock.calls.at(-1) as unknown as [string, string])[1]).context).toEqual({ used: 40, size: 100, model: "m" });
  });

  it("validates the theme", () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
    expect(parseTheme(JSON.stringify({ colors: ["#000000", "#ffffff", "red"], swirlSpeed: 99, stars: { enabled: false, density: -1 } }))).toEqual({
      colors: DEFAULT_THEME.colors,
      swirlSpeed: 3,
      stars: { enabled: false, density: 0 },
    });
  });

  it("stores theme changes", () => {
    harness.setTheme({ swirlSpeed: 0.5, stars: { enabled: false, density: 0.2 } });
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toMatchObject({ swirlSpeed: 0.5, stars: { enabled: false } });
  });
});
