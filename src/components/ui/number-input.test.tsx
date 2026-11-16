import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NumberInput } from "./number-input";

function Harness({ initial = "", ...props }: { initial?: string; min?: number; max?: number; step?: string }) {
  const [value, setValue] = useState(initial);
  return <NumberInput aria-label="n" value={value} onChange={(e) => setValue(e.target.value)} {...props} />;
}

const input = () => screen.getByLabelText("n") as HTMLInputElement;

describe("NumberInput", () => {
  it("steps with the arrow buttons and clamps at min and max", () => {
    render(<Harness initial="1" max={2} />);
    const up = screen.getByRole("button", { name: "Increase" });
    const down = screen.getByRole("button", { name: "Decrease" });
    fireEvent.click(up);
    expect(input().value).toBe("2");
    expect(up).toBeDisabled();
    fireEvent.click(down);
    fireEvent.click(down);
    expect(input().value).toBe("0");
    expect(down).toBeDisabled();
  });

  it("clamps a typed negative to min", () => {
    render(<Harness initial="3" min={1} />);
    fireEvent.change(input(), { target: { value: "-5" } });
    expect(input().value).toBe("1");
  });

  it("allows clearing while typing", () => {
    render(<Harness initial="3" />);
    fireEvent.change(input(), { target: { value: "" } });
    expect(input().value).toBe("");
  });

  it("steps with the ArrowUp and ArrowDown keys", () => {
    render(<Harness initial="0.5" step="0.25" />);
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().value).toBe("0.75");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().value).toBe("0");
  });

  it("blocks the minus key when min is not negative", () => {
    render(<Harness initial="2" />);
    expect(fireEvent.keyDown(input(), { key: "-" })).toBe(false);
  });
});
