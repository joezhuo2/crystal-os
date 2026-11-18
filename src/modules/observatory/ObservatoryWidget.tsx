import { useMemo, useRef, useState, type DragEvent } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { CalendarClock, FileUp, Flame, GraduationCap, Telescope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { useAppActivity } from "@/lib/appActivity";
import { isDesktop } from "@/lib/platform";
import { DEEP_SKY_COURSE } from "./deepsky/deepsky";
import { useDeepSkyQueue } from "./deepsky/hooks";
import { ReviewView } from "./ReviewView";
import { useObservatorySettings } from "./settings";
import { useCourses } from "./useObservatory";
import { useDropFiling } from "./useDropFiling";
import { useStudySummary } from "./useStudySummary";

const inDays = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
const SKY = [DEEP_SKY_COURSE];

export function ObservatoryWidget({ onClick, onDeepSky }: { onClick?: () => void; onDeepSky?: () => void }) {
  const s = useStudySummary();
  const { courses } = useCourses();
  const live = useMemo(() => courses.map((e) => e.course), [courses]);
  const { handle, popup } = useDropFiling();
  const { still } = useAppActivity();
  const desktop = isDesktop();
  const [reviewing, setReviewing] = useState(false);
  const { deepSkyFillHome } = useObservatorySettings();
  const sky = useDeepSkyQueue(deepSkyFillHome && !s.loading && s.due === 0);
  const [reviewSky, setReviewSky] = useState(false);
  const due = s.due || sky.due;
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const leave = () => {
    depth.current = 0;
    setOver(false);
  };

  if (reviewing)
    return (
      <div className="glass-card p-4 h-full overflow-y-auto" data-private>
        <ReviewView compact courses={reviewSky ? SKY : live} onClose={() => setReviewing(false)} />
      </div>
    );

  return (
    <>
    <div
      onClick={onClick}
      data-testid="observatory-widget"
      onDragEnter={(e) => {
        if (!desktop || !hasFiles(e)) return;
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => desktop && hasFiles(e) && e.preventDefault()}
      onDragLeave={() => depth.current > 0 && --depth.current === 0 && setOver(false)}
      onDrop={(e) => {
        if (!desktop || !hasFiles(e)) return;
        e.preventDefault();
        leave();
        void handle([...e.dataTransfer.files]);
      }}
      className={`glass-card-hover p-6 cursor-pointer group h-full relative ${over ? "ring-2 ring-primary/70 border-primary/60" : ""}`}
    >
      {over && (
        <div data-testid="observatory-widget-drop" className={`pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-background/70 ${still ? "" : "backdrop-blur-sm"}`}>
          <FileUp className="h-6 w-6 text-primary" aria-hidden />
          <p className="text-sm font-medium">Drop PDFs to file them</p>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-primary">The Observatory</p>
        <Telescope className="w-4 h-4 text-primary" aria-hidden />
      </div>
      {s.loading ? (
        <SkeletonLines count={3} />
      ) : !s.hasCourses && !sky.next ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No courses yet. Open The Observatory to add one or import an outline.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onDeepSky?.();
            }}
          >
            Deep Sky
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <AnimatedNumber className="text-3xl font-bold" value={due} />
            <span className="text-sm text-muted-foreground">card{due === 1 ? "" : "s"} to review</span>
          </div>
          {s.next ? (
            <p className="text-sm truncate" data-private>
              Next: {s.next.topic.title} <span className="text-muted-foreground">({s.next.course})</span>
            </p>
          ) : sky.next ? (
            <p className="text-sm truncate" data-private>
              Next: {sky.next.topic.title} <span className="text-muted-foreground">(Deep Sky)</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              All caught up{s.exam ? `. Get ahead on ${s.exam.code} before its ${s.exam.name}.` : "."}{" "}
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeepSky?.();
                }}
              >
                Deep Sky
              </button>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span aria-label={`Daily goal: ${s.stats.today} of ${s.stats.goal}`} className={s.stats.met ? "text-primary" : undefined}>
              {Math.min(s.stats.today, s.stats.goal)}/{s.stats.goal} today
            </span>
            <span className="inline-flex items-center gap-1" aria-label={`Streak: ${s.stats.streak} days`}>
              <Flame className={`h-3.5 w-3.5 ${s.stats.streak ? "text-primary" : ""}`} aria-hidden /> {s.stats.streak}
            </span>
            {s.exam && s.examDays != null && (
              <span className="inline-flex items-center gap-1" data-private>
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {s.exam.code} {s.exam.name} {inDays(s.examDays)}
              </span>
            )}
          </div>
          {due > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={(e) => {
                e.stopPropagation();
                setReviewSky(s.due === 0);
                setReviewing(true);
              }}
            >
              <GraduationCap className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          )}
        </div>
      )}
    </div>
    {popup}
    </>
  );
}
