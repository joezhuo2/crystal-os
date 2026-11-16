import { useMemo } from "react";
import { BookOpen, CalendarClock, FileStack, GraduationCap, Inbox, Percent, Telescope, type LucideIcon } from "lucide-react";
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { appUi } from "@/lib/appUi";
import { toLocalDateStr } from "@/lib/utils";
import { observatoryResults, type ObsIcon, type ObsResult } from "./commands";
import { emptyProgress } from "./model";
import { parseQuestions } from "./questions";
import { buildQueue } from "./queue";
import { useCourseResources, useResources } from "./resources/ingest";
import { useObservatorySettings } from "./settings";
import { topicMastery } from "./stats";
import { useCourses, useCoursesTopics, useProgress, useTopicBodies } from "./useObservatory";
import { useProcessAll } from "./useProcessAll";

const ICONS: Record<ObsIcon, LucideIcon> = { grades: Percent, course: Telescope, review: GraduationCap, exam: CalendarClock, topic: BookOpen, pdf: FileStack, inbox: Inbox };

export const OBS_VALUE_PREFIX = "obs-";

export function ObservatoryCommands({ search, itemClass, onNavigate, onClose }: { search: string; itemClass: string; onNavigate: () => void; onClose: () => void }) {
  const { newPerDay } = useObservatorySettings();
  const { courses } = useCourses();
  const live = useMemo(() => courses.map((e) => e.course).filter((c) => !c.archived), [courses]);
  const codes = useMemo(() => live.map((c) => c.code), [live]);
  const { topics: listed } = useCoursesTopics(codes);
  const wantDue = search.trim().length >= 2;
  const { topics } = useTopicBodies(wantDue ? listed : []);
  const { progress, loading } = useProgress(wantDue ? codes : []);
  const all = useCourseResources(codes);
  const pending = useMemo(() => all.filter((r) => !r.processed), [all]);
  const { resources: unsorted } = useResources(null);
  const { run } = useProcessAll();

  const { due, mastery } = useMemo(() => {
    const mastery: Record<string, number> = {};
    if (!wantDue || loading || !topics.length) return { due: null, mastery };
    const due: Record<string, number> = {};
    const studies = live.map((course) => ({ course, topics: topics.filter((t) => t.course === course.code), progress: progress[course.code] ?? emptyProgress() }));
    for (const item of buildQueue(studies, { newPerDay })) {
      due[item.course] = (due[item.course] ?? 0) + 1;
      const key = `${item.course}/${item.topic.slug}`;
      due[key] = (due[key] ?? 0) + 1;
    }
    for (const t of topics) mastery[`${t.course}/${t.slug}`] = topicMastery(progress[t.course] ?? emptyProgress(), t.slug, parseQuestions(t.body).map((q) => q.id));
    return { due, mastery };
  }, [wantDue, loading, topics, live, progress, newPerDay]);

  const results = observatoryResults(search, { courses: live, topics: wantDue && topics.length ? topics : listed, due, mastery, unprocessed: pending.length, unsorted: unsorted.length, today: toLocalDateStr() });
  if (!results.length) return null;

  const select = (r: ObsResult) => {
    if (r.target === "process-all") {
      onClose();
      void run(pending.map((p) => ({ resource: p, code: p.code, topics: listed.filter((t) => t.course === p.code) })));
      return;
    }
    appUi.setObservatoryTarget(r.target);
    onNavigate();
  };

  return (
    <>
      <CommandSeparator className="my-1" />
      <CommandGroup heading="The Observatory">
        {results.map((r) => {
          const Icon = ICONS[r.icon];
          return (
            <CommandItem key={r.id} value={`${OBS_VALUE_PREFIX}${r.id}`} onSelect={() => select(r)} className={itemClass}>
              <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0" data-private>
                <p className="text-sm font-medium truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground truncate">{r.detail}</p>
              </div>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}
