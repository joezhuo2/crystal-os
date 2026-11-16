import { useMemo } from "react";
import { daysOf, unitOf, type ReviewPeriod } from "@/lib/orbitReview";
import { toLocalDateStr } from "@/lib/utils";
import { orbitStudyStats, studyMarkdown, type StudyOrbitStats } from "@/modules/observatory/orbitStats";
import { emptyProgress } from "@/modules/observatory/model";
import { useObservatorySettings } from "@/modules/observatory/settings";
import { useCourses, useProgress } from "@/modules/observatory/useObservatory";

export function useOrbitStudy(period: ReviewPeriod, enabled: boolean): { stats: StudyOrbitStats | null; loading: boolean; hasCourses: boolean } {
  const { dailyGoal } = useObservatorySettings();
  const { courses, loading: loadingCourses } = useCourses();
  const live = useMemo(() => courses.map((e) => e.course).filter((c) => !c.archived), [courses]);
  const codes = useMemo(() => (enabled ? live.map((c) => c.code) : []), [enabled, live]);
  const { progress, loading: loadingProgress } = useProgress(codes);
  const loading = enabled && (loadingCourses || loadingProgress);
  const stats = useMemo(
    () =>
      enabled && !loading
        ? orbitStudyStats(
            live.map((c) => ({ code: c.code, name: c.name, progress: progress[c.code] ?? emptyProgress() })),
            { days: daysOf(period), today: toLocalDateStr() },
            dailyGoal,
          )
        : null,
    // The period is a value named by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, loading, live, progress, dailyGoal, period.kind, period.key],
  );
  return { stats, loading, hasCourses: live.length > 0 };
}

export function useStudyMarkdown(period: ReviewPeriod, enabled: boolean): { markdown: string | null; loading: boolean } {
  const { stats, loading, hasCourses } = useOrbitStudy(period, enabled);
  return { markdown: stats && hasCourses ? studyMarkdown(stats, unitOf(period.kind)) : null, loading };
}

export const withStudy = (markdown: string, study: string | null) => (study ? `${markdown.trimEnd()}

${study}
` : markdown);
