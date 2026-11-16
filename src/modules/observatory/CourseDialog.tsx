import { useId, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { HABIT_COLORS } from "@/lib/habits";
import { isDesktop } from "@/lib/platform";
import { normalizeCode, plural, type Course, type Graded, type GradedAssessment, type GradedExam, type Topic } from "./model";
import { useObservatorySettings } from "./settings";
import { createCourse, renameCourse, saveCourse } from "./store";

export type CourseDraft = Course & { path?: string };

const BLANK: Course = {
  code: "",
  name: "",
  term: "",
  color: HABIT_COLORS[0],
  keywords: [],
  outcomes: [],
  exams: [],
  assessments: [],
  archived: false,
};

const withLatestGrades = <T extends Graded & { name: string }>(x: T, latest: (Graded & { name: string })[]): T => {
  const found = latest.find((y) => y.name === x.name);
  return found ? { ...x, scores: found.scores, excused_to: found.excused_to } : x;
};

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function CourseDialog({ initial, topics, onClose }: { initial?: Partial<CourseDraft>; topics?: Topic[]; onClose: () => void }) {
  const id = useId();
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const { path, ...base } = { ...BLANK, ...initial };
  const editing = !!path;
  const [code, setCode] = useState(base.code);
  const [name, setName] = useState(base.name);
  const [term, setTerm] = useState(base.term);
  const [color, setColor] = useState(base.color);
  const [learnUrl, setLearnUrl] = useState(base.learn_url ?? "");
  const [keywords, setKeywords] = useState(base.keywords.join(", "));
  const [exams, setExams] = useState<GradedExam[]>(base.exams);
  const [assessments, setAssessments] = useState<GradedAssessment[]>(base.assessments);
  const [archived, setArchived] = useState(base.archived);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const patchExam = (i: number, patch: Partial<GradedExam>) => setExams((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const patchAssessment = (i: number, patch: Partial<GradedAssessment>) =>
    setAssessments((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    const normalized = normalizeCode(code);
    if (!normalized) {
      setError("Use a code like MATH117");
      return;
    }
    setError(null);
    const { learn_url: _old, ...rest } = base;
    const course: Course = {
      ...rest,
      code: normalized,
      name: name.trim(),
      term: term.trim(),
      color,
      ...(learnUrl.trim() && { learn_url: learnUrl.trim() }),
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      exams: exams.map((x) => withLatestGrades(x, base.exams)),
      assessments: assessments.map((x) => withLatestGrades(x, base.assessments)),
      archived,
    };

    setPending(true);
    try {
      if (!path) await createCourse(folder, course, topics);
      else if (normalized !== base.code) {
        const skipped = await renameCourse(folder, base.code, course);
        if (skipped.length) toast.error(`Could not update ${plural(skipped.length, "topic note")}`);
      } else await saveCourse(folder, course);
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
      onClose();
    } catch (err) {
      toast.error("Could not save the course", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit course" : "New course"}</DialogTitle>
          <DialogDescription>
            {!editing && topics
              ? `${plural(topics.length, "topic")}, ${plural(base.outcomes.length, "outcome")} and ${plural(base.assessments.length, "assessment")} will be created`
              : "Course details, exams and assessment weights."}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Code" htmlFor={`${id}-code`}>
            <Input
              id={`${id}-code`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MATH117"
              readOnly={editing && !isDesktop()}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </Field>
          <Field label="Term" htmlFor={`${id}-term`}>
            <Input id={`${id}-term`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="2026F" />
          </Field>
          <div className="col-span-2">
            <Field label="Name" htmlFor={`${id}-name`}>
              <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Colour">
              <ColorPicker value={color} onChange={setColor} label="Course colour" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Learn URL" htmlFor={`${id}-url`}>
              <Input id={`${id}-url`} value={learnUrl} onChange={(e) => setLearnUrl(e.target.value)} placeholder="https://learn.uwaterloo.ca/..." />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Keywords (comma separated)" htmlFor={`${id}-keywords`}>
              <Input id={`${id}-keywords`} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Exams</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setExams((xs) => [...xs, { name: "", date: null, weight: 0 }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add exam
              </Button>
            </div>
            {exams.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <div className="grid grid-cols-[1fr_9rem_4.5rem] gap-2">
                  <Input aria-label={`Exam ${i + 1} name`} value={x.name} onChange={(e) => patchExam(i, { name: e.target.value })} />
                  <DateField aria-label={`Exam ${i + 1} date`} value={x.date ?? ""} onChange={(v) => patchExam(i, { date: v || null })} clearable />
                  <NumberInput
                    aria-label={`Exam ${i + 1} weight percent`}
                    min="0"
                    max="100"
                    value={+(x.weight * 100).toFixed(2)}
                    onChange={(e) => patchExam(i, { weight: Number(e.target.value) / 100 })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch aria-label={`Exam ${i + 1} done`} checked={!!x.done} onCheckedChange={(v) => patchExam(i, { done: v })} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove exam ${i + 1}`} onClick={() => setExams((xs) => xs.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Assessments</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAssessments((xs) => [...xs, { name: "", weight: 0 }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add assessment
              </Button>
            </div>
            {assessments.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_auto] gap-2 items-center">
                <Input aria-label={`Assessment ${i + 1} name`} value={a.name} onChange={(e) => patchAssessment(i, { name: e.target.value })} />
                <NumberInput
                  aria-label={`Assessment ${i + 1} weight percent`}
                  min="0"
                  max="100"
                  value={+(a.weight * 100).toFixed(2)}
                  onChange={(e) => patchAssessment(i, { weight: Number(e.target.value) / 100 })}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove assessment ${i + 1}`} onClick={() => setAssessments((xs) => xs.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {editing && (
            <div className="col-span-2 flex items-center justify-between">
              <Label htmlFor={`${id}-archived`} className="text-sm">
                Archived
              </Label>
              <Switch id={`${id}-archived`} checked={archived} onCheckedChange={setArchived} />
            </div>
          )}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
