import { useEffect } from "react";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";
import { TRAY_CHECK_UPDATE_EVENT } from "@/lib/tray";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Asks the release endpoint for a newer version once per load and, when one
 * exists, shows a toast that offers to install it. Silent when up to date or
 * when the check fails. A no-op on the web.
 */
export function useUpdateNotice() {
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;

    let unlisten: (() => void) | undefined;

    const check = async (manual: boolean) => {
      const { checkForUpdate, downloadUpdate, installUpdate } = await import("@/lib/installerNative");
      const update = await checkForUpdate();
      if (cancelled) return;
      if (!update) {
        if (manual) toast("Crystal OS is up to date");
        return;
      }
      const ready = await downloadUpdate().then(
        () => true,
        () => false,
      );
      if (cancelled) return;
      toast(ready ? `Crystal OS ${update.version} is ready to install` : `Crystal OS ${update.version} is available`, {
        id: "update-available",
        description: ready
          ? `You are on ${update.currentVersion}. The update is downloaded; restart to finish, now or later from Settings.`
          : `You are on ${update.currentVersion}. Install it now, or later from Settings.`,
        duration: Infinity,
        action: {
          label: ready ? "Restart to update" : "Update now",
          onClick: () => {
            toast.loading(ready ? "Installing update. Crystal OS will restart." : "Downloading update. Crystal OS will restart.");
            installUpdate().catch((err) =>
              toast.error("Update failed", { description: errorText(err) }),
            );
          },
        },
      });
    };

    check(false).catch(() => {});
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen(TRAY_CHECK_UPDATE_EVENT, () => {
        check(true).catch((err) => toast.error("Could not check for updates", { description: errorText(err) }));
      }).then((fn) => {
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
