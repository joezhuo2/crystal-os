import { describe, expect, it } from "vitest";
import { searchChats } from "./chatSearch";
import type { ChatMessage, ChatMeta } from "./types";

const chat = (id: string, title: string, updatedAt: number): ChatMeta => ({
  id,
  projectId: "p1",
  title,
  createdAt: 0,
  updatedAt,
  pinned: false,
  tier: "high",
  effort: "medium",
  mode: "auto",
});

const text = (role: ChatMessage["role"], value: string): ChatMessage => ({
  id: value,
  role,
  blocks: [{ kind: "text", text: value }],
  createdAt: 0,
});

const chats = [chat("a", "Fix the login page", 1), chat("b", "Refactor", 3), chat("c", "Docs", 2)];
const messages: Record<string, ChatMessage[]> = {
  b: [text("user", "Why does the login redirect loop after sign in on the settings page?")],
  c: [text("system", "login notice"), text("assistant", "Nothing here")],
};
const messagesOf = (id: string) => messages[id];

describe("searchChats", () => {
  it("puts title matches first, then message matches with a snippet", () => {
    const hits = searchChats(chats, messagesOf, "LOGIN");
    expect(hits.map((h) => h.chat.id)).toEqual(["a", "b"]);
    expect(hits[0].snippet).toBeNull();
    expect(hits[1].snippet).toContain("login redirect");
  });

  it("ignores system messages and queries under two characters", () => {
    expect(searchChats(chats, messagesOf, "notice")).toEqual([]);
    expect(searchChats(chats, messagesOf, "l")).toEqual([]);
  });

  it("shortens long text around the match", () => {
    const long = `${"x ".repeat(100)}needle${" y".repeat(100)}`;
    const [hit] = searchChats([chat("d", "Other", 0)], () => [text("user", long)], "needle");
    expect(hit.snippet?.startsWith("…")).toBe(true);
    expect(hit.snippet?.endsWith("…")).toBe(true);
    expect(hit.snippet).toContain("needle");
  });

  it("orders by most recent update and keeps the limit", () => {
    const many = [chat("old", "login 1", 1), chat("new", "login 2", 9), chat("mid", "login 3", 5)];
    expect(searchChats(many, () => undefined, "login", 2).map((h) => h.chat.id)).toEqual(["new", "mid"]);
  });
});
