import { useEffect, useRef } from "react";
import { bindingFor, bindingFromEvent, shortcutBlocked, useKeymapOverrides } from "@/lib/keymap";

export function useShortcut(id: string, handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const overrides = useKeymapOverrides();

  useEffect(() => {
    if (!enabled) return;
    const binding = bindingFor(id);
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || bindingFromEvent(e) !== binding || shortcutBlocked(e)) return;
      e.preventDefault();
      handlerRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id, enabled, overrides]);
}
