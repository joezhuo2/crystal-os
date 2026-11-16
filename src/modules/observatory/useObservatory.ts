import { useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { fetchRawNote, useVaultNotes, vaultErrorCode } from "@/hooks/useVault";
import {
  courseFromData,
  coursePath,
  emptyProgress,
  normalizeCode,
  parseProgress,
  parseTopic,
  progressPath,
  topicFromData,
  topicPath,
  type Course,
  type Progress,
  type Topic,
} from "./model";
import { useObservatorySettings } from "./settings";

export interface CourseEntry { course: Course; path: string }

const ALL = { limit: 10000 };

export function useCourses(): { courses: CourseEntry[]; loading: boolean; error: Error | null } {
  const { folder } = useObservatorySettings();
  const { data, isLoading, error } = useVaultNotes(ALL);
  const courses = useMemo(
    () =>
      (data?.notes ?? [])
        .filter((n) => new RegExp(`^${escapeRe(folder)}/[^/]+/_course\\.md$`).test(n.path))
        .map((n) => ({ course: courseFromData(n.frontmatter), path: n.path }))
        .filter((e) => normalizeCode(e.course.code) === e.course.code && e.path === coursePath(folder, e.course.code)),
    [data, folder],
  );
  return { courses, loading: isLoading, error };
}

export function useTopics(code: string | null): { topics: Topic[]; loading: boolean } {
  const { folder } = useObservatorySettings();
  const { data, isLoading } = useVaultNotes(ALL, !!code);
  const topics = useMemo(() => {
    const prefix = `${folder}/${code}/topics/`;
    return (data?.notes ?? [])
      .filter((n) => code && n.path.startsWith(prefix) && n.path.endsWith(".md") && !n.path.slice(prefix.length).includes("/"))
      .map((n) => topicFromData({ ...n.frontmatter, title: n.title }, n.path.slice(prefix.length, -".md".length)));
  }, [data, folder, code]);
  return { topics, loading: isLoading };
}

export function useCoursesTopics(codes: string[]): { topics: Topic[]; loading: boolean } {
  const { folder } = useObservatorySettings();
  const { data, isLoading } = useVaultNotes(ALL, codes.length > 0);
  const key = codes.join(",");
  const topics = useMemo(() => {
    const wanted = new Set(key.split(","));
    return (data?.notes ?? []).flatMap((n) => {
      const m = /^([^/]+)\/topics\/([^/]+)\.md$/.exec(n.path.startsWith(`${folder}/`) ? n.path.slice(folder.length + 1) : "");
      return m && wanted.has(m[1]!) ? [topicFromData({ ...n.frontmatter, title: n.title, course: m[1] }, m[2]!)] : [];
    });
  }, [data, folder, key]);
  return { topics, loading: isLoading && codes.length > 0 };
}

const safeProgress =(raw: string): Progress => {
  try {
    return parseProgress(raw);
  } catch {
    return emptyProgress();
  }
};

const readContent = async (path: string): Promise<string | null> => {
  try {
    return (await fetchRawNote(path)).content;
  } catch (err) {
    if (vaultErrorCode(err) === "not_found") return null;
    throw err;
  }
};

const topicBody = (raw: string | null) => (raw == null ? null : parseTopic(raw, "").body);
const parsedProgress = (raw: string | null) => (raw ? safeProgress(raw) : null);

// Parsing lives in `select` and `combine` is stable, so a re-render (or a refetch that returns the same text) parses nothing.
export function useTopicBodies(topics: Topic[]): { topics: Topic[]; loading: boolean } {
  const { folder } = useObservatorySettings();
  const combine = useCallback(
    (results: { data?: string | null; isLoading: boolean }[]) => ({
      loading: results.some((r) => r.isLoading),
      topics: topics.map((t, i) => {
        const body = results[i]?.data;
        return body == null ? t : { ...t, body };
      }),
    }),
    [topics],
  );
  return useQueries({
    queries: topics.map((t) => ({ queryKey: ["vault", "observatory-raw", topicPath(folder, t.course, t.slug)], queryFn: () => readContent(topicPath(folder, t.course, t.slug)), select: topicBody })),
    combine,
  });
}

export function useProgress(codes: string[]): { progress: Record<string, Progress>; loading: boolean } {
  const { folder } = useObservatorySettings();
  const key = codes.join(",");
  const combine = useCallback(
    (results: { data?: Progress | null; isLoading: boolean }[]) => ({
      loading: results.some((r) => r.isLoading),
      progress: Object.fromEntries((key ? key.split(",") : []).map((code, i) => [code, results[i]?.data ?? emptyProgress()])),
    }),
    [key],
  );
  return useQueries({
    queries: codes.map((code) => ({ queryKey: ["vault", "observatory-raw", progressPath(folder, code)], queryFn: () => readContent(progressPath(folder, code)), select: parsedProgress })),
    combine,
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
