import { toast } from "sonner";

/** How long the Undo button stays up after a delete, completion or reschedule. */
export const UNDO_MS = 5000;

/**
 * A toast with an Undo button for 5 s (v0.10.3). The change is already made;
 * `onUndo` puts it back, and runs at most once however often the button is hit.
 */
export function undoToast(title: string, onUndo: () => void, description?: string) {
  let undone = false;
  toast(title, {
    description,
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        if (undone) return;
        undone = true;
        onUndo();
      },
    },
  });
}

/**
 * The fields `updates` changes, as they were on `before`. Applying it puts
 * them back. A field `before` did not have comes back as an explicit
 * undefined, which is how updateTask clears it.
 */
export function restorePatch<T extends object>(before: T, updates: Partial<T>): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(updates) as (keyof T)[]) patch[key] = before[key];
  return patch;
}
