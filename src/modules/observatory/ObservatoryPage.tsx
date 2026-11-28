import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { m } from "framer-motion";
import { Flame, GraduationCap, Inbox, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GlideEffect } from "@/components/crystal/GlideEffect";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useShortcut } from "@/hooks/useShortcut";
import { useAppActivity } from "@/lib/appActivity";
import { appUi, useAppUi, type ObservatoryTarget } from "@/lib/appUi";
import { HABIT_COLORS } from "@/lib/habits";
import { toLocalDateStr } from "@/lib/utils";
import { AskButton } from "./AskButton";
import { CourseDialog, type CourseDraft } from "./CourseDialog";
import { CoursePage } from "./CoursePage";
import { DEEP_SKY } from "./deepsky/deepsky";
import { DeepSkyView } from "./deepsky/DeepSkyView";
import { DropZone } from "./DropZone";
import { IconAction } from "./IconAction";
import { checkIdle, releaseFocus, startFocusLogging, studyActivity } from "./focus";
import { FindAllQuestionsButton } from "./FindQuestions";
import { InboxView } from "./InboxView";
import { outlineToCourse, type Course, type Topic } from "./model";
import type { ParsedOutline } from "./outline";
import { OutlineButton } from "./OutlineButton";
import { OutlineMergeDialog } from "./OutlineMergeDialog";
import { ProcessAllButton } from "./ProcessAllButton";
import { useResources } from "./resources/ingest";
import { ReviewView } from "./ReviewView";
import { useObservatorySettings } from "./settings";
import { CourseExistsError, STARTER_COURSES, createCourse } from "./store";
import { studyStats } from "./stats";
import { useCourses, useProgress, useTopics, type CourseEntry } from "./useObservatory";

interface DialogState {
  initial: Partial<CourseDraft>;
  topics?: Topic[];
}

const DAY = 86_400_000;
const TABS = [
  { id: "courses", label: "Courses" },
  { id: "deepsky", label: "Deep Sky" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function nextExamLabel(course: Course): string | null {
  const exam = course.exams.find((x) => !x.done && x.date);
  if (!exam?.date) return null;
  const days = Math.round((Date.parse(exam.date) - Date.parse(toLocalDateStr())) / DAY);
  if (days < 0) return "Exam date passed";
  return days === 0 ? "Next exam today" : `Next exam in ${days} day${days === 1 ? "" : "s"}`;
}

function CourseCard({ entry, onOpen }: { entry: CourseEntry; onOpen: () => void }) {
  const { course } = entry;
  const { topics } = useTopics(course.code);
  const exam = nextExamLabel(course);
  return (
    <button type="button" onClick={onOpen} className="glass-card glass-card-hover p-4 text-left space-y-1.5 w-full">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: course.color }} aria-hidden="true" />
        <span className="font-semibold">{course.code}</span>
        <span className="text-xs text-muted-foreground ml-auto">{course.term}</span>
      </div>
      <p className="text-sm truncate">{course.name}</p>
      <p className="text-xs text-muted-foreground">
        {topics.length} topic{topics.length === 1 ? "" : "s"}
        {exam && ` · ${exam}`}
      </p>
    </button>
  );
}

