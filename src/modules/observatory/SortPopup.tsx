import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemedSelect } from "@/components/ui/field-controls";
import { CourseDialog } from "./CourseDialog";
import type { Course } from "./model";
import type { ResourceType } from "./resources/types";

const TYPE_LABELS: Record<ResourceType, string> = {
  slides: "Lecture slides",
  textbook: "Textbook",
  "question-sheet": "Question sheet",
  assignment: "Assignment",
  "past-exam": "Past exam",
  outline: "Course outline",
  other: "Other",
};

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function SortPopup({
  name,
  courses,
  ranked,
  suggested,
  type: initialType,
  onChoose,
  onClose,
}: {
  name: string;
  courses: Course[];
  ranked: string[];
  suggested?: string;
  type: ResourceType;
  onChoose: (code: string | null, type: ResourceType) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState(initialType);
  const [creating, setCreating] = useState(false);
  const [known] = useState(() => new Set(courses.map((c) => c.code)));
  const rank = (c: Course) => (known.has(c.code) ? (ranked.indexOf(c.code) + 1 || ranked.length + 1) : 0);
  const listed = courses.filter((c) => !c.archived).sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));

  if (creating) return <CourseDialog initial={{}} onClose={() => setCreating(false)} />;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Where does {name} go?</DialogTitle>
          <DialogDescription>Pick a course, or skip to leave it in _inbox.</DialogDescription>
        </DialogHeader>
        <ThemedSelect value={type} onChange={(v) => setType(v as ResourceType)} options={TYPE_OPTIONS} aria-label="Resource type" />
        <ul className="max-h-72 overflow-y-auto space-y-1" aria-label="Courses">
          {listed.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                autoFocus={c.code === suggested}
                onClick={() => onChoose(c.code, type)}
                className={`glass-card glass-card-hover flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${c.code === suggested ? "ring-1 ring-primary/60" : ""}`}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} aria-hidden="true" />
                <span className="font-semibold">{c.code}</span>
                <span className="truncate text-muted-foreground">{c.name}</span>
                {c.code === suggested && <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-primary">Suggested</span>}
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New course…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChoose(null, type)}>
            Skip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
