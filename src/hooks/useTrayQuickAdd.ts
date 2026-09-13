import { useEffect, useRef } from "react";
import { isDesktop } from "@/lib/platform";
import { TRAY_QUICK_ADD_EVENT } from "@/lib/tray";

/**
 * Calls `onQuickAdd` when "Quick Add…" is picked from the desktop tray. Rust
 * shows and focuses the window before emitting. A no-op on the web.
 */
export function useTrayQuickAdd(onQuickAdd: () => void) {
  const ref = useRef(onQuickAdd);
  ref.current = onQuickAdd;

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) =>
      listen(TRAY_QUICK_ADD_EVENT, () => ref.current()).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
