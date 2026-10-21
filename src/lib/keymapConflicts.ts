import type { KeymapAction } from "@/lib/keymap";

export function findConflict(
  actions: readonly KeymapAction[],
  action: KeymapAction,
  binding: string,
  bindingOf: (id: string) => string | undefined,
): KeymapAction | undefined {
  return actions.find(
    (other) =>
      other.id !== action.id &&
      (other.category === action.category || other.category === "general" || action.category === "general") &&
      bindingOf(other.id) === binding,
  );
}
