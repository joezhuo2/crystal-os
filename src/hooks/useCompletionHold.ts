import { useCallback, useEffect, useRef, useState } from "react";

/** How long a just-checked card stays put, showing its check, before it is saved and moves. */
export const COMPLETION_HOLD_MS = 600;
/** Reopening is quicker: long enough to see the check undraw before the card moves back. */
export const REOPEN_HOLD_MS = 250;

/**
 * Checking or unchecking a task card with a short hold (v0.10.0): the check
 * and strikethrough draw (or undraw) at once, and the change is saved only
 * when the hold ends, so the card stays put long enough to see it. A second
 * click during the hold cancels it and nothing is written. If the card
 * unmounts mid-hold (a view swap), the change is saved then, so it is never
 * lost.
 *
 * When `still` (performance mode or the OS reduced motion setting) there is
 * no hold: the change saves at once, as before.
 */
export function useCompletionHold({
  completed,
  still,
  complete,
  reopen,
}: {
  completed: boolean;
  still: boolean;
  complete: () => void;
  reopen: () => void;
}) {
  // The state the card is on its way to, while the hold runs.
  const [target, setTarget] = useState<boolean | null>(null);
  const timer = useRef<number>();
  // The latest callbacks, so a save at the end of the hold uses current data.
  const actions = useRef({ complete, reopen });
  actions.current = { complete, reopen };
  const pending = useRef<"complete" | "reopen" | null>(null);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const action = pending.current;
    pending.current = null;
    if (action) actions.current[action]();
  }, []);

  useEffect(() => flush, [flush]);

  const toggle = () => {
    if (target !== null) {
      window.clearTimeout(timer.current);
      pending.current = null;
      setTarget(null);
      return;
    }
    const action = completed ? "reopen" : "complete";
    if (still) {
      actions.current[action]();
      return;
    }
    pending.current = action;
    setTarget(!completed);
    timer.current = window.setTimeout(() => {
      setTarget(null);
      flush();
    }, completed ? REOPEN_HOLD_MS : COMPLETION_HOLD_MS);
  };

  return { done: target ?? completed, holding: target !== null, toggle };
}
