import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { releaseFocus, requestFocus } from "./focus";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, ChevronDown, FileText, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { ThemedSelect } from "@/components/ui/field-controls";
import { useShortcut } from "@/hooks/useShortcut";
import { fetchRawNote } from "@/hooks/useVault";
import { parseFrontmatter, readVaultBinary } from "@/lib/vaultNative";
import type { AskScope } from "./aiAsk";
import { canvasImage, imageUrl, type AiImage } from "./aiImages";
import type { Topic } from "./model";
import { FindQuestionsButton } from "./FindQuestions";
import { IconAction } from "./IconAction";
import { PoolView } from "./PoolView";
import { ReaderAi } from "./ReaderAi";
import type { Resource } from "./resources/ingest";
import { ocrPage } from "./resources/ocr";
import { openPdf, renderPage } from "./resources/pdf";
import { chapterPoolPath } from "./resources/process";
import { UNCLEAR_BELOW } from "./resources/types";
import { useObservatorySettings } from "./settings";

interface BookChapter { number: string; title: string; start: number; end: number }

const chaptersOf = (v: unknown): BookChapter[] =>
  Array.isArray(v)
    ? v.flatMap((c: Record<string, unknown>) =>
        c?.number != null && Number(c.start) > 0 ? [{ number: String(c.number), title: String(c.title ?? ""), start: Number(c.start), end: Number(c.end ?? c.start) }] : [])
    : [];

const NO_OBSERVER = typeof IntersectionObserver === "undefined";

