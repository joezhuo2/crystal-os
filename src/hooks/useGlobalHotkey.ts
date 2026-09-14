import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";
import type { HotkeyAction } from "@/lib/hotkey";

/** Mirrors `HotkeyStatus` in src-tauri/src/hotkey.rs. */
export interface HotkeyStatus {
  accelerator: string;
  registered: boolean;
  error: string | null;
}

/** Mirrors `HotkeyStatuses` in src-tauri/src/hotkey.rs. */
export type HotkeyStatuses = Record<HotkeyAction, HotkeyStatus>;

/** Emitted by Rust after the palette hotkey shows and focuses the window. */
const OPEN_PALETTE_EVENT = "palette://open";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

/**
 * Desktop palette hotkey. Calls `onOpen` whenever the global palette hotkey
 * summons the window, and toasts once for each combo that failed to register
 * at startup. Mount once. A no-op on the web: nothing from `@tauri-apps/*` is
 * loaded.
 */
export function usePaletteHotkey(onOpen: () => void) {
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

    invoke<HotkeyStatuses>("get_global_shortcut").then((statuses) => {
      if (cancelled) return;
      for (const status of Object.values(statuses)) {
        if (status.error) {
          toast.error("Global hotkey unavailable", {
            description: `${status.error}. Pick another combo in Settings.`,
          });
        }
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}

/**
 * Global hotkey and launch-at-login settings for the Settings page. `statuses`
 * and `launchAtLogin` stay null on the web and until Rust reports.
 */
export function useGlobalHotkeys() {
  const [statuses, setStatuses] = useState<HotkeyStatuses | null>(null);
  const [launchAtLogin, setLaunchAtLoginState] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;

    invoke<HotkeyStatuses>("get_global_shortcut").then(
      (s) => !cancelled && setStatuses(s),
      () => {},
    );
    invoke<boolean>("get_launch_at_login").then(
      (enabled) => !cancelled && setLaunchAtLoginState(enabled),
      () => {},
    );

    return () => {
      cancelled = true;
    };
  }, []);

  /** Throws the Rust error message if the combo cannot be registered. */
  const setAccelerator = useCallback(async (action: HotkeyAction, accelerator: string) => {
    try {
      const next = await invoke<HotkeyStatuses>("set_global_shortcut", { action, accelerator });
      setStatuses(next);
      return next;
    } catch (err) {
      // Rust restores the previous combo; refresh so `registered` is accurate.
      invoke<HotkeyStatuses>("get_global_shortcut").then(setStatuses, () => {});
      throw new Error(typeof err === "string" ? err : String(err));
    }
  }, []);

  /** Releases every combo while a new one is recorded, and restores them after. */
  const pause = useCallback(async (paused: boolean) => {
    try {
      await invoke("pause_global_shortcut", { paused });
    } catch (err) {
      if (!paused) toast.error("Global hotkey unavailable", { description: String(err) });
    }
    if (!paused) invoke<HotkeyStatuses>("get_global_shortcut").then(setStatuses, () => {});
  }, []);

  /** Starts Crystal OS hidden in the tray at login so the hotkeys are always live. */
  const setLaunchAtLogin = useCallback(async (enabled: boolean) => {
    try {
      setLaunchAtLoginState(await invoke<boolean>("set_launch_at_login", { enabled }));
    } catch (err) {
      toast.error("Could not change launch at login", { description: String(err) });
      invoke<boolean>("get_launch_at_login").then(setLaunchAtLoginState, () => {});
    }
  }, []);

  return { statuses, setAccelerator, pause, launchAtLogin, setLaunchAtLogin };
}
