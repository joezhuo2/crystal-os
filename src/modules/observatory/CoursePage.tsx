import { useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Archive, ArchiveRestore, ArrowLeft, ChevronRight, Pencil, Save, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GlideEffect } from "@/components/crystal/GlideEffect";
import { Button, buttonVariants } from "@/components/ui/button";
import { useShortcut } from "@/hooks/useShortcut";
import { useAppActivity } from "@/lib/appActivity";
import { isDesktop } from "@/lib/platform";
import { undoToast } from "@/lib/undo";
import { AskButton } from "./AskButton";
import { CourseDialog } from "./CourseDialog";
import { ExamEventLink } from "./ExamEventLink";
import { GradesTab, type GradesHandle } from "./GradesTab";
import { plural } from "./model";
import type { ParsedOutline } from "./outline";
import { IconAction } from "./IconAction";
import { OutlineButton } from "./OutlineButton";
import { OutlineMergeDialog } from "./OutlineMergeDialog";
import { PriorityMap } from "./PriorityMap";
import { ResourcesTab, ResourceToolbar } from "./ResourcesTab";
import { TopicDrafts } from "./TopicDrafts";
import { useObservatorySettings } from "./settings";
import { deleteCourse, restoreCourse, saveCourse } from "./store";
import { useTopics, type CourseEntry } from "./useObservatory";

const TABS = ["Overview", "Topics", "Resources", "Grades"] as const;

const EXPAND_TRANSITION = { type: "tween", duration: 0.2, ease: [0.4, 0, 0.2, 1] } as const;

