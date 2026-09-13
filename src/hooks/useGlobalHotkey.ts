import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";

/** Mirrors `HotkeyStatus` in src-tauri/src/hotkey.rs. */
export interface HotkeyStatus {
  accelerator: string;
  registered: boolean;
  error: string | null;
}

/** Emitted by Rust after the hotkey shows and focuses the window. */
const OPEN_PALETTE_EVENT = "palette://open";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

/**
 * Desktop global hotkey. Calls `onOpen` whenever the hotkey summons the
 * window, and toasts once if the saved combo failed to register at startup.
 * A no-op on the web: `status` stays null and nothing from `@tauri-apps/*` is
 * loaded.
 */
export function useGlobalHotkey(onOpen: () => void) {
  const [status, setStatus] = useState<HotkeyStatus | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) =>
      listen(OPEN_PALETTE_EVENT, () => onOpenRef.current()).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    );

    invoke<HotkeyStatus>("get_global_shortcut").then((s) => {
      if (cancelled) return;
      setStatus(s);
      if (s.error) {
        toast.error("Global hotkey unavailable", {
          description: `${s.error}. Pick another combo from the command palette.`,
        });
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /** Throws the Rust error message if the combo cannot be registered. */
  const setAccelerator = useCallback(async (accelerator: string) => {
    try {
      const next = await invoke<HotkeyStatus>("set_global_shortcut", { accelerator });
      setStatus(next);
      return next;
    } catch (err) {
      // Rust restores the previous combo; refresh so `registered` is accurate.
      invoke<HotkeyStatus>("get_global_shortcut").then(setStatus, () => {});
      throw new Error(typeof err === "string" ? err : String(err));
    }
  }, []);

  const pause = useCallback(async (paused: boolean) => {
    try {
      await invoke("pause_global_shortcut", { paused });
    } catch (err) {
      if (!paused) toast.error("Global hotkey unavailable", { description: String(err) });
    }
  }, []);

  return { status, setAccelerator, pause };
}
