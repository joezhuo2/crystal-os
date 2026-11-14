import { afterEach, describe, expect, it } from "vitest";
import { bindingFromEvent, formatBinding, isSearchShortcut, searchShortcutLabel, setBinding, shortcutBlocked } from "./keymap";

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

describe("isSearchShortcut", () => {
  const press = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}, target: EventTarget = document.body) =>
    ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, defaultPrevented: false, isComposing: false, target, ...mods });

  afterEach(() => setBinding("general.openSearch", null));

  it("defaults to Ctrl+K and Cmd+K", () => {
    expect(isSearchShortcut(press("KeyK", { ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(press("KeyK", { metaKey: true }))).toBe(true);
    expect(isSearchShortcut(press("KeyK"))).toBe(false);
  });

  it("follows a rebind and drops the old combo", () => {
    setBinding("general.openSearch", "Ctrl+Shift+KeyP");
    expect(isSearchShortcut(press("KeyP", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isSearchShortcut(press("KeyK", { ctrlKey: true }))).toBe(false);
    expect(searchShortcutLabel()).toBe("Ctrl + Shift + P");
  });

  it("ignores a single-key rebind while typing in a field", () => {
    setBinding("general.openSearch", "Slash");
    const input = document.createElement("input");
    document.body.append(input);
    expect(isSearchShortcut(press("Slash"))).toBe(true);
    expect(isSearchShortcut(press("Slash", {}, input))).toBe(false);
    input.remove();
  });
});
