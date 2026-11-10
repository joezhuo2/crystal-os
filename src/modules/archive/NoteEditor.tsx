import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Save, X } from "lucide-react";
import { useRawNote, useSaveNote, vaultErrorCode, type RawNote } from "@/hooks/useVault";

/**
 * Unsaved edits, by note path, kept for the life of the window. Switching notes
 * or tabs unmounts the editor; this is what stops that from losing work.
 */
const drafts = new Map<string, { content: string; baseMtime: number }>();

/** Colours come from the theme's CSS variables, so every theme restyles it. */
const editorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "hsl(var(--foreground))", fontSize: "0.875rem" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      fontFamily: '"Cascadia Mono", ui-monospace, monospace',
      caretColor: "hsl(var(--primary))",
      padding: "0.75rem 0",
    },
    ".cm-line": { padding: "0 0.25rem" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--primary))" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "hsl(var(--primary) / 0.25) !important",
    },
    ".cm-activeLine": { backgroundColor: "hsl(var(--primary) / 0.05)" },
    ".cm-scroller": { lineHeight: "1.6" },
  },
  { dark: true },
);

const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700", color: "hsl(var(--foreground))" },
  { tag: t.heading1, fontSize: "1.3em" },
  { tag: t.heading2, fontSize: "1.15em" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "hsl(var(--primary))" },
  { tag: t.monospace, color: "hsl(var(--primary) / 0.9)" },
  { tag: [t.processingInstruction, t.meta, t.quote, t.contentSeparator], color: "hsl(var(--muted-foreground))" },
  { tag: t.list, color: "hsl(var(--primary) / 0.8)" },
]);

export default function NoteEditor({ path, onDone }: { path: string; onDone: () => void }) {
  const { data: raw, isLoading, error, refetch } = useRawNote(path);
  const save = useSaveNote();

  // `base` is the file as it was when editing started; its mtime is what the
  // save checks against.
  const [base, setBase] = useState<RawNote | null>(null);
  const [text, setText] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!raw || base) return;
    const draft = drafts.get(path);
    if (draft) {
      setBase({ ...raw, mtime: draft.baseMtime });
      setText(draft.content);
      if (draft.baseMtime !== raw.mtime) setConflict(true);
      toast.info("Restored your unsaved edits");
    } else {
      setBase(raw);
      setText(raw.content);
    }
  }, [raw, base, path]);

  const dirty = !!base && text !== base.content;

  // Keep the draft in step with the text; a clean editor has nothing to keep.
  useEffect(() => {
    if (!base) return;
    if (dirty) drafts.set(path, { content: text, baseMtime: base.mtime });
    else drafts.delete(path);
  }, [dirty, text, base, path]);

  const write = useCallback(
    (expectedMtime: number) => {
      save.mutate(
        { path, content: text, expectedMtime },
        {
          onSuccess: () => {
            drafts.delete(path);
            toast.success("Note saved");
            onDone();
          },
          onError: (err) => {
            if (vaultErrorCode(err) === "conflict") setConflict(true);
            else toast.error("Could not save the note", { description: err.message });
          },
        },
      );
    },
    [save, path, text, onDone],
  );

  const submit = useCallback(() => {
    if (!base || save.isPending) return;
    if (!dirty) return onDone();
    write(base.mtime);
  }, [base, dirty, save.isPending, write, onDone]);

  /** Save over the newer file on disk, by checking against its current mtime. */
  const overwrite = async () => {
    const { data } = await refetch();
    if (!data) return;
    setConflict(false);
    write(data.mtime);
  };

  /** Drop these edits and start again from the file on disk. */
  const reload = async () => {
    drafts.delete(path);
    const { data } = await refetch();
    if (!data) return;
    setBase(data);
    setText(data.content);
    setConflict(false);
  };

  const cancel = () => {
    if (dirty && !confirmDiscard) return setConfirmDiscard(true);
    drafts.delete(path);
    onDone();
  };

  // Ctrl/Cmd+S saves. Held in a ref so the extension list stays stable and
  // CodeMirror isn't reconfigured on every keystroke.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(markdownHighlight),
      editorTheme,
      EditorView.lineWrapping,
      keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (submitRef.current(), true) }]),
    ],
    [],
  );

  if (isLoading || (!base && !error)) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Opening editor…
      </div>
    );
  }

  if (error || !base) {
    return (
      <div className="flex items-start gap-3 py-6">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">Could not open this note for editing</p>
          <p className="text-xs text-muted-foreground mt-1">{error?.message ?? "Unknown error"}</p>
          <button onClick={onDone} className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors">
            Back to reading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : "No changes"} · Ctrl+S to save
        </span>
        <button
          onClick={cancel}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          {confirmDiscard ? "Discard changes?" : "Cancel"}
        </button>
        <button
          onClick={submit}
          disabled={save.isPending}
          className="obsidian-action flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-amber-400/30 bg-amber-400/10 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="flex-1 min-w-[12rem]">This note changed on disk since you started editing.</span>
          <button onClick={reload} className="px-2.5 py-1 rounded-md border border-white/10 hover:bg-white/5">
            Discard mine, load theirs
          </button>
          <button onClick={overwrite} className="px-2.5 py-1 rounded-md border border-amber-400/40 text-amber-300 hover:bg-amber-400/10">
            Overwrite with mine
          </button>
        </div>
      )}

      <div className="rounded-lg bg-background/30 border border-white/5 px-2 min-h-[50vh]">
        <CodeMirror
          value={text}
          onChange={setText}
          extensions={extensions}
          theme="none"
          autoFocus
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLineGutter: false }}
          aria-label={`Edit ${path}`}
        />
      </div>
    </div>
  );
}
