import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REMARK_PLUGINS = [remarkGfm];

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  notes: string;
}

export function ChangelogDialog({ open, onOpenChange, version, notes }: ChangelogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70vh] max-w-lg flex-col gap-4">
        <DialogHeader>
          <DialogTitle>What's new in Crystal OS {version}</DialogTitle>
          <DialogDescription>Changes since your last update.</DialogDescription>
        </DialogHeader>
        <div className="prose prose-invert prose-sm min-h-0 max-w-none flex-1 overflow-y-auto pr-2 scrollbar-thin prose-headings:tracking-tight prose-a:text-primary">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{notes}</ReactMarkdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}
