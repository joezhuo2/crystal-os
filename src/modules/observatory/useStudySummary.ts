import { useMemo } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { emptyProgress } from "./model";
import { buildQueue } from "./queue";
import { useObservatorySettings } from "./settings";
import { studyStats } from "./stats";
import { useCourses, useCoursesTopics, useProgress, useTopicBodies } from "./useObservatory";

export function useStudySummary() {
  const { dailyGoal, newPerDay } = useObservatorySettings();
  const { courses, loading: loadingCourses } = useCourses();
  const live = useMemo(() => courses.map((e) => e.course).filter((c) => !c.archived), [courses]);
  const codes = useMemo(() => live.map((c) => c.code), [live]);
  const { topics: listed, loading: loadingTopics } = useCoursesTopics(codes);
  const { topics, loading: loadingBodies } = useTopicBodies(listed);
  const { progress, loading: loadingProgress } = useProgress(codes);
  const loading = loadingCourses || loadingTopics || loadingBodies || loadingProgress;

  return useMemo(() => {
    const queue = loading ? [] : buildQueue(live.map((course) => ({ course, topics: topics.filter((t) => t.course === course.code), progress: progress[course.code] ?? emptyProgress() })), { newPerDay });
    const today = toLocalDateStr();
    const exam =
      live
        .flatMap((c) => c.exams.filter((e) => !e.done && e.date && e.date >= today).map((e) => ({ code: c.code, name: e.name, date: e.date! })))
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    const examDays = exam ? Math.round((Date.parse(exam.date) - Date.parse(today)) / 86_400_000) : null;
    return { loading, hasCourses: live.length > 0, due: queue.length, next: queue[0] ?? null, stats: studyStats(Object.values(progress), dailyGoal), exam, examDays };
  }, [loading, live, topics, progress, newPerDay, dailyGoal]);
}
