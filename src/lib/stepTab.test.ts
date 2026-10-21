import { describe, expect, it } from "vitest";
import { stepTab } from "./stepTab";

const order = ["a", "b", "c"];

describe("stepTab", () => {
  it("moves forward and wraps bottom to top", () => {
    expect(stepTab(order, "a", 1)).toBe("b");
    expect(stepTab(order, "c", 1)).toBe("a");
  });
  it("moves back and wraps top to bottom", () => {
    expect(stepTab(order, "b", -1)).toBe("a");
    expect(stepTab(order, "a", -1)).toBe("c");
  });
  it("falls back to the first entry for an unknown tab", () => {
    expect(stepTab(order, "z", 1)).toBe("a");
  });
});
