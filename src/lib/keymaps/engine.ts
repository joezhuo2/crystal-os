import type { KeymapAction } from "@/lib/keymap";

export const ENGINE_KEYS: KeymapAction[] = [
  { id: "engine.cycleView", category: "engine", title: "Switch between list and board", defaultKey: "KeyV" },
  { id: "engine.editCategories", category: "engine", title: "Edit categories", defaultKey: "KeyC" },
];
