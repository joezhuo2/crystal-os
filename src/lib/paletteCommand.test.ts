import { afterEach, describe, expect, it } from "vitest";
import { MAX_RECENT_COMMANDS, parsePaletteCommand, parseSnoozeTarget, readRecentCommands, recordRecentCommand } from "./paletteCommand";

const TODAY = "2026-11-16";
const tasks = [
  { id: "1", name: "Write report", completed: false },
  { id: "2", name: "Buy milk", completed: false },
  { id: "3", name: "Buy milk and eggs", completed: true },
  { id: "4", name: "Call mum until she answers", completed: false },
];
const parse = (input: string) => parsePaletteCommand(input, tasks, TODAY);

afterEach(() => localStorage.clear());

describe("parseSnoozeTarget", () => {
  it("reads presets, weekdays, dates and someday", () => {
    expect(parseSnoozeTarget("tomorrow", TODAY)).toBe("2026-11-17");
    expect(parseSnoozeTarget("Next Week", TODAY)).toBe("2026-11-23");
    expect(parseSnoozeTarget("friday", TODAY)).toBe("2026-11-20");
    expect(parseSnoozeTarget("fri", TODAY)).toBe("2026-11-20");
    expect(parseSnoozeTarget("monday", TODAY)).toBe("2026-11-23");
    expect(parseSnoozeTarget("2026-12-01", TODAY)).toBe("2026-12-01");
    expect(parseSnoozeTarget("someday", TODAY)).toBe("someday");
  });

  it("rejects the past and nonsense", () => {
    expect(parseSnoozeTarget("2026-11-16", TODAY)).toBeNull();
    expect(parseSnoozeTarget("fr", TODAY)).toBeNull();
    expect(parseSnoozeTarget("whenever", TODAY)).toBeNull();
  });
});

describe("parsePaletteCommand", () => {
  it("adds a task and logs an expense", () => {
    expect(parse("add Buy bread")).toEqual({ kind: "add", name: "Buy bread" });
    expect(parse("log 25 for Lunch")).toEqual({ kind: "log", amount: 25, name: "Lunch" });
    expect(parse("log $4.50 on Coffee")).toEqual({ kind: "log", amount: 4.5, name: "Coffee" });
    expect(parse("log lunch")).toBeNull();
  });

  it("completes and focuses the best open match, typos included", () => {
    expect(parse("complete milk")).toEqual({ kind: "complete", task: tasks[1] });
    expect(parse("done reprot")).toEqual({ kind: "complete", task: tasks[0] });
    expect(parse("start focus on report")).toEqual({ kind: "focus", task: tasks[0] });
    expect(parse("focus milk")).toEqual({ kind: "focus", task: tasks[1] });
    expect(parse("complete taxes")).toBeNull();
  });

  it("snoozes to a day, or asks for one", () => {
    expect(parse("snooze milk to friday")).toEqual({ kind: "snooze", task: tasks[1], until: "2026-11-20" });
    expect(parse("snooze report until someday")).toEqual({ kind: "snooze", task: tasks[0], until: "someday" });
    expect(parse("snooze milk")).toEqual({ kind: "snooze", task: tasks[1], until: null });
    expect(parse("snooze call mum until she answers")).toEqual({ kind: "snooze", task: tasks[3], until: null });
  });

  it("ignores plain searches", () => {
    expect(parse("milk")).toBeNull();
    expect(parse("complete")).toBeNull();
  });
});

describe("recent commands", () => {
  it("keeps the latest few, newest first, without repeats", () => {
    for (let i = 0; i < MAX_RECENT_COMMANDS + 2; i++) recordRecentCommand(`add task ${i}`);
    recordRecentCommand("ADD TASK 3");
    const list = readRecentCommands();
    expect(list).toHaveLength(MAX_RECENT_COMMANDS);
    expect(list[0]).toBe("ADD TASK 3");
    expect(list.filter((c) => c.toLowerCase() === "add task 3")).toHaveLength(1);
  });

  it("survives broken storage", () => {
    localStorage.setItem("crystal-os-recent-commands", "{oops");
    expect(readRecentCommands()).toEqual([]);
  });
});
