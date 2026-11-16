import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mergeOutline, plural, type Course } from "./model";
import type { ParsedOutline } from "./outline";
import { useObservatorySettings } from "./settings";
import { ActionButton } from "./ActionButton";
import { applyOutlineMerge } from "./store";
import { DONE_MS } from "./useActionPhase";
import { useTopics } from "./useObservatory";

export function OutlineMergeDialog({ course, outline, onClose }: { course: Course; outline: ParsedOutline; onClose: () => void }) {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const { topics, loading } = useTopics(course.code);
  const merge = useMemo(() => mergeOutline(course, topics, outline), [course, topics, outline]);

  const apply = async () => {
    try {
      const skipped = await applyOutlineMerge(folder, course.code, merge);
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
      toast.success(`Updated ${course.code}`);
      if (skipped.length) toast.error(`Could not update ${plural(skipped.length, "topic note")}`);
      window.setTimeout(onClose, DONE_MS);
      return true;
    } catch (err) {
      toast.error("Could not update the course", { description: err instanceof Error ? err.message : String(err) });
      return false;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update {course.code} from outline?</DialogTitle>
          <DialogDescription>
            {outline.code !== course.code && `This outline is for ${outline.code}; it merges into ${course.code}, which keeps its code. `}
            Your topic notes, questions and review progress are kept.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {merge.changes.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
          <li>{plural(merge.added.length, "topic")} added</li>
          <li>{plural(merge.updated.length, "topic")} updated</li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <ActionButton disabled={loading} action={apply} pending="Updating" done="Updated">
            Update course
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
