import { beforeEach, describe, expect, it } from "vitest";
import {
  HOME_LAYOUT_KEY,
  loadLayout,
  moveBefore,
  normalizeLayout,
  nudge,
  saveLayout,
  setHidden,
  setSize,
  swap,
} from "./homeLayout";

const IDS = ["clock", "weather", "tasks", "vault"] as const;

describe("normalizeLayout", () => {
  it("defaults to every widget in its default order", () => {
    expect(normalizeLayout(null, IDS)).toEqual({ order: [...IDS], hidden: [], sizes: {} });
  });

  it("drops unknown ids, dedupes, and appends widgets added since", () => {
    const layout = normalizeLayout(
      { order: ["vault", "gone", "clock", "vault"], hidden: ["gone", "tasks"], sizes: { clock: 2, gone: 3, vault: 7 } },
      IDS,
    );
    expect(layout).toEqual({ order: ["vault", "clock", "weather", "tasks"], hidden: ["tasks"], sizes: { clock: 2 } });
  });

  it("survives garbage", () => {
    expect(normalizeLayout("nope", IDS).order).toEqual([...IDS]);
    expect(normalizeLayout({ order: "x", sizes: [] }, IDS).order).toEqual([...IDS]);
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips through localStorage and ignores bad JSON", () => {
    saveLayout({ order: ["tasks", "clock", "weather", "vault"], hidden: ["vault"], sizes: { tasks: 3 } });
    expect(loadLayout(IDS)).toEqual({ order: ["tasks", "clock", "weather", "vault"], hidden: ["vault"], sizes: { tasks: 3 } });
    localStorage.setItem(HOME_LAYOUT_KEY, "{not json");
    expect(loadLayout(IDS).order).toEqual([...IDS]);
  });
});

describe("moving", () => {
  it("moves a widget into the target's place, either direction", () => {
    expect(moveBefore([...IDS], "vault", "weather")).toEqual(["clock", "vault", "weather", "tasks"]);
    expect(moveBefore([...IDS], "clock", "tasks")).toEqual(["weather", "tasks", "clock", "vault"]);
    expect(moveBefore([...IDS], "clock", "missing")).toEqual([...IDS]);
  });

  it("swaps two widgets, leaving the rest in place", () => {
    expect(swap([...IDS], "clock", "tasks")).toEqual(["tasks", "weather", "clock", "vault"]);
    expect(swap([...IDS], "clock", "missing")).toEqual([...IDS]);
  });

  it("nudges past hidden widgets and stops at the ends", () => {
    expect(nudge([...IDS], ["weather"], "clock", 1)).toEqual(["weather", "tasks", "clock", "vault"]);
    expect(nudge([...IDS], [], "clock", -1)).toEqual([...IDS]);
    expect(nudge([...IDS], [], "vault", 1)).toEqual([...IDS]);
  });
});

describe("hiding and sizing", () => {
  const layout = normalizeLayout(null, IDS);

  it("hides and shows", () => {
    const hidden = setHidden(layout, "tasks", true);
    expect(hidden.hidden).toEqual(["tasks"]);
    expect(setHidden(hidden, "tasks", false).hidden).toEqual([]);
  });

  it("stores only sizes that differ from the default", () => {
    const wide = setSize(layout, "clock", 2);
    expect(wide.sizes).toEqual({ clock: 2 });
    expect(setSize(wide, "clock", 1).sizes).toEqual({});
    expect(setSize(layout, "tasks", 2, 2).sizes).toEqual({});
  });
});
