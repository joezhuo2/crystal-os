import { useState } from "react";
import { BookmarkPlus, BookText, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { savedPrompts, useSavedPrompts } from "@/lib/harness/savedPrompts";
import NebulaTip from "./NebulaTip";

interface Props {
  projectId: string;
  draft: string;
  onInsert: (body: string) => void;
}

interface Editing {
  id: string | null;
  title: string;
  body: string;
}

export default function SavedPromptsMenu({ projectId, draft, onInsert }: Props) {
  useSavedPrompts();
  const prompts = savedPrompts.forProject(projectId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const startEdit = (next: Editing) => {
    setOpen(false);
    setEditing(next);
  };

  const save = () => {
    if (!editing) return;
    if (editing.id) savedPrompts.update(projectId, editing.id, editing.title, editing.body);
    else savedPrompts.add(projectId, editing.title, editing.body);
    setEditing(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <NebulaTip label="Saved prompts" hint="This project">
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label="Saved prompts">
              <BookText className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </NebulaTip>
        <PopoverContent align="start" className="w-72 space-y-1 p-2">
          {prompts.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved prompts for this project yet.</p>}
          {prompts.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10"
                onClick={() => {
                  onInsert(p.body);
                  setOpen(false);
                }}
              >
                <span className="block truncate">{p.title}</span>
              </button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${p.title}`} onClick={() => startEdit({ id: p.id, title: p.title, body: p.body })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Delete ${p.title}`} onClick={() => savedPrompts.remove(projectId, p.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="border-t border-white/10 pt-1">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" disabled={!draft.trim()} onClick={() => startEdit({ id: null, title: "", body: draft.trim() })}>
              <BookmarkPlus className="mr-2 h-4 w-4" />
              Save current input as prompt
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => startEdit({ id: null, title: "", body: "" })}>
              <Plus className="mr-2 h-4 w-4" />
              New prompt
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit prompt" : "Save prompt"}</DialogTitle>
            <DialogDescription>Available in this project's composer and the command palette.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title" maxLength={80} autoComplete="off" autoFocus />
              <Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="Prompt" rows={6} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!editing.title.trim() || !editing.body.trim()}>
                  Save
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
