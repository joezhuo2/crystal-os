import { useState } from "react";
import { toast } from "sonner";
import { FolderOpen, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { harnessNative } from "@/lib/harness/native";
import { harness } from "@/lib/harness/store";
import { useHarness } from "@/hooks/useHarness";

const baseName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;

/** Adds a project: an existing folder, or a new one under the projects folder. */
export default function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { config } = useHarness();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const added = (path: string) => {
    const project = harness.addProject(baseName(path), path);
    harness.createChat(project.id);
    setName("");
    onOpenChange(false);
  };

  const pickExisting = async () => {
    setBusy(true);
    try {
      const path = await harnessNative.pickFolder(config?.projectsRoot);
      if (path) added(path);
    } catch (err) {
      toast.error("Could not open the folder picker", { description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const createNew = async () => {
    if (!config || !name.trim()) return;
    setBusy(true);
    try {
      added(await harnessNative.createProject(config.projectsRoot, name.trim()));
    } catch (err) {
      toast.error("Could not create the folder", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A project is a folder the agent works in. Its chats are grouped under it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Button variant="secondary" className="w-full justify-start" onClick={() => void pickExisting()} disabled={busy}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open an existing folder…
          </Button>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createNew();
            }}
          >
            <label className="text-sm font-medium" htmlFor="nebula-project-name">
              Or create a new folder
            </label>
            <div className="flex gap-2">
              <Input id="nebula-project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-new-app" maxLength={100} autoComplete="off" />
              <Button type="submit" disabled={busy || !name.trim() || !config}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Create
              </Button>
            </div>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">In {config?.projectsRoot ?? "…"} (change it in Settings → Nebula)</p>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
