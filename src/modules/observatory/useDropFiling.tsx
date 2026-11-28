import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UNDO_MS } from "@/lib/undo";
import { fileDrop, filedTitle, fileTo, moveResource, undoFile, useFiledNames, type Analysis, type Filed } from "./resources/ingest";
import { markAi } from "./resources/aiRecord";
import { convertToPdf } from "@/lib/vaultNative";
import { ACCEPTED, CONVERTIBLE, pdfStem } from "./resources/paths";
import type { ResourceType } from "./resources/types";
import { SortPopup } from "./SortPopup";
import { errorText } from "./errorText";
import { useCourses } from "./useObservatory";

type Choice = { id: number; analysis: Analysis; filed?: Filed };

let nextId = 0;
export const PROCESSING_TOAST = "observatory-processing";

export function useDropFiling({ courseHint, typeHint }: { courseHint?: string; typeHint?: ResourceType } = {}) {
  const queryClient = useQueryClient();
  const { courses } = useCourses();
  const filedNames = useFiledNames();
  const [queue, setQueue] = useState<Choice[]>([]);
  const [reading, setReading] = useState(0);
  const processing = useRef<string[]>([]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vault"] });

  const showFiled = (filed: Filed, analysis: Analysis) => {
    let used = false;
    const once = (fn: () => void) => () => {
      if (used) return;
      used = true;
      fn();
    };
    toast(filedTitle(analysis.file.name, filed), {
      duration: UNDO_MS,
      action: { label: "Undo", onClick: once(() => void undoFile(filed).then(() => markAi(analysis.aiLog, "dismissed")).then(refresh, (err: unknown) => toast.error(`Could not undo ${analysis.file.name}`, { description: errorText(err) }))) },
      cancel: { label: "Change", onClick: once(() => setQueue((q) => [{ id: ++nextId, analysis, filed }, ...q])) },
    });
  };

  const showProcessing = () => {
    const names = processing.current;
    if (!names.length) return void toast.dismiss(PROCESSING_TOAST);
    const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
    toast.loading(`Processing ${shown}…`, { id: PROCESSING_TOAST });
  };

  const handle = async (files: File[]) => {
    const rejected = files.filter((f) => !ACCEPTED.test(f.name));
    if (rejected.length) toast.error("Only PDF, PowerPoint, Word and HTML files can be filed", { description: rejected.map((f) => f.name).join(", ") });
    const seen = new Set(filedNames);
    const skipped: string[] = [];
    const fresh = files.filter((f) => {
      if (!ACCEPTED.test(f.name)) return false;
      const name = `${pdfStem(f.name)}.pdf`;
      if (seen.has(name)) {
        skipped.push(f.name);
        return false;
      }
      seen.add(name);
      return true;
    });
    if (skipped.length) toast("Skipped PDFs that are already filed", { description: skipped.join(", ") });
    processing.current.push(...fresh.map((f) => f.name));
    showProcessing();
    for (const f of fresh) {
      setReading((n) => n + 1);
      try {
        const original = new Uint8Array(await f.arrayBuffer());
        const convert = CONVERTIBLE.test(f.name);
        const bytes = convert ? new Uint8Array(await convertToPdf(f.name, original)) : original;
        const { analysis, filed } = await fileDrop({ name: convert ? `${f.name.replace(CONVERTIBLE, "")}.pdf` : f.name, bytes }, courses.map((e) => e.course), { courseHint, typeHint });
        if (filed) showFiled(filed, analysis);
        else setQueue((q) => [...q, { id: ++nextId, analysis }]);
      } catch (err) {
        toast.error(`Could not file ${f.name}`, { description: errorText(err) });
      } finally {
        setReading((n) => n - 1);
        processing.current.splice(processing.current.indexOf(f.name), 1);
        showProcessing();
      }
    }
    await refresh();
  };

  const dismiss = (id: number) => setQueue((q) => q.filter((c) => c.id !== id));

  const choose = async ({ id, analysis, filed }: Choice, code: string | null, type: ResourceType) => {
    dismiss(id);
    void markAi(analysis.aiLog, analysis.suggested && code === analysis.suggested ? "accepted" : "dismissed");
    try {
      showFiled(filed ? await moveResource(filed.sidecar, code, type) : await fileTo(analysis, code, type), analysis);
    } catch (err) {
      toast.error(`Could not file ${analysis.file.name}`, { description: errorText(err) });
    }
    await refresh();
  };

  const current = queue[0];
  const popup = current ? (
    <SortPopup
      key={current.id}
      name={current.analysis.file.name}
      courses={courses.map((e) => e.course)}
      ranked={current.analysis.ranked}
      suggested={current.filed ? undefined : current.analysis.suggested}
      type={current.filed?.type ?? current.analysis.type}
      onChoose={(code, type) => void choose(current, code, type)}
      onClose={() => dismiss(current.id)}
    />
  ) : null;

  return { handle, reading, popup };
}