export function CoursePage({ entry, onBack, initialTab, initialTopic, initialResource }: { entry: CourseEntry; onBack: () => void; initialTab?: (typeof TABS)[number]; initialTopic?: string; initialResource?: { pdf: string; page?: number } }) {
  const { course, path } = entry;
  const { folder } = useObservatorySettings();
  const { still } = useAppActivity();
  const queryClient = useQueryClient();
  const { topics } = useTopics(course.code);
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab ?? "Overview");
  const [editing, setEditing] = useState(false);
  const [outcomesOpen, setOutcomesOpen] = useState(true);
  const [outline, setOutline] = useState<ParsedOutline | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const grades = useRef<GradesHandle>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const [reading, setReading] = useState(false);
  const [gradesDirty, setGradesDirty] = useState(false);
  const guard = (go: () => void) => (grades.current?.dirty() ? setLeave(() => go) : go());
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vault"] });
  const fail = (title: string, err: unknown) => toast.error(title, { description: err instanceof Error ? err.message : String(err) });

  const toggleArchive = async () => {
    try {
      await saveCourse(folder, { ...course, archived: !course.archived });
      await refresh();
      return true;
    } catch (err) {
      fail("Could not update the course", err);
      return false;
    }
  };

  const remove = async () => {
    const { code } = course;
    try {
      const trashPath = await deleteCourse(folder, code);
      onBack();
      await refresh();
      undoToast(`Deleted ${code}`, () =>
        void restoreCourse(trashPath, folder, code).then(refresh, (err: unknown) => fail(`Could not restore ${code}`, err)),
      );
    } catch (err) {
      fail("Could not delete the course", err);
    }
  };

  const keys = !reading && !editing && !outline;
  useShortcut("observatory.back", () => guard(onBack), keys);
  useShortcut("observatory.cycleTab", () => guard(() => setTab(TABS[(TABS.indexOf(tab) + 1) % TABS.length]!)), keys);
  useShortcut("observatory.editCourse", () => guard(() => setEditing(true)), keys);
  useShortcut("observatory.archiveCourse", () => void toggleArchive(), keys);
  useShortcut("observatory.deleteCourse", () => setConfirmDelete(true), keys && isDesktop());

  return (
    <div className="space-y-5">
      {!reading && (
        <Button variant="ghost" size="sm" onClick={() => guard(onBack)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: course.color }} aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold truncate">
              {course.code} <span className="text-muted-foreground font-normal">{course.name}</span>
            </h2>
            <p className="text-sm text-muted-foreground">{course.term}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <OutlineButton iconOnly code={course.code} onOutline={setOutline} />
          <IconAction icon={Pencil} label="Edit course" hint="Name, term, colour, keywords, weights" action={() => guard(() => setEditing(true))} />
          <IconAction icon={course.archived ? ArchiveRestore : Archive} label={course.archived ? "Unarchive" : "Archive"} hint={course.archived ? "Show it with your courses again" : "Hide it from the course list and Review"} action={toggleArchive} />
          {isDesktop() && <IconAction icon={Trash2} label="Delete course" hint="Moves the folder to the trash; Undo restores it" className="hover:text-destructive" action={() => setConfirmDelete(true)} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
      <GlideEffect
        role="tablist"
        aria-label="Course sections"
        className="flex w-fit glass-card p-0.5 rounded-lg [--cd-glide-bg:hsl(var(--primary))] [--cd-glide-shadow:none] [--cd-glide-radius:0.375rem]"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => guard(() => setTab(t))}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "Topics" ? `Topics (${topics.length})` : t}
          </button>
        ))}
      </GlideEffect>
      <div className="flex items-center gap-2">
        {tab === "Resources" && <ResourceToolbar course={course} />}
        {tab === "Grades" && (course.exams.length > 0 || course.assessments.length > 0) && (
          <div className="flex items-center gap-2">
            {gradesDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <IconAction icon={Save} label="Save grades" disabled={!gradesDirty} action={() => grades.current?.save()} />
          </div>
        )}
        <AskButton courses={[course]} flag="aiAskCourse" label={`Ask about ${course.code}`} />
      </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={tab}
          role="tabpanel"
          aria-label={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={still ? { duration: 0 } : { duration: 0.15 }}
          className="observatory-panel space-y-5"
        >
          {tab === "Overview" && (
            <>
              {course.outcomes.length > 0 && (
                <section className="glass-card p-4">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-medium"
                    aria-expanded={outcomesOpen}
                    onClick={() => setOutcomesOpen((o) => !o)}
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${outcomesOpen ? "rotate-90" : ""}`} /> Outcomes
                  </button>
                  <AnimatePresence initial={false}>
                    {outcomesOpen && (
                      <m.div
                        key="outcomes"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={still ? { duration: 0 } : EXPAND_TRANSITION}
                        className="overflow-hidden"
                      >
                        <ul className="pt-2 list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                          {course.outcomes.map((o, i) => (
                            <li key={i}>{o}</li>
                          ))}
                        </ul>
                      </m.div>
                    )}
                  </AnimatePresence>
                </section>
              )}

              {(course.assessments.length > 0 || course.exams.length > 0) && (
                <section className="glass-card p-4 space-y-1 text-sm">
                  <h3 className="font-medium mb-1">Assessments and exams</h3>
                  {course.assessments.map((a, i) => (
                    <p key={`a${i}`} className="flex justify-between">
                      <span>{a.name}</span>
                      <span className="text-muted-foreground">{+(a.weight * 100).toFixed(2)}%</span>
                    </p>
                  ))}
                  {course.exams.map((x, i) => (
                    <p key={`e${i}`} className="flex items-center justify-between gap-2">
                      <span className={x.done ? "line-through text-muted-foreground" : undefined}>
                        {x.name} {x.date && <span className="text-muted-foreground">{x.date}</span>}
                      </span>
                      {!x.done && <span className="ml-auto"><ExamEventLink course={course} index={i} /></span>}
                      <span className="text-muted-foreground">{+(x.weight * 100).toFixed(2)}%</span>
                    </p>
                  ))}
                </section>
              )}
              {!course.outcomes.length && !course.assessments.length && !course.exams.length && (
                <p className="text-sm text-muted-foreground">No outcomes or assessments yet. Import the outline or edit the course.</p>
              )}
            </>
          )}
          {tab === "Topics" && (
            <>
              <TopicDrafts course={course} topics={topics} />
              <PriorityMap code={course.code} courseName={course.name} topics={topics} initialOpen={initialTopic} />
            </>
          )}
          {tab === "Resources" && <ResourcesTab course={course} topics={topics} onReading={setReading} initialResource={initialResource} />}
          {tab === "Grades" && <GradesTab ref={grades} key={course.code} course={course} onDirty={setGradesDirty} onEdit={() => guard(() => setEditing(true))} />}
        </m.div>
      </AnimatePresence>

      {editing && <CourseDialog initial={{ ...course, path }} onClose={() => setEditing(false)} />}
      {outline && <OutlineMergeDialog course={course} outline={outline} onClose={() => setOutline(null)} />}
      <AlertDialog open={!!leave} onOpenChange={(open) => !open && setLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your grade changes?</AlertDialogTitle>
            <AlertDialogDescription>You have grades that are not saved yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                grades.current?.discard();
                leave?.();
                setLeave(null);
              }}
            >
              Discard
            </Button>
            <AlertDialogAction
              onClick={() =>
                void grades.current?.save().then((ok) => {
                  if (ok) leave?.();
                })
              }
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {course.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder and its {plural(topics.length, "topic note")} move to the vault's .trash folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => void remove()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
