import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, PenLine } from "lucide-react";
import { useNow } from "@/hooks/useOrbitReview";
import { useCreateNote, useRawNote, useSaveNote, useVaultNotes, vaultErrorCode } from "@/hooks/useVault";
import { EMPTY_ENTRY, MOODS, dailyNotePath, mergeToday, parseToday, pickDailyFolder, type TodayEntry } from "@/lib/dailyNote";
import { toLocalDateStr } from "@/lib/utils";

const MOOD_LABELS: Record<(typeof MOODS)[number], string> = {
  rough: "Rough",
  low: "Low",
  okay: "Okay",
  good: "Good",
  great: "Great",
};

/**
 * Today's focus, mood, and reflection, written into the vault's daily note.
 * The note is the only store: the card reads it on open and merges its own
 * block back in, so whatever else is in the note is left as it was.
 */
export function TodayCard({ focusOnMount }: { focusOnMount: boolean }) {
  const now = useNow();
  const day = toLocalDateStr(now);
  // Same query as the review's note count, so the list is shared, not refetched.
  const notes = useVaultNotes({ limit: 1_000_000 });
  const folder = notes.data ? pickDailyFolder(notes.data.notes.map((n) => n.path)) : null;
  const path = folder === null ? null : dailyNotePath(folder, day);

  const raw = useRawNote(path);
  const missing = raw.isError && vaultErrorCode(raw.error) === "not_found";
  const save = useSaveNote();
  const create = useCreateNote();
  const pending = save.isPending || create.isPending;

  const [entry, setEntry] = useState<TodayEntry>(EMPTY_ENTRY);
  const [dirty, setDirty] = useState(false);

  // A new day starts a blank entry.
  useEffect(() => {
    setEntry(EMPTY_ENTRY);
    setDirty(false);
  }, [path]);

  // Fill the form from the note, but never over something being typed.
  useEffect(() => {
    if (raw.data && !dirty) setEntry(parseToday(raw.data.content));
  }, [raw.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    sectionRef.current?.scrollIntoView({ block: "nearest" });
    focusRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  const edit = (patch: Partial<TodayEntry>) => {
    setEntry((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };

  const onSaved = (savedPath: string) => {
    setDirty(false);
    void raw.refetch();
    toast.success("Saved to today's note", { description: savedPath });
  };

  const onFailed = (err: Error) => {
    if (vaultErrorCode(err) === "conflict") {
      // Changed (or created) in Obsidian since it was read: reload the file and
      // keep the entry, so the next save merges into the newer note.
      void raw.refetch();
      toast.error("Today's note changed in Obsidian", { description: "Reloaded it. Save again to add your entry." });
      return;
    }
    toast.error("Could not save today's note", { description: err.message });
  };

  const submit = () => {
    if (!path) return;
    if (raw.data) {
      save.mutate(
        { path, content: mergeToday(raw.data.content, entry), expectedMtime: raw.data.mtime },
        { onSuccess: (res) => onSaved(res.path), onError: onFailed },
      );
    } else if (missing) {
      create.mutate(
        { path, content: mergeToday(null, entry), overwrite: false },
        { onSuccess: (res) => onSaved(res.path), onError: onFailed },
      );
    }
  };

  const vaultError = notes.isError || (raw.isError && !missing);
  const ready = !!path && (!!raw.data || missing);

  return (
    <section ref={sectionRef} className="orbit-card orbit-today" aria-labelledby="orbit-today">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="orbit-card-title">
          <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
          <span id="orbit-today">Today</span>
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>

      {vaultError ? (
        <p className="text-sm text-muted-foreground">
          {notes.isError
            ? "Connect a vault in Settings to keep a daily note."
            : `Couldn't open today's note: ${(raw.error as Error).message}`}
        </p>
      ) : (
        <form
          className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2.5 min-w-0">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Focus</span>
              <input
                ref={focusRef}
                value={entry.focus}
                onChange={(e) => edit({ focus: e.target.value })}
                maxLength={200}
                placeholder="The one thing today is for"
                className="orbit-textarea"
                disabled={!ready}
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Mood">
              <span className="text-xs text-muted-foreground mr-1">Mood</span>
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={entry.mood === m}
                  onClick={() => edit({ mood: entry.mood === m ? null : m })}
                  className={`orbit-chip ${entry.mood === m ? "orbit-chip-on" : ""}`}
                  disabled={!ready}
                >
                  {MOOD_LABELS[m]}
                </button>
              ))}
            </div>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Reflection (optional)</span>
              <input
                value={entry.reflection}
                onChange={(e) => edit({ reflection: e.target.value })}
                maxLength={280}
                placeholder="One line before the day ends"
                className="orbit-textarea"
                disabled={!ready}
              />
            </label>
          </div>
          <div className="flex flex-col gap-1.5 md:items-end min-w-0">
            <button type="submit" className="orbit-button" disabled={!ready || pending}>
              {pending || !ready ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PenLine className="w-4 h-4" aria-hidden="true" />}
              Save to daily note
            </button>
            {path && (
              <p className="text-[11px] text-muted-foreground truncate max-w-full" title={path}>
                {dirty ? "Unsaved · " : ""}
                {path}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
