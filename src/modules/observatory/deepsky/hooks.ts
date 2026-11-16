import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { emptyProgress } from "../model";
import { buildQueue } from "../queue";
import { useObservatorySettings } from "../settings";
import { useCoursesTopics, useProgress, useTopicBodies } from "../useObservatory";
import { DEEP_SKY, DEEP_SKY_COURSE, prefsPath, readNotInterested } from "./deepsky";

const CODES = [DEEP_SKY];
const NONE: string[] = [];

export function useDeepSkyTopics(enabled = true) {
  const { topics: listed, loading: listing } = useCoursesTopics(enabled ? CODES : NONE);
  const { topics, loading: reading } = useTopicBodies(listed);
  return { topics, loading: listing || reading };
}

export function useDeepSkyQueue(enabled = true) {
  const { newPerDay } = useObservatorySettings();
  const { topics, loading: loadingTopics } = useDeepSkyTopics(enabled);
  const { progress, loading: loadingProgress } = useProgress(enabled ? CODES : NONE);
  const loading = loadingTopics || loadingProgress;
  const stored = progress[DEEP_SKY];
  return useMemo(() => {
    const queue = !enabled || loading ? [] : buildQueue([{ course: DEEP_SKY_COURSE, topics, progress: stored ?? emptyProgress() }], { newPerDay });
    return { loading, due: queue.length, next: queue[0] ?? null, progress: stored ?? emptyProgress() };
  }, [enabled, loading, topics, stored, newPerDay]);
}

export function useNotInterested(): string[] {
  const { folder } = useObservatorySettings();
  const { data } = useQuery({ queryKey: ["vault", "observatory-deepsky-prefs", prefsPath(folder)], queryFn: () => readNotInterested(folder) });
  return data ?? NONE;
}
