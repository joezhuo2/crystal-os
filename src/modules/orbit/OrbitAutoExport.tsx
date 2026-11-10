import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNow, useOrbitReview } from "@/hooks/useOrbitReview";
import { createVaultNote, vaultErrorCode } from "@/hooks/useVault";
import { REVIEW_KINDS, exportPath, kindLabel, latestReadyPeriod, toMarkdown, type ReviewKind, type ReviewPeriod } from "@/lib/orbitReview";
import { orbitStore, useOrbitStore } from "@/lib/orbitStore";

/**
 * Writes one kind of review to the vault once, when it becomes ready (or on
 * the next launch, if the app was closed then). Never overwrites: a note that
 * already exists counts as done. A failure (no vault, offline) is retried on
 * the next launch or period.
 */
function AutoExportKind({ kind, period }: { kind: ReviewKind; period: ReviewPeriod }) {
  const { autoExported } = useOrbitStore();
  const { review, loading, historyError } = useOrbitReview(period);
  const queryClient = useQueryClient();
  const running = useRef<string | null>(null);
  const done = autoExported[kind] === period.key;

  useEffect(() => {
    // Wait for the full picture; a history error means the numbers would be wrong.
    if (done || loading || !review || historyError || running.current === period.key) return;
    running.current = period.key;
    const path = exportPath(period);
    createVaultNote({ path, content: toMarkdown(review), overwrite: false })
      .then(() => {
        orbitStore.markAutoExported(kind, period.key);
        queryClient.invalidateQueries({ queryKey: ["vault"] });
        toast.success(`${kindLabel(kind)} review exported`, { description: path });
      })
      .catch((err) => {
        if (vaultErrorCode(err) === "conflict") {
          orbitStore.markAutoExported(kind, period.key);
          return;
        }
        console.warn("[crystal-os] Orbit auto-export failed:", err);
      });
  }, [done, loading, review, historyError, period, kind, queryClient]);

  return null;
}

/** Mounted while Settings → The Orbit → Auto-export is on. */
export default function OrbitAutoExport() {
  const now = useNow();
  return (
    <>
      {REVIEW_KINDS.map((kind) => {
        const period = latestReadyPeriod(kind, now);
        return <AutoExportKind key={`${kind}-${period.key}`} kind={kind} period={period} />;
      })}
    </>
  );
}
