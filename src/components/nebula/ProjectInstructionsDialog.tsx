import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { INSTRUCTIONS_MAX_CHARS, projectInstructions } from "@/lib/harness/projectInstructions";

interface Props {
  project: { id: string; name: string } | null;
  onClose: () => void;
}

export default function ProjectInstructionsDialog({ project, onClose }: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (project) setText(projectInstructions.forProject(project.id));
  }, [project]);

  return (
    <Dialog open={project !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instructions for {project?.name}</DialogTitle>
          <DialogDescription>
            Sent to the agent at the start of every chat in this project. Separate from any CLAUDE.md or AGENTS.md in the folder. Applies to new chats and engine switches; a running conversation keeps what it already has.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={INSTRUCTIONS_MAX_CHARS} rows={10} placeholder="e.g. Use pnpm. Keep functions small. Never edit generated files." />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (project) projectInstructions.set(project.id, text);
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
