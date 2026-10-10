import { useEffect } from "react";
import { toast } from "sonner";
import { useNow } from "@/hooks/useOrbitReview";
import { notify } from "@/lib/notifications";
import { useNotifySettings } from "@/lib/notifySettings";
import { periodLabel, readyTitle, reviewsToAnnounce } from "@/lib/orbitReview";
import { orbitStore, useOrbitStore } from "@/lib/orbitStore";

/** One toast at a time: a second one (or React's dev double effect) replaces it. */
export const ORBIT_READY_TOAST_ID = "orbit-review-ready";

/** Long enough to still be there when the window comes back from the tray. */
const TOAST_MS = 30_000;

/**
 * Announces a weekly, monthly or yearly review once, when it becomes ready
 * (6 PM on its last day) or on the next launch if it was not opened by then.
 * Reviews that turn ready together share one toast. An in-app toast with
 * **Open**, plus a native notification while Crystal OS is not focused.
 * Silent while Settings → Notifications → Orbit reviews or Do Not Disturb
 * says so; a review still unopened once they allow it again is announced then.
 * Renders nothing; mounted while signed in.
 */
export default function OrbitReadyNotifier({ onOpen }: { onOpen: () => void }) {
  const now = useNow();
  const { seen, notified } = useOrbitStore();
  const { reviews, doNotDisturb } = useNotifySettings();
  const due = reviews && !doNotDisturb ? reviewsToAnnounce(now, seen, notified) : [];
  const dueKey = due.map((period) => `${period.kind}:${period.key}`).join(",");

  useEffect(() => {
    if (due.length === 0) return;
    orbitStore.markNotified(due);
    const title = readyTitle(due.map((period) => period.kind));
    const body = due.map(periodLabel).join(" · ");
    const first = due[0].kind;
    toast(title, {
      id: ORBIT_READY_TOAST_ID,
      description: body,
      duration: TOAST_MS,
      action: {
        label: "Open",
        onClick: () => {
          // The Orbit opens on the latest ready review of the kind it shows.
          orbitStore.setView(first);
          orbitStore.land(null);
          onOpen();
        },
      },
    });
    // While the window has focus the toast and the nav dot already say it.
    if (!document.hasFocus()) void notify({ title, body });
    // `dueKey` names `due`; a fresh array with the same periods is not news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKey]);

  return null;
}
