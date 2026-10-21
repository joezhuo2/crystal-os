import { afterEach, describe, expect, it } from "vitest";
import { bindingFromEvent, formatBinding, shortcutBlocked } from "./keymap";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("bindingFromEvent", () => {
  it("keeps a bare key bare", () => {
    expect(bindingFromEvent(key("KeyN"))).toBe("KeyN");
  });

  it("orders modifiers Ctrl, Alt, Shift, Super", () => {
    expect(bindingFromEvent(key("KeyN", { metaKey: true, shiftKey: true, ctrlKey: true }))).toBe("Ctrl+Shift+Super+KeyN");
  });

  it("ignores a lone modifier", () => {
    expect(bindingFromEvent(key("ShiftLeft", { shiftKey: true }))).toBeNull();
  });
});

describe("formatBinding", () => {
  it("shows letters and symbols plainly", () => {
    expect(formatBinding("Shift+KeyO")).toBe("Shift + O");
    expect(formatBinding("Slash")).toBe("/");
  });
});

describe("shortcutBlocked", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const event = (target: Element) => ({ target, defaultPrevented: false, isComposing: false });

  it("allows keys on the page", () => {
    expect(shortcutBlocked(event(document.body))).toBe(false);
  });

  it("blocks keys typed into a field", () => {
    const input = document.body.appendChild(document.createElement("input"));
    expect(shortcutBlocked(event(input))).toBe(true);
  });

  it("blocks keys while a dialog is open", () => {
    document.body.appendChild(document.createElement("div")).setAttribute("role", "dialog");
    expect(shortcutBlocked(event(document.body))).toBe(true);
  });
});
