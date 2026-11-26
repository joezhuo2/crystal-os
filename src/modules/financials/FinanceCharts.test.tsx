import { describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { LineAreaChart } from "./FinanceCharts";

// jsdom has no PointerEvent, which would drop clientX from fireEvent.pointerMove.
if (!window.PointerEvent) window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;

const data = [
  { day: "Mon", spent: 10 },
  { day: "Tue", spent: 20 },
];

describe("LineAreaChart hover", () => {
  it("stops the halo pulse once the hover marker has faded out, and restarts it on the next hover", () => {
    const { container } = render(
      <LineAreaChart width={300} height={200} data={data} labelKey="day" series={[{ key: "spent", name: "Spent", color: "red" }]} animate label="Spending" />,
    );
    const rect = container.querySelector("rect") as SVGRectElement;
    rect.getBoundingClientRect = () => ({ left: 0, width: 232 }) as DOMRect;
    fireEvent.pointerMove(rect, { clientX: 10 });
    expect(container.querySelector(".chart-hover-halo")).not.toBeNull();

    fireEvent.pointerLeave(rect);
    const marker = container.querySelector("g[pointer-events='none']") as SVGGElement;
    expect(marker.style.opacity).toBe("0");
    const child = new Event("transitionend", { bubbles: true });
    Object.assign(child, { propertyName: "transform" });
    act(() => void marker.querySelector("line")!.dispatchEvent(child));
    expect(container.querySelector(".chart-hover-halo")).not.toBeNull();
    const fade = new Event("transitionend", { bubbles: true });
    Object.assign(fade, { propertyName: "opacity" });
    act(() => void marker.dispatchEvent(fade));
    expect(container.querySelector(".chart-hover-halo")).toBeNull();

    fireEvent.pointerMove(rect, { clientX: 10 });
    expect(container.querySelector(".chart-hover-halo")).not.toBeNull();
  });
});
