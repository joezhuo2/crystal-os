import { useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_MOOD_LABELS, MOODS, MOOD_TAGS } from "@/lib/dailyNote";
import { orbitStore, useOrbitStore } from "@/lib/orbitStore";

const TAG_MAX = 24;

export function MoodSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { moodLabels, moodTags } = useOrbitStore();
  const [tag, setTag] = useState("");
  const clean = tag.trim().toLowerCase().replace(/,/g, "");

  const addTag = () => {
    if (!clean || moodTags.includes(clean)) return;
    orbitStore.setMoodTags([...moodTags, clean]);
    setTag("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="orbit-dialog max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="orbit-title text-lg">Moods and tags</DialogTitle>
          <DialogDescription className="text-xs">
            Rename the five moods, lowest to highest, and choose the tags offered in Today. Saved on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <p className="orbit-card-title">Moods</p>
            <button type="button" className="orbit-icon-button" aria-label="Reset mood names" onClick={() => orbitStore.setMoodLabels({ ...DEFAULT_MOOD_LABELS })}>
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          {MOODS.map((mood, i) => (
            <label key={mood} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-4 tabular-nums">{i + 1}</span>
              <input
                value={moodLabels[mood]}
                onChange={(e) => orbitStore.setMoodLabels({ ...moodLabels, [mood]: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && orbitStore.setMoodLabels({ ...moodLabels, [mood]: DEFAULT_MOOD_LABELS[mood] })}
                maxLength={TAG_MAX}
                aria-label={`Mood ${i + 1} name`}
                className="orbit-textarea flex-1"
              />
            </label>
          ))}
        </div>

        <div className="grid gap-2 border-t border-[hsl(var(--orbit-ice)/0.12)] pt-4">
          <div className="flex items-center justify-between">
            <p className="orbit-card-title">Tags</p>
            <button type="button" className="orbit-icon-button" aria-label="Reset tags" onClick={() => orbitStore.setMoodTags([...MOOD_TAGS])}>
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {moodTags.length === 0 && <p className="orbit-empty">No tags.</p>}
            {moodTags.map((t) => (
              <span key={t} className="orbit-chip text-[11px] inline-flex items-center gap-1">
                {t}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => orbitStore.setMoodTags(moodTags.filter((x) => x !== t))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTag();
            }}
          >
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={TAG_MAX}
              placeholder="New tag"
              aria-label="New tag"
              className="orbit-textarea flex-1"
            />
            <button type="submit" className="orbit-button" disabled={!clean || moodTags.includes(clean)}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
