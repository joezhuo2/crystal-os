import type { KeymapAction } from "@/lib/keymap";

export const SEARCH_ACTION_ID = "general.openSearch";

export const GENERAL_KEYS: KeymapAction[] = [
  { id: SEARCH_ACTION_ID, category: "general", title: "Open search bar", defaultKey: "Ctrl+KeyK" },
  { id: "general.nextPage", category: "general", title: "Next page", defaultKey: "KeyJ" },
  { id: "general.previousPage", category: "general", title: "Previous page", defaultKey: "KeyK" },
];
