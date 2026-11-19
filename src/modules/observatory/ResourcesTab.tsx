import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, FileQuestion, FolderInput, Library, Play, Presentation, RefreshCw, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isDesktop } from "@/lib/platform";
import { undoToast } from "@/lib/undo";
import { unverifiedBadge } from "./CardSource";
import { errorText } from "./errorText";
import { FindAllQuestionsButton, FindQuestionsButton } from "./FindQuestions";
import { IconAction } from "./IconAction";
import type { Course, Topic } from "./model";
import { ProcessAllButton } from "./ProcessAllButton";
import { ReaderView } from "./ReaderView";
import { deleteResource, fileDrop, filedTitle, moveResource, restoreResource, useResources, type Resource } from "./resources/ingest";
import type { CourseSuggestion } from "./resources/ai";
import { processResource, type ProcessProgress } from "./resources/process";
import { acceptSuggestion, dismissSuggestion } from "./resources/suggestions";
import type { ResourceType } from "./resources/types";
import { SortPopup } from "./SortPopup";
import { useObservatorySettings } from "./settings";
import { useCourses } from "./useObservatory";

const GROUPS: [ResourceType, string][] = [
  ["textbook", "Textbooks"],
  ["question-sheet", "Question sheets"],
  ["slides", "Lecture slides"],
  ["assignment", "Assignments"],
  ["past-exam", "Past exams"],
  ["outline", "Outline"],
  ["other", "Other"],
];

const UPLOADS: [ResourceType, string, typeof Library][] = [
  ["textbook", "Upload textbook", Library],
  ["question-sheet", "Upload question sheet", FileQuestion],
  ["slides", "Upload slides", Presentation],
];

