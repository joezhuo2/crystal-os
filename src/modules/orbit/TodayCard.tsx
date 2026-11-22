import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, PenLine, Settings2 } from "lucide-react";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { HabitsToday } from "@/modules/orbit/HabitsToday";
import { MoodSettings } from "@/modules/orbit/MoodSettings";
import { useHabitsData } from "@/hooks/useHabits";
import { useNow } from "@/hooks/useOrbitReview";
import { useCreateNote, useRawNote, useSaveNote, useVaultNotes, vaultErrorCode } from "@/hooks/useVault";
import { EMPTY_ENTRY, MOODS, dailyNotePath, mergeToday, parseToday, pickDailyFolder, type TodayEntry } from "@/lib/dailyNote";
import { isActiveOn } from "@/lib/habits";
import { useIsInstalled } from "@/lib/installedModules";
import { useOrbitStore } from "@/lib/orbitStore";
import { readDrafts, writeDraft } from "@/lib/todayDraft";
import { toLocalDateStr } from "@/lib/utils";

/**
 * Today's focus, mood, and reflection, written into the vault's daily note.
 * The note is the only store: the card reads it on open and merges its own
 * block back in, so whatever else is in the note is left as it was.
 *
 * Unsaved typing is kept on this device as a draft until it is saved.
 *
 * Below it, the habits (Supabase, not the note), with a grid of this week or
 * this month as the Weekly/Monthly switch shows.
 */
export function TodayCard({ focusOnMount, kind }: { focusOnMount: boolean; kind: "weekly" | "monthly" }) {
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

  const { moodLabels, moodTags } = useOrbitStore();
  const [moodSettings, setMoodSettings] = useState(false);
  const trading = useIsInstalled("trades");
  const habits = (useHabitsData().data?.habits ?? []).filter((h) => isActiveOn(h, day));

  const [entry, setEntry] = useState<TodayEntry>(EMPTY_ENTRY);
  const [dirty, setDirty] = useState(false);

  // A new day starts from its unsaved draft, or blank.
  useEffect(() => {
    const draft = path ? readDrafts()[day] : undefined;
    const restore = draft?.path === path;
    setEntry(restore ? draft.entry : EMPTY_ENTRY);
    setDirty(restore);
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dirty && path) writeDraft(day, { path, entry });
  }, [entry, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

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
    writeDraft(day, null);
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <GlassTip label="Moods and tags" hint="Rename moods, add or remove tags" tone="orbit">
            <button type="button" className="orbit-icon-button" onClick={() => setMoodSettings(true)} aria-label="Manage moods and tags">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </GlassTip>
        </div>
      </div>
      <MoodSettings open={moodSettings} onOpenChange={setMoodSettings} />

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
                  {moodLabels[m]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mood tags">
              <span className="text-xs text-muted-foreground mr-1">Tags</span>
              {[...new Set([...moodTags, ...(entry.moodTags ?? [])])].map((tag) => {
                const on = !!entry.moodTags?.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      edit({ moodTags: on ? (entry.moodTags ?? []).filter((t) => t !== tag) : [...(entry.moodTags ?? []), tag] })
                    }
                    className={`orbit-chip text-[11px] ${on ? "orbit-chip-on" : ""}`}
                    disabled={!ready}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Mood note (optional)</span>
              <input
                value={entry.moodNote ?? ""}
                onChange={(e) => edit({ moodNote: e.target.value })}
                maxLength={200}
                placeholder="What is behind the mood"
                className="orbit-textarea"
                disabled={!ready}
              />
            </label>
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
            {habits.length > 0 && (
              <fieldset className="grid gap-1.5">
                <legend className="text-xs text-muted-foreground mb-1">Habit notes (optional)</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {habits.map((h) => (
                    <label key={h.id} className="flex items-center gap-2 min-w-0">
                      <span className="orbit-habit-dot shrink-0" style={{ background: h.color }} aria-hidden="true" />
                      <input
                        value={entry.habitNotes?.[h.name] ?? ""}
                        onChange={(e) => edit({ habitNotes: { ...entry.habitNotes, [h.name]: e.target.value } })}
                        maxLength={200}
                        placeholder={h.name}
                        aria-label={`Note for ${h.name}`}
                        className="orbit-textarea flex-1 min-w-0"
                        disabled={!ready}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {trading && (
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Trading notes (optional)</span>
                <textarea
                  value={entry.tradingNotes ?? ""}
                  onChange={(e) => edit({ tradingNotes: e.target.value })}
                  maxLength={4000}
                  rows={4}
                  placeholder="Setups, mistakes, what the market did"
                  className="orbit-textarea resize-y"
                  disabled={!ready}
                />
              </label>
            )}
          </div>
          <div className="flex flex-col gap-1.5 md:items-end min-w-0">
            <button type="submit" className="orbit-button" disabled={!ready || pending}>
              {pending || !ready ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PenLine className="w-4 h-4" aria-hidden="true" />}
              Save to daily note
            </button>
            {path && (
              <GlassTip label={path} hint={dirty ? "Unsaved changes" : "Daily note"} tone="orbit">
                <p className="text-[11px] text-muted-foreground truncate max-w-full">
                  {dirty ? "Unsaved · " : ""}
                  {path}
                </p>
              </GlassTip>
            )}
          </div>
        </form>
      )}

      <HabitsToday kind={kind} today={day} />
    </section>
  );
}
