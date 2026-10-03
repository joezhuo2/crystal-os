import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import HomeGrid, { type HomeWidget } from "./HomeGrid";
import { HOME_LAYOUT_KEY } from "@/lib/homeLayout";

const opened = vi.fn();

const widgets: HomeWidget[] = ["a", "b", "c"].map((id) => ({
  id,
  label: `Widget ${id.toUpperCase()}`,
  render: () => (
    <div onClick={() => opened(id)}>
      <p>Box {id}</p>
      <button type="button">Action {id}</button>
    </div>
  ),
}));

const order = () => Array.from(document.querySelectorAll("[data-home-tile]")).map((el) => el.getAttribute("data-home-tile"));

/** Lay the tiles out in a row, 100px wide each, since jsdom has no layout. */
function mockRects() {
  document.querySelectorAll<HTMLElement>("[data-home-tile]").forEach((el) => {
    const index = () => order().indexOf(el.getAttribute("data-home-tile"));
    el.getBoundingClientRect = () =>
      ({ left: index() * 100, right: index() * 100 + 90, top: 0, bottom: 90, width: 90, height: 90 }) as DOMRect;
    Object.defineProperties(el, {
      offsetLeft: { configurable: true, get: () => index() * 100 },
      offsetTop: { configurable: true, get: () => 0 },
      offsetWidth: { configurable: true, get: () => 90 },
      offsetHeight: { configurable: true, get: () => 90 },
    });
  });
}

function pointer(type: string, target: EventTarget, x: number, y = 10) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.assign(event, { pointerId: 1, isPrimary: true });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("HomeGrid", () => {
  beforeEach(async () => {
    localStorage.clear();
    opened.mockClear();
    // A drop arms a one-shot click blocker that a timeout disarms; let it run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("reorders when a box is dragged onto another, and saves it", () => {
    render(<HomeGrid widgets={widgets} />);
    mockRects();
    pointer("pointerdown", screen.getByText("Box a"), 10);
    pointer("pointermove", window, 150);
    mockRects();
    pointer("pointerup", window, 150);
    expect(order()).toEqual(["b", "a", "c"]);
    expect(JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY)!).order).toEqual(["b", "a", "c"]);

    // The release must not also open the widget's page.
    fireEvent.click(screen.getByText("Box a"));
    expect(opened).not.toHaveBeenCalled();
  });

  it("swaps with a far tile instead of shifting the ones between", () => {
    render(<HomeGrid widgets={widgets} />);
    mockRects();
    pointer("pointerdown", screen.getByText("Box a"), 10);
    pointer("pointermove", window, 15); // past the threshold, still over its own cell
    pointer("pointermove", window, 250, 120); // below the row: over nothing
    pointer("pointermove", window, 250);
    pointer("pointerup", window, 250);
    expect(order()).toEqual(["c", "b", "a"]);
  });

  it("doesn't swap again when the reflow puts another tile under a still pointer", () => {
    render(<HomeGrid widgets={widgets} />);
    mockRects();
    pointer("pointerdown", screen.getByText("Box a"), 10);
    // Uneven tiles: once "a" and "b" swap, "c" reflows to cover the pointer's spot.
    const c = document.querySelector<HTMLElement>('[data-home-tile="c"]')!;
    Object.defineProperty(c, "offsetLeft", {
      configurable: true,
      get: () => (order()[0] === "b" ? 140 : 200),
    });
    pointer("pointermove", window, 150);
    expect(order()).toEqual(["b", "a", "c"]);
    pointer("pointermove", window, 151);
    expect(order()).toEqual(["b", "a", "c"]);
    pointer("pointerup", window, 151);
  });

  it("doesn't drag from a button inside a widget", () => {
    render(<HomeGrid widgets={widgets} />);
    mockRects();
    pointer("pointerdown", screen.getByText("Action a"), 10);
    pointer("pointermove", window, 150);
    pointer("pointerup", window, 150);
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("treats a press without movement as a click", () => {
    render(<HomeGrid widgets={widgets} />);
    pointer("pointerdown", screen.getByText("Box b"), 110);
    pointer("pointerup", window, 112);
    fireEvent.click(screen.getByText("Box b"));
    expect(opened).toHaveBeenCalledWith("b");
  });

  it("hides, shows and resizes widgets in edit mode", () => {
    render(<HomeGrid widgets={widgets} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit layout" }));

    fireEvent.click(screen.getByRole("button", { name: "Hide Widget B" }));
    expect(order()).toEqual(["a", "c"]);
    fireEvent.click(screen.getByRole("button", { name: "Show Widget B" }));
    expect(order()).toEqual(["a", "b", "c"]); // back in its old place

    fireEvent.click(screen.getByRole("button", { name: "Widget A 3 columns wide" }));
    expect(document.querySelector('[data-home-tile="a"]')!.className).toContain("lg:col-span-3");

    fireEvent.click(screen.getByRole("button", { name: "Move Widget A later" }));
    expect(order()).toEqual(["b", "a", "c"]);

    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(order()).toEqual(["a", "b", "c"]);
    expect(localStorage.getItem(HOME_LAYOUT_KEY)).toBeNull();
  });

  it("restores the saved layout", () => {
    localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify({ order: ["c", "a", "b"], hidden: ["a"], sizes: {} }));
    render(<HomeGrid widgets={widgets} />);
    expect(order()).toEqual(["c", "b"]);
  });
});
