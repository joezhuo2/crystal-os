import { describe, expect, it } from "vitest";
import { findConflict } from "./keymapConflicts";
import type { KeymapAction } from "./keymap";

const actions: KeymapAction[] = [
  { id: "general.a", category: "general", title: "A", defaultKey: "KeyA" },
  { id: "engine.b", category: "engine", title: "B", defaultKey: "KeyB" },
  { id: "engine.c", category: "engine", title: "C", defaultKey: "KeyC" },
  { id: "orbit.d", category: "orbit", title: "D", defaultKey: "KeyD" },
];
const bindingOf = (id: string) => actions.find((a) => a.id === id)?.defaultKey;

describe("findConflict", () => {
  it("finds a same-category clash", () => {
    expect(findConflict(actions, actions[1], "KeyC", bindingOf)?.id).toBe("engine.c");
  });

  it("finds a clash with a general action", () => {
    expect(findConflict(actions, actions[1], "KeyA", bindingOf)?.id).toBe("general.a");
  });

  it("ignores other categories and the action itself", () => {
    expect(findConflict(actions, actions[1], "KeyD", bindingOf)).toBeUndefined();
    expect(findConflict(actions, actions[1], "KeyB", bindingOf)).toBeUndefined();
  });
});
