import { describe, expect, it } from "vitest";
import { decideDshPermission, userChoice, type AcpPermissionOption } from "./modes";

const options: AcpPermissionOption[] = [
  { optionId: "a1", kind: "allow_once" },
  { optionId: "a2", kind: "allow_always" },
  { optionId: "r1", kind: "reject_once" },
];

describe("decideDshPermission", () => {
  it("auto allows once", () => {
    expect(decideDshPermission("auto", "edit", options)).toEqual({ type: "select", optionId: "a1" });
  });

  it("manual always asks", () => {
    expect(decideDshPermission("manual", "read", options)).toEqual({ type: "ask" });
  });

  it("plan rejects anything that can change state", () => {
    for (const kind of ["edit", "delete", "move", "execute", "other", undefined]) {
      expect(decideDshPermission("plan", kind, options)).toEqual({ type: "select", optionId: "r1" });
    }
  });

  it("plan allows read-only tools", () => {
    for (const kind of ["read", "search", "fetch", "think"]) {
      expect(decideDshPermission("plan", kind, options)).toEqual({ type: "select", optionId: "a1" });
    }
  });

  it("cancels in plan mode when no reject option exists", () => {
    expect(decideDshPermission("plan", "edit", [{ optionId: "a1", kind: "allow_once" }])).toEqual({ type: "cancel" });
  });
});

describe("userChoice", () => {
  it("maps Allow and Deny to options", () => {
    expect(userChoice(options, true)).toEqual({ type: "select", optionId: "a1" });
    expect(userChoice(options, false)).toEqual({ type: "select", optionId: "r1" });
    expect(userChoice([], false)).toEqual({ type: "cancel" });
  });
});