const PageView = memo(function PageView({ doc, n, scanned, scale, ratio, onRatio }: { doc: PDFDocumentProxy; n: number; scanned: boolean; scale: number; ratio: number; onRatio: (r: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(NO_OBSERVER);
  const [own, setOwn] = useState<number | null>(null);
  const [ocr, setOcr] = useState<{ text: string; confidence: number } | null>(null);
  const ocrStarted = useRef(false);
  const drawn = useRef(0);

  useEffect(() => {
    if (NO_OBSERVER || !ref.current) return;
    const io = new IntersectionObserver(([e]) => setNear(!!e?.isIntersecting), { rootMargin: "600px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || drawn.current === scale) return;
    let live = true;
    renderPage(doc, n, scale).then(
      async (canvas) => {
        if (!live || !ref.current) return;
        drawn.current = scale;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        ref.current.querySelector("[data-canvas]")?.replaceChildren(canvas);
        if (canvas.width > 0) {
          setOwn(canvas.height / canvas.width);
          onRatio(canvas.height / canvas.width);
        }
        if (!scanned || ocrStarted.current) return;
        ocrStarted.current = true;
        const r = await ocrPage(canvas);
        if (live) setOcr({ text: r.text.trim(), confidence: r.confidence });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [near, doc, n, scanned, scale, onRatio]);

  return (
    <div ref={ref} data-page={n} className="space-y-2">
      <div data-canvas className="rounded-md bg-white/90 overflow-hidden" style={{ aspectRatio: `1 / ${own ?? ratio}` }} role="img" aria-label={`Page ${n}`} />
      {scanned && (
        <div data-ocr className="glass-card p-3 text-sm space-y-1">
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
});

const clampZoom = (z: number) => Math.min(3, Math.max(0.5, z));

interface Box { x0: number; y0: number; x1: number; y1: number }
const boxStyle = (b: Box) => ({ left: Math.min(b.x0, b.x1), top: Math.min(b.y0, b.y1), width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0) });

function captureBox(el: HTMLElement, box: Box, name: string): AiImage | null {
  const frame = el.getBoundingClientRect();
  const { left, top, width, height } = boxStyle(box);
  const x = left - el.scrollLeft + frame.left;
  const y = top - el.scrollTop + frame.top;
  const hits = Array.from(el.querySelectorAll<HTMLCanvasElement>("[data-canvas] canvas")).filter((c) => {
    const r = c.getBoundingClientRect();
    return r.width > 0 && r.right > x && r.left < x + width && r.bottom > y && r.top < y + height;
  });
  if (!hits.length) return null;
  const k = hits[0]!.width / hits[0]!.getBoundingClientRect().width;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(width * k));
  out.height = Math.max(1, Math.round(height * k));
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  for (const c of hits) {
    const r = c.getBoundingClientRect();
    ctx.drawImage(c, (r.left - x) * k, (r.top - y) * k, r.width * k, r.height * k);
  }
  return canvasImage(out, `${name} page ${hits[0]!.closest<HTMLElement>("[data-page]")?.dataset.page ?? "?"}`);
}

function Fold({ title, open, onToggle, label, children }: { title: string; open: boolean; onToggle: () => void; label: string; children: ReactNode }) {
  return (
    <>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex items-center gap-1 py-1.5 text-left text-sm font-medium">
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
        <span className="truncate">{title}</span>
      </button>
      <section aria-label={label} className={`min-h-0 overflow-y-auto transition-[visibility] duration-300 motion-reduce:transition-none ${open ? "visible" : "invisible"}`}>
        {children}
      </section>
    </>
  );
}

interface Props { resource: Resource; code: string; topics: Topic[]; onBack: () => void; initialPage?: number }

export function ReaderView({ resource, code, topics, onBack, initialPage }: Props) {
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

  const [full, setFull] = useState(false);
  const keepPage = useRef<Element | null>(null);
  const toggleFull = () => {
    const top = pagesRef.current?.getBoundingClientRect().top ?? 0;
    keepPage.current = Array.from(pagesRef.current?.querySelectorAll("[data-page]") ?? []).find((p) => p.getBoundingClientRect().bottom > top) ?? null;
    setFull((f) => !f);
  };
  useEffect(() => {
    keepPage.current?.scrollIntoView({ block: "start" });
    keepPage.current = null;
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) toggleFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);
  const [zoom, setZoom] = useState(1);
  const [sharp, setSharp] = useState(1.5);
  const [ratio, setRatio] = useState<number | null>(null);
  const onRatio = useRef((r: number) => setRatio((old) => old ?? r)).current;
  const zoomNow = useRef(1);
  const zoomTarget = useRef(1);
  const zoomFrame = useRef(0);
  const zoomAt = useRef<{ x: number; y: number } | undefined>(undefined);
  const anchor = useRef<{ page: Element; fx: number; fy: number; x: number; y: number } | null>(null);
  const zoomStep = () => {
    const el = pagesRef.current;
    const gap = zoomTarget.current - zoomNow.current;
    const next = Math.abs(gap) < 0.004 ? zoomTarget.current : zoomNow.current + gap * 0.35;
    if (el) {
      const frame = el.getBoundingClientRect();
      const x = zoomAt.current?.x ?? frame.left + frame.width / 2;
      const y = zoomAt.current?.y ?? frame.top + frame.height / 2;
      const pages = Array.from(el.querySelectorAll("[data-page]"));
      const page = pages.find((p) => p.getBoundingClientRect().bottom > y) ?? pages[pages.length - 1];
      const r = page?.getBoundingClientRect();
      anchor.current = page && r && r.width > 0 && r.height > 0 ? { page, fx: (x - r.left) / r.width, fy: (y - r.top) / r.height, x, y } : null;
    }
    zoomNow.current = next;
    setZoom(next);
    zoomFrame.current = next === zoomTarget.current ? 0 : requestAnimationFrame(zoomStep);
  };
  const zoomBy = (factor: number, at?: { x: number; y: number }) => {
    const to = clampZoom(zoomTarget.current * factor);
    zoomTarget.current = Math.abs(to - 1) < 1e-6 ? 1 : to;
    zoomAt.current = at;
    zoomFrame.current ||= requestAnimationFrame(zoomStep);
  };
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-Math.max(-10, Math.min(10, e.deltaY)) * 0.01), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(zoomFrame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = pagesRef.current;
    anchor.current = null;
    if (!a || !el) return;
    const r = a.page.getBoundingClientRect();
    el.scrollTop += r.top + a.fy * r.height - a.y;
    el.scrollLeft += r.left + a.fx * r.width - a.x;
  }, [zoom]);
  useEffect(() => {
    const t = window.setTimeout(() => setSharp(zoom > 1.5 ? 3 : 1.5), 250);
    return () => window.clearTimeout(t);
  }, [zoom]);

  const [chats, setChats] = useState<{ id: number; image: AiImage; url: string }[]>([]);
  const [activeChat, setActiveChat] = useState(0);
  const nextChat = useRef(1);
  const closeChat = (id: number) => {
    const rest = chats.filter((c) => c.id !== id);
    setChats(rest);
    if (id === activeChat) setActiveChat(rest[rest.length - 1]?.id ?? 0);
  };
  const [box, setBox] = useState<Box | null>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [poolOpen, setPoolOpen] = useState(true);
  const startBox = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = pagesRef.current;
    if (!el || e.button !== 0 || (e.target as Element).closest("[data-ocr]")) return;
    const frame = el.getBoundingClientRect();
    if (el.clientWidth && (e.clientX - frame.left > el.clientWidth || e.clientY - frame.top > el.clientHeight)) return;
    const point = (ev: { clientX: number; clientY: number }) => {
      const f = el.getBoundingClientRect();
      return { x: ev.clientX - f.left + el.scrollLeft, y: ev.clientY - f.top + el.scrollTop };
    };
    const from = point(e);
    let last: Box | null = null;
    const move = (ev: MouseEvent) => {
      const to = point(ev);
      last = { x0: from.x, y0: from.y, x1: to.x, y1: to.y };
      setBox(last);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setBox(null);
      const drawn = last as Box | null;
      if (!drawn || Math.abs(drawn.x1 - drawn.x0) < 8 || Math.abs(drawn.y1 - drawn.y0) < 8) return;
      const image = captureBox(el, drawn, resource.name);
      if (!image) return;
      const id = nextChat.current++;
      setChats((c) => [...c, { id, image, url: imageUrl(image) }]);
      setActiveChat(id);
      setAiOpen(true);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    e.preventDefault();
  };
  useShortcut("observatory.zoomIn", () => zoomBy(1.25));
  useShortcut("observatory.zoomOut", () => zoomBy(0.8));
  useShortcut("observatory.back", onBack);
  useShortcut("observatory.fullScreen", toggleFull);
  const paneHeight = full ? "h-[calc(100vh-5rem)]" : "h-[75vh]";

  const toPage = (n: number | undefined) => pagesRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: "start" });
  useEffect(() => {
    if (initialPage) toPage(initialPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, ratio]);
  const { aiAskResource } = useObservatorySettings();
  const askScope = useMemo<AskScope>(
    () => ({ courses: [], topics: [], resources: [{ pdf: resource.pdf, sidecar: resource.sidecar, title: resource.title || resource.name, type: resource.type, code }] }),
    [resource, code],
  );

  const current = chapters.find((c) => c.number === chapter) ?? chapters[0];
  const jump = (value: string) => {
    setChapter(value);
    toPage(chapters.find((c) => c.number === value)?.start);
  };

  const poolPath =
    resource.type === "textbook"
      ? chapterPoolPath(resource.sidecar, current?.number ?? "0")
      : resource.type === "question-sheet" || resource.type === "slides" || Array.isArray(meta.items)
        ? resource.sidecar
        : null;

  return (
    <div className={full ? "fixed inset-0 z-50 space-y-3 bg-background p-4" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Resources
        </Button>
        <h3 className="font-medium truncate">{resource.title || resource.name}</h3>
        <FindQuestionsButton jobs={[{ resource, code, topics }]} label={`Find questions in ${resource.name} with AI`} />
        <IconAction
          icon={full ? Minimize2 : Maximize2}
          label={full ? "Exit full screen" : "Full screen"}
          hint="F"
          aria-pressed={full}
          action={() => {
            toggleFull();
            return false;
          }}
        />
        <IconAction icon={ZoomOut} label="Zoom out" hint="−, or Ctrl + scroll" disabled={zoom <= 0.5} action={() => (zoomBy(0.8), false)} />
        <IconAction icon={ZoomIn} label="Zoom in" hint="=, or Ctrl + scroll" disabled={zoom >= 3} action={() => (zoomBy(1.25), false)} />
        {zoom !== 1 && (
          <Button variant="ghost" size="sm" className="tabular-nums" aria-label="Reset zoom" onClick={() => zoomBy(1 / zoomTarget.current)}>
            {Math.round(zoom * 100)}%
          </Button>
        )}
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div ref={pagesRef} className={`relative ${paneHeight} cursor-crosshair overflow-auto pr-1`} onMouseDown={startBox}>
          <div className="mx-auto space-y-4" style={{ width: `${zoom * 100}%` }}>
            {error && <p className="text-sm text-destructive">Could not open the PDF: {error}</p>}
            {!doc && !error && <SkeletonLines count={6} />}
            {doc && Array.from({ length: doc.numPages }, (_, i) => <PageView key={i + 1} doc={doc} n={i + 1} scanned={scanned.has(i + 1)} scale={sharp} ratio={ratio ?? 1.3} onRatio={onRatio} />)}
          </div>
          {box && <div className="pointer-events-none absolute rounded-sm border-2 border-sky-500 bg-sky-500/15" style={boxStyle(box)} />}
        </div>
        <aside
          className={`grid ${paneHeight} transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none`}
          style={{ gridTemplateRows: `auto ${aiOpen ? 3 : 0}fr${poolPath ? ` auto ${poolOpen ? 2 : 0}fr` : ""}` }}
        >
          <Fold title="AI" label="AI" open={aiOpen} onToggle={() => setAiOpen((o) => !o)}>
            {chats.length + (aiAskResource ? 1 : 0) > 1 && (
              <div role="group" aria-label="Chats" className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto bg-background p-1">
                {aiAskResource && (
                  <button
                    type="button"
                    aria-label="Chat about the whole PDF"
                    aria-pressed={activeChat === 0}
                    onClick={() => setActiveChat(0)}
                    className={`flex h-10 w-14 shrink-0 items-center justify-center rounded border transition-opacity ${activeChat === 0 ? "border-sky-500 ring-1 ring-sky-500" : "border-border/60 opacity-60 hover:opacity-100"}`}
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                {chats.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={`Chat ${i + 1}`}
                    aria-pressed={c.id === activeChat}
                    onClick={() => setActiveChat(c.id)}
                    className={`h-10 w-14 shrink-0 overflow-hidden rounded border bg-white transition-opacity ${c.id === activeChat ? "border-sky-500 ring-1 ring-sky-500" : "border-border/60 opacity-60 hover:opacity-100"}`}
                  >
                    <img src={c.url} alt="" className="h-full w-full object-cover object-left-top" />
                  </button>
                ))}
              </div>
            )}
            {aiAskResource ? (
              <div hidden={activeChat !== 0}>
                <ReaderAi image={null} onClear={() => {}} scope={askScope} onPage={toPage} />
              </div>
            ) : (
              chats.length === 0 && <ReaderAi image={null} onClear={() => {}} />
            )}
            {chats.map((c) => (
              <div key={c.id} hidden={c.id !== activeChat}>
                <ReaderAi image={c.image} onClear={() => closeChat(c.id)} />
              </div>
            ))}
          </Fold>
          {poolPath && (
            <Fold title={`Questions${current ? `: ${current.title || `Chapter ${current.number}`}` : ""}`} label="Questions" open={poolOpen} onToggle={() => setPoolOpen((o) => !o)}>
              <PoolView key={poolPath} path={poolPath} code={code} topics={topics} doc={doc} type={resource.type === "slides" ? "card" : "worked"} />
            </Fold>
          )}
        </aside>
      </div>
    </div>
  );
}
