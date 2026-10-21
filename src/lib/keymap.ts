import { useSyncExternalStore } from "react";
import { formatAccelerator } from "@/lib/hotkey";
import { ARCHIVE_KEYS } from "@/lib/keymaps/archive";
import { ENGINE_KEYS } from "@/lib/keymaps/engine";
import { GENERAL_KEYS } from "@/lib/keymaps/general";
import { HORIZON_KEYS } from "@/lib/keymaps/horizon";
import { NEBULA_KEYS } from "@/lib/keymaps/nebula";
import { ORBIT_KEYS } from "@/lib/keymaps/orbit";
import { TERMINAL_KEYS } from "@/lib/keymaps/terminal";

export type KeymapCategory = "general" | "engine" | "horizon" | "archive" | "nebula" | "terminal" | "orbit";

export interface KeymapAction {
  id: string;
  category: KeymapCategory;
  title: string;
  defaultKey: string;
}

export const KEYMAP_CATEGORY_LABELS: Record<KeymapCategory, string> = {
  general: "General",
  engine: "The Engine",
  horizon: "The Horizon",
  archive: "The Archive",
  nebula: "The Nebula",
  terminal: "Terminal",
  orbit: "The Orbit",
};

export const KEYMAP: KeymapAction[] = [
  ...GENERAL_KEYS,
  ...ENGINE_KEYS,
  ...HORIZON_KEYS,
  ...ARCHIVE_KEYS,
  ...NEBULA_KEYS,
  ...TERMINAL_KEYS,
  ...ORBIT_KEYS,
];

export const KEYMAP_KEY = "crystal-os-keymap";

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight",
]);

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

export function bindingFromEvent(e: KeyLike): string | null {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
  return [...mods, e.code].join("+");
}

export function formatBinding(binding: string): string {
  return formatAccelerator(binding).replace(/\bSlash$/, "/").replace(/\bBracketLeft$/, "[").replace(/\bBracketRight$/, "]");
}

export function shortcutBlocked(e: Pick<KeyboardEvent, "target" | "defaultPrevented" | "isComposing">): boolean {
  if (e.defaultPrevented || e.isComposing) return true;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), .xterm")) return true;
  return document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']") !== null;
}

function readOverrides(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEYMAP_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

let overrides = readOverrides();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bindingFor(id: string): string | undefined {
  return overrides[id] ?? KEYMAP.find((a) => a.id === id)?.defaultKey;
}

export function setBinding(id: string, binding: string | null) {
  const next = { ...overrides };
  if (binding === null || binding === KEYMAP.find((a) => a.id === id)?.defaultKey) delete next[id];
  else next[id] = binding;
  overrides = next;
  try {
    localStorage.setItem(KEYMAP_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the rebind still applies for this session.
  }
  listeners.forEach((l) => l());
}

export function useKeymapOverrides(): Record<string, string> {
  return useSyncExternalStore(subscribe, () => overrides);
}
