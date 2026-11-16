import { useState } from "react";
import { ScanSearch } from "lucide-react";
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
import { AI_PROVIDER_LABELS } from "@/lib/ai";
import { isDesktop } from "@/lib/platform";
import { DEEP_SKY } from "./deepsky/deepsky";
import { errorText } from "./errorText";
import { IconAction } from "./IconAction";
import { plural } from "./model";
import { countPages, findQuestions, type FindJob } from "./resources/find";
import { useCourseResources } from "./resources/ingest";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { useCoursesTopics } from "./useObservatory";

function useFindQuestions() {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const run = async (jobs: FindJob[]) => {
    const stop = new AbortController();
    setRunning(true);
    const id = toast.loading(`Finding questions in ${plural(jobs.length, "PDF")}…`);
    const cancel = {
      label: "Cancel",
      onClick: () => {
        stop.abort();
        toast.loading("Stopping after the current pages…", { id, description: undefined, action: undefined });
      },
    };
    let added = 0;
    let searched = 0;
    const failed: string[] = [];
    try {
      for (const [i, job] of jobs.entries()) {
        if (stop.signal.aborted) break;
        const head = `Finding questions: file ${i + 1} of ${jobs.length}`;
        toast.loading(head, { id, description: job.resource.name, action: cancel });
        try {
          const result = await findQuestions(job, folder, {
            signal: stop.signal,
            onProgress: ({ page, pages }) => toast.loading(head, { id, description: `${job.resource.name}, page ${page} of ${pages}`, action: cancel }),
          });
          added += result.added;
          searched++;
        } catch (err) {
          console.error(`Could not find questions in ${job.resource.name}`, err);
          failed.push(`${job.resource.name}: ${errorText(err)}`);
        }
      }
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
      setRunning(false);
    }
    const title = `${stop.signal.aborted ? "Stopped after" : "Searched"} ${plural(searched, "PDF")}, added ${plural(added, "question")} to the review pool`;
    if (failed.length) {
      const shown = failed.slice(0, 5).join("\n") + (failed.length > 5 ? `\nand ${failed.length - 5} more (details in the console)` : "");
      toast.warning(`${title}; ${failed.length} failed`, { id, description: shown, action: undefined, duration: 20_000 });
    } else toast.success(title, { id, description: undefined, action: undefined });
  };

  return { run, running };
}

export function FindQuestionsButton({ jobs, label, confirm = false }: { jobs: FindJob[]; label: string; confirm?: boolean }) {
  const ai = useObservatoryAi();
  const { run, running } = useFindQuestions();
  const [asking, setAsking] = useState<{ pages: number | null } | null>(null);
  if (!ai || !isDesktop()) return null;

  const ask = async () => {
    setAsking({ pages: null });
    let pages = 0;
    for (const job of jobs) pages += await countPages(job.resource.pdf).catch(() => 0);
    setAsking((a) => a && { pages });
  };

  return (
    <>
      <IconAction
        icon={ScanSearch}
        label={confirm ? `${label} (${jobs.length})` : label}
        hint="Sends the PDF to the selected AI provider and adds the questions it finds to the review pool"
        disabled={!jobs.length || running}
        busy={running}
        action={() => {
          if (confirm) void ask();
          else void run(jobs);
          return false;
        }}
      />
      {asking && (
        <AlertDialog open onOpenChange={(open) => !open && setAsking(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Find questions with AI?</AlertDialogTitle>
              <AlertDialogDescription>
                This sends the content of {plural(jobs.length, "file")} ({asking.pages === null ? "counting pages…" : plural(asking.pages, "page")}) to {AI_PROVIDER_LABELS[ai.provider]}: the page text, plus page images where the text is missing or garbled. Found questions go to the review pool marked AI, unverified.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={asking.pages === null}
                onClick={() => {
                  setAsking(null);
                  void run(jobs);
                }}
              >
                Find questions
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

export function FindAllQuestionsButton({ codes, label }: { codes: string[]; label: string }) {
  const wanted = codes.filter((c) => c !== DEEP_SKY);
  const resources = useCourseResources(wanted);
  const { topics } = useCoursesTopics(wanted);
  const jobs = resources.map((r): FindJob => ({ resource: r, code: r.code, topics: topics.filter((t) => t.course === r.code) }));
  return <FindQuestionsButton jobs={jobs} label={label} confirm />;
}
