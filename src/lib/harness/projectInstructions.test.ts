import { beforeEach, describe, expect, it } from "vitest";
import { INSTRUCTIONS_MAX_CHARS, INSTRUCTIONS_PREAMBLE, parseProjectInstructions, projectInstructions, withInstructions } from "./projectInstructions";

beforeEach(() => {
  localStorage.clear();
  projectInstructions._reset();
});

describe("parseProjectInstructions", () => {
  it("tolerates junk and drops blank or non-string entries", () => {
    expect(parseProjectInstructions(null)).toEqual({});
    expect(parseProjectInstructions("nope")).toEqual({});
    expect(parseProjectInstructions("[1]")).toEqual({});
    expect(parseProjectInstructions('{"a":"x","b":" ","c":3}')).toEqual({ a: "x" });
  });
});

describe("projectInstructions", () => {
  it("trims, persists and is scoped per project", () => {
    projectInstructions.set("p1", "  use tabs \n");
    expect(projectInstructions.forProject("p1")).toBe("use tabs");
    expect(projectInstructions.forProject("p2")).toBe("");
    projectInstructions.set("p2", "other");
    projectInstructions._reset();
    expect(projectInstructions.forProject("p1")).toBe("use tabs");
  });

  it("clears on blank text and on project removal", () => {
    projectInstructions.set("p1", "a");
    projectInstructions.set("p2", "b");
    projectInstructions.set("p1", "   ");
    expect(Object.keys(projectInstructions.getState())).toEqual(["p2"]);
    projectInstructions.removeProject("p2");
    expect(projectInstructions.getState()).toEqual({});
  });

  it("caps the length", () => {
    projectInstructions.set("p1", "x".repeat(INSTRUCTIONS_MAX_CHARS + 50));
    expect(projectInstructions.forProject("p1")).toHaveLength(INSTRUCTIONS_MAX_CHARS);
  });
});

describe("withInstructions", () => {
  it("prepends the preamble and text, or leaves the prompt alone", () => {
    expect(withInstructions("be brief", "hi")).toBe(`${INSTRUCTIONS_PREAMBLE}\nbe brief\n\nhi`);
    expect(withInstructions("  ", "hi")).toBe("hi");
    expect(withInstructions(undefined, "hi")).toBe("hi");
  });
});
