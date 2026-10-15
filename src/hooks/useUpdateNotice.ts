import { useEffect } from "react";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";

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

    import("@/lib/installerNative")
      .then(async ({ checkForUpdate, installUpdate }) => {
        const update = await checkForUpdate();
        if (cancelled || !update) return;
        toast(`Crystal OS ${update.version} is available`, {
          description: `You are on ${update.currentVersion}. Install it now, or later from Settings.`,
          duration: Infinity,
          action: {
            label: "Update now",
            onClick: () => {
              toast.loading("Downloading update. Crystal OS will restart.");
              installUpdate().catch((err) =>
                toast.error("Update failed", { description: errorText(err) }),
              );
            },
          },
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);
}
