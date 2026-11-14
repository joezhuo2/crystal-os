import { describe, expect, it } from "vitest";
import { parseQuickCommand } from "./quickCommand";

describe("parseQuickCommand", () => {
  it("reads a task, with its short forms", () => {
    expect(parseQuickCommand("task buy milk")).toEqual({ kind: "task", name: "buy milk" });
    expect(parseQuickCommand("  TODO   call   Sam ")).toEqual({ kind: "task", name: "call Sam" });
    expect(parseQuickCommand("t x")).toEqual({ kind: "task", name: "x" });
  });

  it("reads a note, and treats plain text as one", () => {
    expect(parseQuickCommand("note try a darker theme")).toEqual({ kind: "note", text: "try a darker theme" });
    expect(parseQuickCommand("try a darker theme")).toEqual({ kind: "note", text: "try a darker theme" });
    expect(parseQuickCommand("tasks are piling up")).toEqual({ kind: "note", text: "tasks are piling up" });
  });

  it("reads focus with or without minutes", () => {
    expect(parseQuickCommand("focus")).toEqual({ kind: "focus" });
    expect(parseQuickCommand("focus 25")).toEqual({ kind: "focus", minutes: 25 });
    expect(parseQuickCommand("f 5")).toEqual({ kind: "focus", minutes: 5 });
  });

  it("keeps a sentence that starts with focus as a note", () => {
    expect(parseQuickCommand("focus on the launch post")).toEqual({ kind: "note", text: "focus on the launch post" });
  });

  it("rejects empty input, a bare keyword and minutes out of range", () => {
    expect(parseQuickCommand("   ").kind).toBe("invalid");
    expect(parseQuickCommand("task").kind).toBe("invalid");
    expect(parseQuickCommand("note").kind).toBe("invalid");
    expect(parseQuickCommand("focus 0").kind).toBe("invalid");
    expect(parseQuickCommand("focus 999").kind).toBe("invalid");
  });
});