export function ResourceToolbar({ course }: { course: Course }) {
  const { courses } = useCourses();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<ResourceType | null>(null);
  const type = useRef<ResourceType>("textbook");
  const input = useRef<HTMLInputElement>(null);
  if (!isDesktop()) return null;

  const upload = async (files: File[]) => {
    setUploading(type.current);
    try {
      for (const f of files) {
        try {
          const { filed } = await fileDrop({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }, courses.map((e) => e.course), { courseHint: course.code, typeHint: type.current });
          if (filed) toast.success(filedTitle(f.name, filed));
        } catch (err) {
          toast.error(`Could not file ${f.name}`, { description: errorText(err) });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {UPLOADS.map(([t, label, icon]) => (
        <IconAction
          key={t}
          icon={icon}
          label={label}
          hint={`Filed into ${course.code}`}
          busy={uploading === t}
          disabled={uploading !== null && uploading !== t}
          action={() => {
            type.current = t;
            input.current?.click();
            return false;
          }}
        />
      ))}
      <ProcessAllButton codes={[course.code]} />
      <FindAllQuestionsButton codes={[course.code]} label={`Find questions in all ${course.code} files with AI`} />
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        data-testid="resource-upload"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
    </div>
  );
}

const suggestionText = (s: CourseSuggestion) =>
  [`${s.kind === "exam" ? "Exam" : "Assessment"} "${s.name}"`, s.weight !== undefined && `weight ${s.weight}%`, s.date && `date ${s.date}`].filter(Boolean).join(", ");

function Suggestions({ code, resource, onDone }: { code: string; resource: Resource; onDone: () => Promise<unknown> }) {
  const { folder } = useObservatorySettings();
  const [busy, setBusy] = useState(false);
  const act = async (title: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onDone();
    } catch (err) {
      toast.error(title, { description: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <ul className="space-y-1 pl-2" aria-label={`Suggested course changes from ${resource.name}`}>
      {(resource.suggestions ?? []).map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
          <span className={unverifiedBadge}>AI, unverified</span>
          <span>Update _course.md: {suggestionText(s)}</span>
          {s.quote && <span className="italic text-muted-foreground truncate">"{s.quote}"</span>}
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("Could not update the course", () => acceptSuggestion(folder, code, resource.sidecar, s))}>
              <Check className="h-3.5 w-3.5 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("Could not dismiss the suggestion", () => dismissSuggestion(resource.sidecar, s.id))}>
              <X className="h-3.5 w-3.5 mr-1" /> Dismiss
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ResourcesTab({ course, topics, onReading }: { course: Course; topics: Topic[]; onReading?: (open: boolean) => void }) {
  const { resources, loading } = useResources(course.code);
  const { courses } = useCourses();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Record<string, ProcessProgress>>({});
  const [reading, setReading] = useState<Resource | null>(null);
  const [moving, setMoving] = useState<Resource | null>(null);
  const isReading = !!reading;
  useEffect(() => {
    onReading?.(isReading);
    return () => onReading?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReading]);
  const desktop = isDesktop();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vault"] });

  const process = async (r: Resource) => {
    setProgress((p) => ({ ...p, [r.sidecar]: { done: 0, total: 1, label: "Opening PDF" } }));
    try {
      const result = await processResource(r.sidecar, topics, (next) => setProgress((p) => ({ ...p, [r.sidecar]: next })));
      if (result.needsOcr.length) toast.warning(`${r.name}: ${result.needsOcr.length} scanned page(s) read with OCR`, { description: "Check items marked Unclear." });
      await refresh();
      return true;
    } catch (err) {
      toast.error(`Could not process ${r.name}`, { description: errorText(err) });
      return false;
    } finally {
      setProgress(({ [r.sidecar]: _, ...rest }) => rest);
    }
  };

  const move = async (r: Resource, code: string | null, type: ResourceType) => {
    setMoving(null);
    try {
      toast.success(filedTitle(r.name, await moveResource(r.sidecar, code, type)));
      await refresh();
    } catch (err) {
      toast.error(`Could not move ${r.name}`, { description: errorText(err) });
    }
  };

  const remove = async (r: Resource) => {
    try {
      const trashed = await deleteResource(r);
      await refresh();
      undoToast(`Deleted ${r.name}`, () => void restoreResource(trashed).then(refresh, (err: unknown) => toast.error(`Could not restore ${r.name}`, { description: errorText(err) })));
      return true;
    } catch (err) {
      toast.error(`Could not delete ${r.name}`, { description: errorText(err) });
      return false;
    }
  };

  if (reading) return <ReaderView resource={reading} code={course.code} topics={topics} onBack={() => setReading(null)} />;

  return (
    <div className="space-y-4">
      {!desktop && <p className="text-sm text-muted-foreground">Filing, processing and reading PDFs needs the desktop app.</p>}
      {!loading && !resources.length && <p className="text-sm text-muted-foreground">No resources yet. Drop a PDF anywhere on this page to file it here.</p>}
      {GROUPS.map(([type, label]) => {
        const items = resources.filter((r) => r.type === type);
        if (!items.length) return null;
        return (
          <section key={type} className="glass-card p-4 space-y-2" aria-label={label}>
            <h3 className="text-sm font-medium">{label}</h3>
            <ul className="space-y-2">
              {items.map((r) => {
                const p = progress[r.sidecar];
                return (
                  <li key={r.sidecar} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 truncate">{r.title || r.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.name}</span>
                      {r.processed && <span className="rounded-full border border-primary/40 text-primary px-2 text-[10px] uppercase tracking-wide">Processed</span>}
                      {desktop && (
                        <span className="ml-auto flex gap-0.5">
                          <IconAction
                            icon={r.processed ? RefreshCw : Play}
                            label={`${r.processed ? "Reprocess" : "Process"} ${r.name}`}
                            hint="Pull its questions into the pool"
                            busy={!!p}
                            action={() => process(r)}
                          />
                          <FindQuestionsButton jobs={[{ resource: r, code: course.code, topics }]} label={`Find questions in ${r.name} with AI`} />
                          <IconAction icon={BookOpen} label={`Open ${r.name}`} hint="Read it with its question pool" action={() => setReading(r)} />
                          <IconAction icon={FolderInput} label={`Move ${r.name}`} hint="Another course or type" action={() => setMoving(r)} />
                          <IconAction icon={Trash2} label={`Delete ${r.name}`} hint="Moves it to the trash; Undo restores it" className="hover:text-destructive" action={() => remove(r)} />
                        </span>
                      )}
                    </div>
                    {!!r.suggestions?.length && <Suggestions code={course.code} resource={r} onDone={refresh} />}
                    {p && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Progress className="h-1.5" value={p.total ? (p.done / p.total) * 100 : 0} aria-label={`Processing ${r.name}`} />
                        <span className="shrink-0">{p.label}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {moving && (
        <SortPopup
          name={moving.name}
          courses={courses.map((e) => e.course)}
          ranked={[course.code]}
          type={moving.type}
          onChoose={(code, type) => void move(moving, code, type)}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}
