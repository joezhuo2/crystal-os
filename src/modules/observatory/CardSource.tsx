import { useEffect, useRef, useState } from "react";
import { Image, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { VaultImage } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { readVaultBinary } from "@/lib/vaultNative";
import { errorText } from "./errorText";
import type { QuestionDraft, QuestionSource } from "./questions";
import { aiReadQuestion, bytesBase64, canvasPng } from "./resources/ai";
import { questionsMarkdown, recordAi } from "./resources/aiRecord";
import { isMathGarbled } from "./resources/confidence";
import { renderPage, renderRegion } from "./resources/pdf";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { saveQuestion } from "./store";

export const unverifiedBadge = "rounded-full border border-amber-300/60 px-2 text-[10px] uppercase tracking-wide text-amber-300";

async function sourceCanvas(src: QuestionSource): Promise<HTMLCanvasElement> {
  const bytes = new Uint8Array(await readVaultBinary(src.pdf!));
  return src.region ? renderRegion(bytes, { page: src.page!, ...src.region }) : renderPage(bytes, src.page!);
}

async function sourceBase64(src: QuestionSource): Promise<string> {
  const fromPdf = async () => canvasPng(await sourceCanvas(src)).base64;
  if (!src.image) return fromPdf();
  return readVaultBinary(src.image).then((b) => bytesBase64(new Uint8Array(b)), (err: unknown) => (src.pdf && src.page ? fromPdf() : Promise.reject(err)));
}

function PdfSource({ src }: { src: QuestionSource }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    sourceCanvas(src).then(
      (canvas) => {
        if (!live || !ref.current) return;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        ref.current.replaceChildren(canvas);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [src]);
  if (failed) return <p className="text-xs text-muted-foreground">Could not open the source PDF.</p>;
  return <div ref={ref} role="img" aria-label={`Source on page ${src.page}`} className="rounded-md bg-white/90 overflow-hidden min-h-8" />;
}

export function CardSource({ code, slug, question, src, onChange }: {
  code: string;
  slug: string;
  question: QuestionDraft;
  src: QuestionSource;
  onChange: (next: QuestionDraft) => void;
}) {
  const { folder, aiExtract } = useObservatorySettings();
  const ai = useObservatoryAi();
  const queryClient = useQueryClient();
  const hasSource = !!src.image || !!(src.pdf && src.page);
  const [open, setOpen] = useState(() => hasSource && (!src.body || isMathGarbled(src.body)));
  const [busy, setBusy] = useState(false);
  const canReread = hasSource && !!ai && aiExtract && (question.type === "card" || question.type === "worked");

  const reread = async () => {
    setBusy(true);
    try {
      const reading = await aiReadQuestion(await sourceBase64(src));
      if (!reading) throw new Error("The AI did not return a question");
      const next: QuestionDraft = { ...question, prompt: [reading.question, src.tail].filter(Boolean).join("\n\n"), answer: reading.answer || question.answer, unverified: true };
      await saveQuestion(folder, code, slug, next);
      await recordAi({
        code,
        kind: "question-reread",
        title: `Re-read question ${question.id}`,
        markdown: questionsMarkdown([{ number: question.id, page: src.page, text: reading.question, answer: reading.answer }]),
        source: src.pdf ? `${src.pdf}${src.page ? `#page=${src.page}` : ""}` : src.image,
        status: "applied",
      });
      onChange(next);
      void queryClient.invalidateQueries({ queryKey: ["vault"] });
    } catch (err) {
      toast.error("Could not re-read the question", { description: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!hasSource && !question.unverified) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {question.unverified && <span className={unverifiedBadge}>AI, unverified</span>}
        {hasSource && (
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Image className="h-3.5 w-3.5 mr-1" /> {open ? "Hide source" : "Show source"}
          </Button>
        )}
        {canReread && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reread()}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Re-read with AI
          </Button>
        )}
      </div>
      {open && hasSource && (src.image ? <VaultImage path={src.image} alt="Question source" fallback={src.pdf && src.page ? <PdfSource src={src} /> : undefined} /> : <PdfSource src={src} />)}
    </div>
  );
}
