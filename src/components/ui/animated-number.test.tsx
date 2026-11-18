import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AnimatedNumber, easeOut, interpolate } from "./animated-number";

describe("AnimatedNumber", () => {
  it("eases out and clamps", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(interpolate(10, 20, 2)).toBe(20);
    expect(interpolate(20, 10, -1)).toBe(20);
  });

  it("always reads out the final value, whatever frame is showing", () => {
    const { container, rerender } = render(<AnimatedNumber value={5} />);
    rerender(<AnimatedNumber value={1200} format={(n) => `$${Math.round(n)}`} />);
    expect(container.querySelector(".sr-only")!.textContent).toBe("$1200");
    expect(container.querySelector("[aria-hidden]")!.textContent).toMatch(/^\$\d+$/);
  });
});
