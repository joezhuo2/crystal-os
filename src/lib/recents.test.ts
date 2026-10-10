import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetRecent,
  MAX_RECENTS,
  parseRecents,
  pushRecent,
  readRecents,
  recordRecent,
  RECENTS_KEY_PREFIX,
  setRecentsOwner,
  type RecentItem,
} from "./recents";

const task = (id: string, at = 1): RecentItem => ({ kind: "task", id, title: `Task ${id}`, at });

describe("parseRecents", () => {
  it("returns an empty list for missing or malformed data", () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents("not json")).toEqual([]);
    expect(parseRecents('{"kind":"task"}')).toEqual([]);
  });

  it("drops malformed entries and events without a calendar or date", () => {
    const raw = JSON.stringify([
      task("a"),
      { kind: "event", id: "e1", title: "Standup", at: 2 },
      { kind: "event", id: "e2", title: "Lunch", at: 3, calendarId: "primary", date: "2026-10-09" },
      { kind: "photo", id: "x", title: "X", at: 4 },
      { kind: "note", id: "", title: "Empty", at: 5 },
    ]);
    expect(parseRecents(raw).map((r) => r.id)).toEqual(["a", "e2"]);
  });

  it("keeps at most MAX_RECENTS", () => {
    const raw = JSON.stringify(Array.from({ length: MAX_RECENTS + 3 }, (_, i) => task(String(i))));
    expect(parseRecents(raw)).toHaveLength(MAX_RECENTS);
  });
});

describe("pushRecent", () => {
  it("puts the item first and removes its older entry", () => {
    const list = [task("a"), task("b"), task("c")];
    expect(pushRecent(list, task("b", 9)).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("treats the same id of a different kind as a different item", () => {
    const note: RecentItem = { kind: "note", id: "a", title: "Note a", at: 2 };
    expect(pushRecent([task("a")], note)).toHaveLength(2);
  });

  it("trims the oldest past the cap", () => {
    const list = Array.from({ length: MAX_RECENTS }, (_, i) => task(String(i)));
    const next = pushRecent(list, task("new"));
    expect(next).toHaveLength(MAX_RECENTS);
    expect(next[0].id).toBe("new");
    expect(next.some((r) => r.id === String(MAX_RECENTS - 1))).toBe(false);
  });
});

describe("recordRecent", () => {
  beforeEach(() => {
    localStorage.clear();
    setRecentsOwner("user-1");
  });

  it("stores opens per user, newest first", () => {
    recordRecent({ kind: "task", id: "t1", title: "Write report" }, 1);
    recordRecent({ kind: "note", id: "Inbox.md", title: "Inbox" }, 2);
    expect(readRecents().map((r) => r.id)).toEqual(["Inbox.md", "t1"]);
    expect(localStorage.getItem(`${RECENTS_KEY_PREFIX}user-1`)).not.toBeNull();

    setRecentsOwner("user-2");
    expect(readRecents()).toEqual([]);
  });

  it("does nothing while signed out", () => {
    setRecentsOwner(null);
    recordRecent({ kind: "task", id: "t1", title: "Write report" });
    expect(localStorage.length).toBe(0);
    expect(readRecents()).toEqual([]);
  });

  it("skips untitled items", () => {
    recordRecent({ kind: "event", id: "e1", title: "  ", calendarId: "primary", date: "2026-10-09" });
    expect(readRecents()).toEqual([]);
  });

  it("forgets an item that no longer exists", () => {
    recordRecent({ kind: "event", id: "e1", title: "Standup", calendarId: "primary", date: "2026-10-09" });
    recordRecent({ kind: "task", id: "t1", title: "Write report" });
    forgetRecent("event", "e1");
    expect(readRecents().map((r) => r.id)).toEqual(["t1"]);
  });
});
