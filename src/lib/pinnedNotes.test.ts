import { describe, expect, it } from "vitest";
import { parsePinned, togglePinned } from "./pinnedNotes";

describe("pinned notes", () => {
  it("pins a path once and unpins it on the second toggle", () => {
    const pinned = togglePinned(["a.md"], "b.md");
    expect(pinned).toEqual(["a.md", "b.md"]);
    expect(togglePinned(pinned, "a.md")).toEqual(["b.md"]);
  });

  it("reads a stored list, dropping junk and repeats", () => {
    expect(parsePinned('["a.md", 3, "a.md", "b.md"]')).toEqual(["a.md", "b.md"]);
    expect(parsePinned("{oops")).toEqual([]);
    expect(parsePinned(null)).toEqual([]);
  });
});
