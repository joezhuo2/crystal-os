import { describe, expect, it } from "vitest";
import {
  EMPTY_LAYOUT,
  MAX_PANES,
  type Layout,
  clampRatio,
  dropOnPane,
  effectiveZone,
  mapPanes,
  measure,
  paneKeys,
  removePane,
  selectPane,
  setRatio,
  zoneAt,
  zoneRect,
} from "./terminalLayout";

const single = (key: string): Layout => ({ root: { type: "pane", key }, focused: key });

/** a | b, then c below b, then d right of a. */
function four(): Layout {
  let layout = single("a");
  layout = dropOnPane(layout, "b", "a", "right");
  layout = dropOnPane(layout, "c", "b", "bottom");
  return dropOnPane(layout, "d", "a", "right");
}

describe("selectPane", () => {
  it("starts the layout from nothing", () => {
    expect(selectPane(EMPTY_LAYOUT, "a")).toEqual(single("a"));
  });

  it("replaces the only pane", () => {
    expect(selectPane(single("a"), "b")).toEqual(single("b"));
  });

  it("focuses a pane already on screen without moving it", () => {
    const split = dropOnPane(single("a"), "b", "a", "right");
    const next = selectPane(split, "a");
    expect(next.root).toEqual(split.root);
    expect(next.focused).toBe("a");
  });

  it("puts an off-screen tab in the focused pane's place", () => {
    const split = selectPane(dropOnPane(single("a"), "b", "a", "right"), "a");
    const next = selectPane(split, "c");
    expect(paneKeys(next.root)).toEqual(["c", "b"]);
    expect(next.focused).toBe("c");
  });
});

describe("dropOnPane", () => {
  it("splits side by side on the left and right edges", () => {
    const right = dropOnPane(single("a"), "b", "a", "right");
    expect(right.root).toMatchObject({ type: "split", dir: "row", ratio: 0.5 });
    expect(paneKeys(right.root)).toEqual(["a", "b"]);
    expect(right.focused).toBe("b");
    expect(paneKeys(dropOnPane(single("a"), "b", "a", "left").root)).toEqual(["b", "a"]);
  });

  it("stacks on the top and bottom edges", () => {
    const bottom = dropOnPane(single("a"), "b", "a", "bottom");
    expect(bottom.root).toMatchObject({ type: "split", dir: "col" });
    expect(paneKeys(bottom.root)).toEqual(["a", "b"]);
    expect(paneKeys(dropOnPane(single("a"), "b", "a", "top").root)).toEqual(["b", "a"]);
  });

  it("ignores a pane dropped on itself", () => {
    const layout = single("a");
    expect(dropOnPane(layout, "a", "a", "right")).toBe(layout);
  });

  it("replaces the target in the middle", () => {
    const split = dropOnPane(single("a"), "b", "a", "right");
    expect(paneKeys(dropOnPane(split, "c", "a", "center").root)).toEqual(["c", "b"]);
  });

  it("swaps two on-screen panes in the middle", () => {
    const split = dropOnPane(single("a"), "b", "a", "right");
    expect(paneKeys(dropOnPane(split, "b", "a", "center").root)).toEqual(["b", "a"]);
  });

  it("moves an on-screen pane without adding one", () => {
    const split = dropOnPane(single("a"), "b", "a", "right");
    const moved = dropOnPane(split, "b", "a", "bottom");
    expect(moved.root).toMatchObject({ type: "split", dir: "col" });
    expect(paneKeys(moved.root)).toEqual(["a", "b"]);
  });

  it(`holds up to ${MAX_PANES} panes`, () => {
    const layout = four();
    expect(paneKeys(layout.root)).toEqual(["a", "d", "b", "c"]);
    // A fifth tab can only take a pane's place.
    expect(effectiveZone(layout, "e", "a", "left")).toBe("center");
    const next = dropOnPane(layout, "e", "a", "left");
    expect(paneKeys(next.root)).toEqual(["e", "d", "b", "c"]);
    // Rearranging the four still splits.
    expect(effectiveZone(layout, "d", "c", "right")).toBe("right");
    expect(paneKeys(dropOnPane(layout, "d", "c", "right").root)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("removePane", () => {
  it("collapses the split and focuses the neighbour", () => {
    const split = dropOnPane(single("a"), "b", "a", "right");
    expect(removePane(split, "b")).toEqual(single("a"));
  });

  it("keeps focus on a pane that stays", () => {
    const layout = four();
    const next = removePane(selectPane(layout, "c"), "a");
    expect(paneKeys(next.root)).toEqual(["d", "b", "c"]);
    expect(next.focused).toBe("c");
  });

  it("falls back when the last pane goes", () => {
    expect(removePane(single("a"), "a", "b")).toEqual(single("b"));
    expect(removePane(single("a"), "a")).toEqual(EMPTY_LAYOUT);
  });

  it("leaves the layout alone for an off-screen tab", () => {
    const layout = single("a");
    expect(removePane(layout, "z")).toBe(layout);
  });
});

describe("mapPanes", () => {
  it("renames and prunes leaves", () => {
    const root = four().root;
    const renamed = mapPanes(root, (k) => (k === "b" ? null : k.toUpperCase()));
    expect(paneKeys(renamed)).toEqual(["A", "D", "C"]);
  });
});

describe("measure", () => {
  it("lays out a 2×2 grid", () => {
    let layout = dropOnPane(single("a"), "b", "a", "right");
    layout = dropOnPane(layout, "c", "a", "bottom");
    layout = dropOnPane(layout, "d", "b", "bottom");
    const { panes, dividers } = measure(layout.root);
    expect(panes.get("a")).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(panes.get("c")).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    expect(panes.get("b")).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(panes.get("d")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(dividers.map((d) => [d.path, d.dir])).toEqual([
      ["", "row"],
      ["a", "col"],
      ["b", "col"],
    ]);
  });

  it("measures nothing for an empty layout", () => {
    expect(measure(null).panes.size).toBe(0);
  });
});

describe("setRatio", () => {
  it("resizes the split at a path, clamped", () => {
    let layout = dropOnPane(single("a"), "b", "a", "right");
    layout = dropOnPane(layout, "c", "b", "bottom");
    const root = setRatio(setRatio(layout.root, "", 0.7), "b", 0.99);
    expect(root).toMatchObject({ ratio: 0.7, b: { ratio: 0.85 } });
  });

  it("clamps bad ratios", () => {
    expect(clampRatio(0)).toBe(0.15);
    expect(clampRatio(Number.NaN)).toBe(0.5);
  });
});

describe("zones", () => {
  it("picks the nearest edge, or the middle", () => {
    expect(zoneAt(0.1, 0.5)).toBe("left");
    expect(zoneAt(0.9, 0.5)).toBe("right");
    expect(zoneAt(0.5, 0.05)).toBe("top");
    expect(zoneAt(0.5, 0.95)).toBe("bottom");
    expect(zoneAt(0.5, 0.5)).toBe("center");
  });

  it("outlines the half a drop would fill", () => {
    const rect = { x: 0.5, y: 0, w: 0.5, h: 1 };
    expect(zoneRect(rect, "left")).toEqual({ x: 0.5, y: 0, w: 0.25, h: 1 });
    expect(zoneRect(rect, "bottom")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(zoneRect(rect, "center")).toEqual(rect);
  });
});