function GoalRing({ today, goal }: { today: number; goal: number }) {
  const { still } = useAppActivity();
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Daily goal: ${today} of ${goal} observations`}>
      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-secondary" />
        <m.circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          className="stroke-primary"
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, today / goal)) }}
          transition={{ duration: still ? 0 : 0.5 }}
        />
      </svg>
      <span className="text-sm tabular-nums">
        <AnimatedNumber value={Math.min(today, goal)} />/{goal}
      </span>
    </div>
  );
}

function StudyHeader({ codes }: { codes: string[] }) {
  const { dailyGoal } = useObservatorySettings();
  const { progress } = useProgress(codes);
  const stats = studyStats(Object.values(progress), dailyGoal);
  return (
    <div className="flex items-center gap-4 text-muted-foreground">
      <GoalRing today={stats.today} goal={stats.goal} />
      <span className="flex items-center gap-1 text-sm" aria-label={`Streak: ${stats.streak} day${stats.streak === 1 ? "" : "s"}`}>
        <Flame className={`h-4 w-4 ${stats.streak ? "text-primary" : ""}`} aria-hidden="true" />
        {stats.streak}
      </span>
    </div>
  );
}

export default function ObservatoryPage() {
  const { still } = useAppActivity();
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const { courses, loading, error } = useCourses();
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [merge, setMerge] = useState<{ course: Course; outline: ParsedOutline } | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [tab, setTab] = useState<Tab>("courses");
  const [reviewCode, setReviewCode] = useState<string | undefined>();
  const [jump, setJump] = useState<{ tab?: ObservatoryTarget["tab"]; topic?: string; resource?: { pdf: string; page?: number }; n: number }>({ n: 0 });
  const { resources: unsorted } = useResources(null);
  const target = useAppUi((s) => s.observatoryTarget);

  useEffect(() => {
    startFocusLogging();
    const idle = setInterval(() => checkIdle(), 30_000);
    return () => {
      clearInterval(idle);
      releaseFocus();
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    appUi.setObservatoryTarget(null);
    setInbox(target.view === "inbox");
    setReviewing(target.view === "review");
    setReviewCode(target.view === "review" ? target.code : undefined);
    setTab(target.view === "deepsky" || target.code === DEEP_SKY ? "deepsky" : "courses");
    if (!target.view && target.code && target.code !== DEEP_SKY) {
      setOpenCode(target.code);
      setJump((j) => ({ tab: target.tab, topic: target.topic, resource: target.resource ? { pdf: target.resource, page: target.page } : undefined, n: j.n + 1 }));
    }
  }, [target]);

  const used = new Set(courses.map((e) => e.course.color));
  const nextColor = () => HABIT_COLORS.find((c) => !used.has(c)) ?? HABIT_COLORS[0];
  const openNewCourse = () => setDialog({ initial: { color: nextColor() } });
  useShortcut("observatory.newCourse", openNewCourse, !dialog && !reviewing);
  useShortcut("observatory.review", () => setReviewing(true), !dialog && !merge && !reviewing);
  useShortcut("observatory.back", () => {
    setReviewing(false);
    setReviewCode(undefined);
    setInbox(false);
  }, reviewing || inbox);

  const importOutline = (outline: ParsedOutline) => {
    const existing = courses.find((e) => e.course.code === outline.code);
    if (existing) return setMerge({ course: existing.course, outline });
    const { course, topics } = outlineToCourse(outline, nextColor());
    setDialog({ initial: course, topics });
  };

  const addStarters = async () => {
    const taken = new Set(used);
    try {
      for (const s of STARTER_COURSES) {
        const color = HABIT_COLORS.find((c) => !taken.has(c)) ?? HABIT_COLORS[0];
        taken.add(color);
        try {
          await createCourse(folder, { ...s, color, keywords: [], outcomes: [], exams: [], assessments: [], archived: false });
        } catch (err) {
          if (!(err instanceof CourseExistsError)) throw err;
        }
      }
    } catch (err) {
      toast.error("Could not add starter courses", { description: err instanceof Error ? err.message : String(err) });
    }
    await queryClient.invalidateQueries({ queryKey: ["vault"] });
  };

  const open = courses.find((e) => e.course.code === openCode);
  const visible = courses.filter((e) => showArchived || !e.course.archived);

  return (
    <div className="observatory-page space-y-5" onPointerDownCapture={studyActivity} onPointerMoveCapture={studyActivity} onWheelCapture={studyActivity} onKeyDownCapture={studyActivity}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            <span className="observatory-title">The Observatory</span>
          </h1>
        </div>
        {courses.length > 0 && <StudyHeader codes={courses.map((e) => e.course.code)} />}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Switch id="obs-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="obs-archived" className="text-sm">
              Show archived
            </Label>
          </div>
          <OutlineButton iconOnly onOutline={importOutline} />
          {unsorted.length > 0 && (
            <IconAction
              icon={Inbox}
              label={`_inbox, ${unsorted.length} unsorted`}
              hint="PDFs that still need a course"
              action={() => setInbox(true)}
              badge={<span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums"><AnimatedNumber value={unsorted.length} /></span>}
            />
          )}
          {!open && !reviewing && !inbox && tab === "courses" && <ProcessAllButton codes={courses.filter((e) => !e.course.archived).map((e) => e.course.code)} />}
          {!open && !reviewing && !inbox && tab === "courses" && (
            <FindAllQuestionsButton codes={courses.filter((e) => !e.course.archived).map((e) => e.course.code)} label="Find questions in every course with AI" />
          )}
          {!open && !reviewing && !inbox && tab === "courses" && (
            <AskButton courses={courses.filter((e) => !e.course.archived).map((e) => e.course)} flag="aiAskAll" label="Ask about every course" />
          )}
          <IconAction icon={GraduationCap} label="Review" hint="Due and new cards (R)" action={() => setReviewing(true)} />
          <IconAction icon={Plus} label="New course" hint="N" variant="default" action={openNewCourse} />
        </div>
      </header>

      {!reviewing && !inbox && (
        <GlideEffect
          role="tablist"
          aria-label="Observatory sections"
          className="flex w-fit glass-card p-0.5 rounded-lg [--cd-glide-bg:hsl(var(--primary))] [--cd-glide-shadow:none] [--cd-glide-radius:0.375rem]"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </GlideEffect>
      )}

      <DropZone courseHint={open && !reviewing && !inbox && tab === "courses" ? open.course.code : undefined} box={!open && !reviewing && !inbox && tab === "courses"} />

      <m.div key={reviewing ? "review" : inbox ? "inbox" : tab === "deepsky" ? "deepsky" : open ? "course" : "grid"} initial={still ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {reviewing ? (
          <ReviewView
            courses={courses.map((e) => e.course)}
            initialFilter={reviewCode}
            onClose={() => {
              setReviewing(false);
              setReviewCode(undefined);
            }}
          />
        ) : inbox ? (
          <InboxView courses={courses.map((e) => e.course)} onClose={() => setInbox(false)} />
        ) : tab === "deepsky" ? (
          <DeepSkyView courses={courses.map((e) => e.course)} />
        ) : open ? (
          <CoursePage key={`${open.course.code}-${jump.n}`} entry={open} initialTab={jump.tab} initialTopic={jump.topic} initialResource={jump.resource} onBack={() => setOpenCode(null)} />
        ) : loading ? (
          <div role="status" aria-label="Loading courses" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card p-4">
                <SkeletonLines count={3} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="glass-card p-8 text-center text-sm text-destructive">Could not load courses: {error.message}</div>
        ) : courses.length === 0 ? (
          <div className="glass-card p-8 text-center space-y-4">
            <p className="text-muted-foreground">No courses yet. Create one, import a UW outline, or start from the usual four.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openNewCourse}>New course</Button>
              <OutlineButton variant="outline" onOutline={importOutline}>
                Import outline
              </OutlineButton>
              <Button variant="outline" onClick={() => void addStarters()}>
                Add starter courses
              </Button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-card p-8 text-center text-muted-foreground">All courses are archived</div>
        ) : (
          <div className="observatory-panel grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((e) => (
              <CourseCard key={e.course.code} entry={e} onOpen={() => {
                  setJump((j) => ({ n: j.n }));
                  setOpenCode(e.course.code);
                }} />
            ))}
          </div>
        )}
      </m.div>

      {dialog && <CourseDialog initial={dialog.initial} topics={dialog.topics} onClose={() => setDialog(null)} />}
      {merge && <OutlineMergeDialog course={merge.course} outline={merge.outline} onClose={() => setMerge(null)} />}
    </div>
  );
}
