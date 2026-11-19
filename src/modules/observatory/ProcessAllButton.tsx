import { Play, RefreshCw } from "lucide-react";
import { useShortcut } from "@/hooks/useShortcut";
import { isDesktop } from "@/lib/platform";
import { IconAction } from "./IconAction";
import { useCourseResources } from "./resources/ingest";
import { useCoursesTopics } from "./useObservatory";
import { useProcessAll } from "./useProcessAll";

export function ProcessAllButton({ codes }: { codes: string[] }) {
  const all = useCourseResources(codes);
  const pending = all.filter((r) => !r.processed);
  const redo = pending.length === 0;
  const jobs = redo ? all : pending;
  const { topics, loading } = useCoursesTopics(codes);
  const { run, running } = useProcessAll();
  const start = () => void run(jobs.map((r) => ({ resource: r, code: r.code, topics: topics.filter((t) => t.course === r.code) })));
  useShortcut("observatory.processAll", start, isDesktop() && !loading && !running && jobs.length > 0);
  if (!isDesktop()) return null;
  return (
    <IconAction
      icon={redo ? RefreshCw : Play}
      label={`${redo ? "Reprocess all" : "Process all"} (${jobs.length})`}
      hint={redo ? "Run every PDF again; your pool edits are kept" : "Pull questions from every unprocessed PDF into Review"}
      disabled={loading || !jobs.length}
      busy={running}
      action={() => {
        start();
        return false;
      }}
    />
  );
}
