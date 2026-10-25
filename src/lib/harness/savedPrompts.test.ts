import { beforeEach, describe, expect, it } from "vitest";
import { SAVED_PROMPTS_KEY, parseSavedPrompts, savedPrompts } from "./savedPrompts";

beforeEach(() => {
  localStorage.clear();
  savedPrompts._reset();
});

describe("parseSavedPrompts", () => {
  it("falls back to empty on bad input", () => {
    expect(parseSavedPrompts(null)).toEqual({});
    expect(parseSavedPrompts("nope")).toEqual({});
    expect(parseSavedPrompts("[1]")).toEqual({});
  });

  it("drops malformed entries", () => {
    const raw = JSON.stringify({ a: [{ id: "1", title: "t", body: "b" }, { id: 2 }, null], b: "x", c: [] });
    expect(parseSavedPrompts(raw)).toEqual({ a: [{ id: "1", title: "t", body: "b" }] });
  });
});

describe("savedPrompts", () => {
  it("adds trimmed prompts per project and persists", () => {
    const p = savedPrompts.add("p1", " Review ", " check the diff \n");
    expect(p).toMatchObject({ title: "Review", body: "check the diff" });
    expect(savedPrompts.forProject("p2")).toEqual([]);
    savedPrompts._reset();
    expect(savedPrompts.forProject("p1")).toHaveLength(1);
    expect(localStorage.getItem(SAVED_PROMPTS_KEY)).toContain("Review");
  });

  it("rejects empty title or body", () => {
    expect(savedPrompts.add("p1", " ", "x")).toBeNull();
    expect(savedPrompts.add("p1", "x", "")).toBeNull();
    expect(savedPrompts.getState()).toEqual({});
  });

  it("edits and deletes, dropping empty projects", () => {
    const p = savedPrompts.add("p1", "a", "b")!;
    savedPrompts.update("p1", p.id, "c", "d");
    expect(savedPrompts.forProject("p1")[0]).toMatchObject({ title: "c", body: "d" });
    savedPrompts.remove("p1", p.id);
    expect(savedPrompts.getState()).toEqual({});
  });

  it("removes a whole project", () => {
    savedPrompts.add("p1", "a", "b");
    savedPrompts.add("p2", "a", "b");
    savedPrompts.removeProject("p1");
    expect(Object.keys(savedPrompts.getState())).toEqual(["p2"]);
  });

  it("hands a queued insert over once", () => {
    savedPrompts.queueInsert("hello");
    expect(savedPrompts.takeInsert()).toBe("hello");
    expect(savedPrompts.takeInsert()).toBeNull();
  });
});
