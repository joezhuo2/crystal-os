import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useQuickAdd, useVaultNotes } from "@/hooks/useVault";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NotebookPen,
  Loader2,
  AlertTriangle,
  ChevronDown,
  X,
  Tag as TagIcon,
} from "lucide-react";
import { toast } from "sonner";

const DEFAULT_NOTE_PATH = "Inbox.md";
const DEFAULT_TAG = "inbox";
const MAX_TAGS = 12;
const MAX_SUGGESTIONS = 6;

/** Mirrors the server: strip a leading #, collapse whitespace to hyphens. */
function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/\s+/g, "-");
}

/**
 * Appends a quick capture to the vault. Shared by the command palette and the
 * Archive page, mounted once from GlobalOverlays and driven by showQuickAdd.
 */
export default function QuickAddDialog() {
  const { showQuickAdd, setShowQuickAdd, quickAddDraft, setQuickAddDraft } = useApp();
  const [text, setText] = useState("");
  const [notePath, setNotePath] = useState("");
  const [showPathField, setShowPathField] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const quickAdd = useQuickAdd();

  // Only fetched while the dialog is open; react-query serves it from cache
  // when the Archive page has already loaded the same list.
  const { data: vault } = useVaultNotes({}, showQuickAdd);

  // Seed from whatever was typed in the palette each time the dialog opens.
  useEffect(() => {
    if (showQuickAdd) {
      setText(quickAddDraft);
      setNotePath("");
      setShowPathField(false);
      setTags([]);
      setTagDraft("");
      quickAdd.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQuickAdd]);

  const suggestions = useMemo(() => {
    const all = vault?.allTags ?? [];
    const chosen = new Set(tags.map((t) => t.toLowerCase()));
    const q = normalizeTag(tagDraft).toLowerCase();
    return all
      .filter((t) => !chosen.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q)))
      .slice(0, MAX_SUGGESTIONS);
  }, [vault?.allTags, tags, tagDraft]);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setTagDraft("");
    setTags((prev) =>
      prev.length >= MAX_TAGS || prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev
        : [...prev, tag],
    );
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const close = () => {
    setShowQuickAdd(false);
    setQuickAddDraft("");
  };

  const submit = () => {
    const body = text.trim();
    if (!body || quickAdd.isPending) return;

    // Whatever is half-typed in the tag field counts as a tag too.
    const pending = normalizeTag(tagDraft);
    const finalTags =
      pending && !tags.some((t) => t.toLowerCase() === pending.toLowerCase())
        ? [...tags, pending]
        : tags;

    quickAdd.mutate(
      {
        text: body,
        notePath: notePath.trim() || undefined,
        tags: finalTags.length ? finalTags : undefined,
      },
      {
        onSuccess: (result) => {
          const notes = [
            result.created ? "Created a new note." : null,
            result.tagsAdded.length ? `Tagged ${result.tagsAdded.join(", ")}.` : null,
          ].filter(Boolean);
          toast.success(`Appended to ${result.path}`, {
            description: notes.length ? notes.join(" ") : undefined,
          });
          close();
        },
        // On failure keep the dialog open so the text is never lost.
      },
    );
  };

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (!tagDraft.trim()) return;
      e.preventDefault();
      addTag(tagDraft);
      return;
    }
    if (e.key === "Backspace" && !tagDraft && tags.length) {
      e.preventDefault();
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <Dialog open={showQuickAdd} onOpenChange={(open) => (open ? setShowQuickAdd(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="w-4 h-4 text-primary" />
            Quick Add to Vault
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Capture a thought, a link, a todo…"
            className="min-h-[120px] bg-background/40 resize-none"
          />

          {/* ── Tags: merged into the target note's frontmatter ── */}
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-widest">
              <TagIcon className="w-3 h-3" />
              Tags
            </label>

            <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background/40 px-2 py-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => addTag(tagDraft)}
                disabled={tags.length >= MAX_TAGS}
                placeholder={
                  tags.length >= MAX_TAGS
                    ? `${MAX_TAGS} tags max`
                    : tags.length
                      ? "Add another…"
                      : `${DEFAULT_TAG} (default)`
                }
                className="flex-1 min-w-[8rem] bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed"
              />
            </div>

            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    // Keep focus in the field so its blur handler does not also fire.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(tag)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs transition-colors",
                      "bg-white/5 text-muted-foreground hover:bg-primary/15 hover:text-primary",
                    )}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground/60 mt-1">
              {tags.length
                ? "Merged into the note's frontmatter tags."
                : `New notes are tagged #${DEFAULT_TAG} when you add none.`}
            </p>
          </div>

          {showPathField ? (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-widest">
                Append to
              </label>
              <Input
                value={notePath}
                onChange={(e) => setNotePath(e.target.value)}
                placeholder={DEFAULT_NOTE_PATH}
                className="mt-1 bg-background/40"
              />
              <p className="text-xs text-muted-foreground/60 mt-1">
                Relative to the vault root. Created if it does not exist yet.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPathField(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              Append to {DEFAULT_NOTE_PATH} — change
            </button>
          )}

          {quickAdd.isError && (
            <div className="flex items-start gap-2 rounded-lg p-3 bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{quickAdd.error.message}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground/50">
              <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5">
                ⌘↵
              </kbd>{" "}
              to save
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={close} disabled={quickAdd.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!text.trim() || quickAdd.isPending}>
                {quickAdd.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Append
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
