import { describe, expect, it } from "vitest";
import { stripAnsi } from "./sanitize";

describe("stripAnsi", () => {
  it("removes colors, cursor moves, and OSC titles", () => {
    expect(stripAnsi("[32mPASS[0m src/a.test.ts")).toBe("PASS src/a.test.ts");
    expect(stripAnsi("[2K[1Gline")).toBe("line");
    expect(stripAnsi("]0;titleafter")).toBe("after");
  });

  it("leaves ordinary text alone", () => {
    expect(stripAnsi("[tool] a [b] c")).toBe("[tool] a [b] c");
  });
});
