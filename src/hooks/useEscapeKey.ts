import { useEffect, useRef } from "react";

/**
 * Stack of active Escape handlers. Only the most recently mounted (topmost)
 * overlay closes on each press, so stacked overlays peel off one at a time.
 */
const stack: { current: () => void }[] = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.isComposing) return;
  // Radix layers and nested popups consume Escape themselves.
  if (e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.current();
}

/** Call `onEscape` when Escape is pressed while this overlay is the topmost one. */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const entry = { current: () => handler.current() };
    stack.push(entry);
    if (stack.length === 1) document.addEventListener("keydown", onKeyDown);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);
}
