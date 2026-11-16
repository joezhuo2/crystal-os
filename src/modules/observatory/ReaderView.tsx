import { useEffect, useMemo, useRef, useState } from "react";
import { releaseFocus, requestFocus } from "./focus";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { ThemedSelect } from "@/components/ui/field-controls";
import { fetchRawNote } from "@/hooks/useVault";
import { parseFrontmatter, readVaultBinary } from "@/lib/vaultNative";
import type { Topic } from "./model";
import { FindQuestionsButton } from "./FindQuestions";
import { PoolView } from "./PoolView";
import type { Resource } from "./resources/ingest";
import { ocrPage } from "./resources/ocr";
import { openPdf, renderPage } from "./resources/pdf";
import { chapterPoolPath } from "./resources/process";
import { UNCLEAR_BELOW } from "./resources/types";

interface BookChapter { number: string; title: string; start: number; end: number }

const chaptersOf = (v: unknown): BookChapter[] =>
  Array.isArray(v)
    ? v.flatMap((c: Record<string, unknown>) =>
        c?.number != null && Number(c.start) > 0 ? [{ number: String(c.number), title: String(c.title ?? ""), start: Number(c.start), end: Number(c.end ?? c.start) }] : [])
    : [];

function PageView({ doc, n, scanned }: { doc: PDFDocumentProxy; n: number; scanned: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  const [ocr, setOcr] = useState<{ text: string; confidence: number } | null>(null);

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "600px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    renderPage(doc, n, 1.5).then(
      async (canvas) => {
        if (!live || !ref.current) return;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        ref.current.querySelector("[data-canvas]")?.replaceChildren(canvas);
        if (!scanned) return;
        const r = await ocrPage(canvas);
        if (live) setOcr({ text: r.text.trim(), confidence: r.confidence });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [visible, doc, n, scanned]);

  return (
    <div ref={ref} data-page={n} className="space-y-2">
      <div data-canvas className="rounded-md bg-white/90 overflow-hidden min-h-64" role="img" aria-label={`Page ${n}`} />
      {scanned && (
        <div className="glass-card p-3 text-sm space-y-1">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            OCR text, page {n}
            {(!ocr || ocr.confidence < UNCLEAR_BELOW) && (
              <span className="rounded-full border border-amber-300/60 px-2 text-[10px] uppercase tracking-wide text-amber-300">Unclear</span>
            )}
          </p>
          <p className="whitespace-pre-wrap text-muted-foreground">{ocr ? ocr.text || "No text recognised." : "Reading…"}</p>
        </div>
      )}
    </div>
  );
}

interface Props { resource: Resource; code: string; topics: Topic[]; onBack: () => void }

export function ReaderView({ resource, code, topics, onBack }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState<string>("");
  const pagesRef = useRef<HTMLDivElement>(null);
  const { data: note } = useQuery({ queryKey: ["vault", "resource", resource.sidecar], queryFn: () => fetchRawNote(resource.sidecar) });

  useEffect(() => {
    requestFocus("resource", { code, slug: "_resource", title: resource.title || resource.name });
    return () => releaseFocus("resource");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.sidecar]);
  const meta = useMemo(() => (note ? parseFrontmatter(note.content).data : {}), [note]);
  const chapters = useMemo(() => chaptersOf(meta.chapters), [meta]);
  const scanned = useMemo(() => new Set(Array.isArray(meta.needs_ocr) ? meta.needs_ocr.map(Number) : []), [meta]);

  useEffect(() => {
    let live = true;
    let opened: PDFDocumentProxy | null = null;
    readVaultBinary(resource.pdf)
      .then((buf) => openPdf(new Uint8Array(buf)))
      .then(
        (d) => {
          opened = d;
          if (live) setDoc(d);
          else void d.loadingTask.destroy();
        },
        (err: unknown) => live && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      live = false;
      if (opened) void opened.loadingTask.destroy();
    };
  }, [resource.pdf]);

  const current = chapters.find((c) => c.number === chapter) ?? chapters[0];
  const jump = (value: string) => {
    setChapter(value);
    const start = chapters.find((c) => c.number === value)?.start;
    pagesRef.current?.querySelector(`[data-page="${start}"]`)?.scrollIntoView({ block: "start" });
  };

  const poolPath =
    resource.type === "textbook"
      ? chapterPoolPath(resource.sidecar, current?.number ?? "0")
      : resource.type === "question-sheet" || resource.type === "slides" || Array.isArray(meta.items)
        ? resource.sidecar
        : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Resources
        </Button>
        <h3 className="font-medium truncate">{resource.title || resource.name}</h3>
        <FindQuestionsButton jobs={[{ resource, code, topics }]} label={`Find questions in ${resource.name} with AI`} />
        {chapters.length > 0 && (
          <ThemedSelect
            aria-label="Chapter"
            className="w-56 h-8 ml-auto"
            value={current?.number ?? ""}
            options={chapters.map((c) => ({ value: c.number, label: `${c.number}. ${c.title} (pp. ${c.start}-${c.end})` }))}
            onChange={jump}
          />
        )}
      </div>
      <div className={poolPath ? "grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : undefined}>
        <div ref={pagesRef} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {error && <p className="text-sm text-destructive">Could not open the PDF: {error}</p>}
          {!doc && !error && <SkeletonLines count={6} />}
          {doc && Array.from({ length: doc.numPages }, (_, i) => <PageView key={i + 1} doc={doc} n={i + 1} scanned={scanned.has(i + 1)} />)}
        </div>
        {poolPath && (
          <aside aria-label="Questions" className="space-y-2 max-h-[75vh] overflow-y-auto">
            <h4 className="text-sm font-medium">Questions{current ? `: ${current.title || `Chapter ${current.number}`}` : ""}</h4>
            <PoolView key={poolPath} path={poolPath} code={code} topics={topics} doc={doc} type={resource.type === "slides" ? "card" : "worked"} />
          </aside>
        )}
      </div>
    </div>
  );
}
