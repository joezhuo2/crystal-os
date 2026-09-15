import { useEffect, useSyncExternalStore } from "react";
import { isDesktop } from "@/lib/platform";
import { onPortalEvent, prunePortal } from "@/lib/portalNative";
import { portal } from "@/lib/portalStore";

let sessionStarted = false;

/**
 * Runs once per app session, on the first Portal visit (desktop only): starts
 * listening for page titles, which drive the unread badges from then on even
 * while another tab is open, and deletes data left by removed apps.
 */
export function startPortalSession() {
  if (sessionStarted || !isDesktop()) return;
  sessionStarted = true;
  onPortalEvent((event) => portal.setTitle(event.id, event.title));
  prunePortal(portal.getState().apps.map((a) => a.id)).catch((err) => console.warn("[portal] prune failed", err));
}

/** Subscribe a component to the shared Portal store. */
export function usePortal() {
  return useSyncExternalStore(portal.subscribe, portal.getState);
}

/**
 * Hides the Portal's native webview while `open` is true. Native webviews draw
 * above all page content, so any dialog or menu that can sit over the Portal
 * frame needs this to be visible.
 */
export function usePortalOcclusion(open: boolean) {
  useEffect(() => {
    if (!open) return;
    return portal.occlude();
  }, [open]);
}
