import { describe, expect, it } from "vitest";
import { fuzzyRank, fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("scores a substring match highest", () => {
    expect(fuzzyScore("milk", "Buy milk")).toBe(1);
    expect(fuzzyScore("BUY MI", "buy milk")).toBe(1);
  });

  it("matches words in any order", () => {
    expect(fuzzyScore("milk buy", "Buy milk")).toBeGreaterThan(0.9);
  });

  it("forgives one typo in a word of 4+ letters and two in 8+", () => {
    expect(fuzzyScore("mlik", "Buy milk")).toBeGreaterThan(0);
    expect(fuzzyScore("grocries", "Groceries run")).toBeGreaterThan(0);
    expect(fuzzyScore("asignmnt", "Assignment 3")).toBeGreaterThan(0);
    expect(fuzzyScore("repo", "Write report")).toBeGreaterThan(0);
  });

  it("matches a mistyped prefix of a longer word", () => {
    expect(fuzzyScore("calandar", "calendar-sync settings")).toBeGreaterThan(0);
    expect(fuzzyScore("privcy", "toggle privacy mode")).toBeGreaterThan(0);
  });

  it("does not forgive typos in short words or unrelated text", () => {
    expect(fuzzyScore("cat", "car")).toBe(0);
    expect(fuzzyScore("milk", "Pay rent")).toBe(0);
    expect(fuzzyScore("buy bread", "Buy milk")).toBe(0);
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("fuzzyRank", () => {
  it("orders exact matches before typo matches and keeps ties in order", () => {
    const items = ["Mlik run", "Buy milk", "Milk the cow", "Pay rent"];
    expect(fuzzyRank("milk", items, (s) => s)).toEqual(["Buy milk", "Milk the cow", "Mlik run"]);
  });
});
