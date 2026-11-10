import { afterEach, describe, expect, it, vi } from "vitest";
import { iconEffectName, installButtonFx, pressScale } from "./buttonFx";

describe("iconEffectName", () => {
  it.each([
    ["bell", "ring"],
    ["bell-ring", "ring"],
    ["alarm-clock", "ring"],
    ["trash2", "shake"],
    ["plus", "turn"],
    ["x", "turn"],
    ["circle-x", "turn"],
    ["folder-plus", "bounce"],
    ["refresh-cw", "spin"],
    ["settings2", "spin"],
    ["rotate-ccw", "spinBack"],
    ["send", "send"],
    ["star", "pop"],
    ["sparkles", "pop"],
    ["download", "down"],
    ["external-link", "right"],
    ["undo2", "left"],
    ["chevron-down", "down"],
    ["chevron-left", "left"],
    ["corner-left-up", "up"],
    ["arrow-up-narrow-wide", "up"],
    ["save", "bounce"],
    ["notebook-pen", "bounce"],
    ["bookmark-plus", "bounce"],
    ["list-checks", "bounce"],
    ["check", "bounce"],
    ["eye-off", "blink"],
    ["search", "tap"],
  ])("%s -> %s", (icon, effect) => {
    expect(iconEffectName(icon)).toBe(effect);
  });

  it("leaves spinners and drag grips alone", () => {
    expect(iconEffectName("loader-circle")).toBeNull();
    expect(iconEffectName("grip-vertical")).toBeNull();
  });
});

describe("pressScale", () => {
  it("squishes small buttons most and large ones by a few pixels", () => {
    expect(pressScale(36, 36)).toBe(0.95);
    expect(pressScale(400, 48)).toBeCloseTo(0.985);
    expect(pressScale(0, 0)).toBe(0.95);
  });
});

describe("installButtonFx", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.classList.remove("perf-still");
    vi.restoreAllMocks();
  });

  const clickBell = (html: string) => {
    document.body.innerHTML = html;
    const animate = vi.fn((..._args: Parameters<Element["animate"]>) => ({ cancel: vi.fn() }) as unknown as Animation);
    Element.prototype.animate = animate;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    installButtonFx();
    const btn = document.querySelector("button")!;
    btn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    btn.click();
    return animate;
  };
  const bell = '<button><svg class="lucide lucide-bell"></svg></button>';

  it("squishes the button and rings its bell", () => {
    const animate = clickBell(bell);
    const targets = animate.mock.contexts.map((el: Element) => el.tagName.toLowerCase());
    expect(targets).toEqual(["button", "button", "svg"]);
    expect(animate.mock.calls[2][0][1]).toMatchObject({ rotate: "16deg" });
  });

  it("stays still in performance mode and in excluded areas", () => {
    document.documentElement.classList.add("perf-still");
    expect(clickBell(bell)).not.toHaveBeenCalled();
    document.documentElement.classList.remove("perf-still");
    expect(clickBell(`<nav>${bell}</nav>`)).not.toHaveBeenCalled();
    expect(clickBell('<button role="switch"><svg class="lucide lucide-bell"></svg></button>')).not.toHaveBeenCalled();
  });
});
