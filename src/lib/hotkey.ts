/**
 * Accelerator strings for the desktop global hotkey, in the format the Tauri
 * global-shortcut plugin parses: modifiers first, then one key, joined by `+`
 * (e.g. `Alt+Space`, `Ctrl+Shift+KeyK`).
 */

export const DEFAULT_ACCELERATOR = "Alt+Space";

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight",
]);

/** Keys the plugin accepts by their `KeyboardEvent.code` name. */
const NAMED_CODES = new Set([
  "Space", "Enter", "Tab", "Backspace", "Delete", "Insert", "Home", "End",
  "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Backquote", "Backslash", "BracketLeft", "BracketRight", "Comma", "Equal",
  "Minus", "Period", "Quote", "Semicolon", "Slash",
]);

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

function isSupportedCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || FUNCTION_KEY.test(code) || NAMED_CODES.has(code);
}

export type CaptureResult =
  | { kind: "pending" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; accelerator: string };

/**
 * Build an accelerator from a keydown. A lone modifier is still being held, so
 * it is `pending`. At least one modifier is required, except for F-keys, so a
 * system-wide hotkey can never swallow ordinary typing.
 */
export function acceleratorFromEvent(e: KeyLike): CaptureResult {
  if (MODIFIER_CODES.has(e.code)) return { kind: "pending" };
  if (!isSupportedCode(e.code)) return { kind: "invalid", reason: "That key can't be used in a shortcut" };

  const mods = [
    e.ctrlKey && "Ctrl",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
    e.metaKey && "Super",
  ].filter((m): m is string => Boolean(m));

  if (mods.length === 0 && !FUNCTION_KEY.test(e.code)) {
    return { kind: "invalid", reason: "Add Ctrl, Alt, Shift, or Win" };
  }
  return { kind: "ok", accelerator: [...mods, e.code].join("+") };
}

/** Display form: `Ctrl+Shift+KeyK` becomes `Ctrl + Shift + K`. */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) =>
      part
        .replace(/^Key([A-Z])$/, "$1")
        .replace(/^Digit([0-9])$/, "$1")
        .replace(/^Super$/, "Win"),
    )
    .join(" + ");
}
