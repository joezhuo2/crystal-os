import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNow } from "@/hooks/useOrbitReview";
import { createVaultNote, fetchRawNote, saveVaultNote, vaultErrorCode } from "@/hooks/useVault";
import { mergeToday, type TodayEntry } from "@/lib/dailyNote";
import { pastDrafts, readDrafts, writeDraft } from "@/lib/todayDraft";
import { toLocalDateStr } from "@/lib/utils";

async function saveEntry(path: string, entry: TodayEntry) {
  try {
    const raw = await fetchRawNote(path);
    await saveVaultNote({ path, content: mergeToday(raw.content, entry), expectedMtime: raw.mtime });
  } catch (err) {
    if (vaultErrorCode(err) !== "not_found") throw err;
    await createVaultNote({ path, content: mergeToday(null, entry), overwrite: false });
  }
}

/**
 * Mounted while Settings → The Orbit → Auto-save daily note is on. Once a day
 * is over (at midnight, or the next time the app opens) its unsaved Today
 * entry is written to that day's note. A failure keeps the draft for the next try.
 */
export default function OrbitDailyAutoSave() {
  const today = toLocalDateStr(useNow());
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const [day, draft] of pastDrafts(readDrafts(), today)) {
        if (cancelled) return;
        try {
          await saveEntry(draft.path, draft.entry);
          writeDraft(day, null);
          queryClient.invalidateQueries({ queryKey: ["vault"] });
          toast.success(`Saved the Today entry for ${day}`, { description: draft.path });
        } catch (err) {
          console.warn("[crystal-os] Daily note auto-save failed:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today, queryClient]);

  return null;
}
