import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, formatAccelerator } from "./hotkey";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("acceleratorFromEvent", () => {
  it("builds the default combo", () => {
    expect(acceleratorFromEvent(key("Space", { altKey: true }))).toEqual({ kind: "ok", accelerator: "Alt+Space" });
  });

  it("orders modifiers Ctrl, Alt, Shift, Super", () => {
    expect(acceleratorFromEvent(key("KeyK", { shiftKey: true, metaKey: true, ctrlKey: true, altKey: true }))).toEqual({
      kind: "ok",
      accelerator: "Ctrl+Alt+Shift+Super+KeyK",
    });
  });

  it("waits while only a modifier is held", () => {
    expect(acceleratorFromEvent(key("AltLeft", { altKey: true }))).toEqual({ kind: "pending" });
  });

  it("rejects a plain key without a modifier", () => {
    expect(acceleratorFromEvent(key("KeyK")).kind).toBe("invalid");
  });

  it("allows a bare function key", () => {
    expect(acceleratorFromEvent(key("F13"))).toEqual({ kind: "ok", accelerator: "F13" });
  });

  it("rejects keys the plugin cannot parse", () => {
    expect(acceleratorFromEvent(key("IntlBackslash", { ctrlKey: true })).kind).toBe("invalid");
    expect(acceleratorFromEvent(key("F25", { ctrlKey: true })).kind).toBe("invalid");
  });
});

describe("formatAccelerator", () => {
  it("strips code prefixes and names the Windows key", () => {
    expect(formatAccelerator("Ctrl+Super+KeyK")).toBe("Ctrl + Win + K");
    expect(formatAccelerator("Alt+Digit1")).toBe("Alt + 1");
    expect(formatAccelerator("Alt+Space")).toBe("Alt + Space");
  });
});
