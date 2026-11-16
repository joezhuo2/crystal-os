import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Check, Image, Pencil, Sparkles, Undo2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { ThemedSelect } from "@/components/ui/field-controls";
import { Textarea } from "@/components/ui/textarea";
import { fetchRawNote, saveVaultNote } from "@/hooks/useVault";
import { writeVaultBinary } from "@/lib/vaultNative";
import { unverifiedBadge } from "./CardSource";
import type { Topic } from "./model";
import { isUnverifiedMark, type QuestionType } from "./questions";
import { aiReadQuestion, canvasPng } from "./resources/ai";
import { questionsMarkdown, recordAi, syncPoolLogs } from "./resources/aiRecord";
import { questionImagePath } from "./resources/paths";
import { renderRegion } from "./resources/pdf";
import { isAiUnverified, parsePool, serializePool, withAiReading, type PoolItem } from "./resources/pool";
import { isUnclear, pdfPathOf, questionDraft } from "./resources/process";
import type { Region } from "./resources/types";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { saveQuestion } from "./store";

const UNSORTED = "__unsorted";

const badge = "rounded-full border px-2 text-[10px] uppercase tracking-wide";

function RegionImage({ doc, region }: { doc: PDFDocumentProxy; region: Region }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (region.w <= 0 || region.h <= 0) return;
    let live = true;
    renderRegion(doc, region).then(
      (canvas) => {
        if (!live || !ref.current) return;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        ref.current.replaceChildren(canvas);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [doc, region]);
  return <div ref={ref} role="img" aria-label={`Source region on page ${region.page}`} className="rounded-md bg-white/90 overflow-hidden min-h-8" />;
}

interface Props { path: string; code: string; topics: Topic[]; doc: PDFDocumentProxy | null; type?: QuestionType }

export function PoolView({ path, code, topics, doc, type = "worked" }: Props) {
  const { folder, aiExtract } = useObservatorySettings();
  const ai = useObservatoryAi();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["vault", "pool", path], queryFn: () => fetchRawNote(path), retry: false });
  const pool = useMemo(() => {
    try {
      return data ? parsePool(data.content) : null;
    } catch {
      return null;
    }
  }, [data]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; text: string; answer: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const topicOptions = useMemo(() => [{ value: UNSORTED, label: "Unsorted" }, ...topics.map((t) => ({ value: t.slug, label: t.title }))], [topics]);
  const titleOf = (slug?: string) => topics.find((t) => t.slug === slug)?.title;

  if (isLoading) return <SkeletonLines count={4} />;
  if (error || !pool) return <p className="text-sm text-muted-foreground">No questions found here yet.</p>;

  const fail = (title: string, err: unknown) => toast.error(title, { description: err instanceof Error ? err.message : String(err) });

  const update = async (change: (items: PoolItem[]) => PoolItem[]) => {
    const raw = await fetchRawNote(path);
    const fresh = parsePool(raw.content);
    const items = change(fresh.items);
    await saveVaultNote({ path, content: serializePool({ ...fresh, items }), expectedMtime: raw.mtime });
    await queryClient.invalidateQueries({ queryKey: ["vault"] });
    await syncPoolLogs(fresh.items, items);
  };

  const run = async (title: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      fail(title, err);
    } finally {
      setBusy(false);
    }
  };

  const setState = (ids: Set<string>, state: PoolItem["state"]) =>
    run("Could not update the pool", () => update((items) => items.map((i) => (ids.has(i.id) ? { ...i, state } : i))));

  const hasRegion = (item: PoolItem) => item.region.w > 0 && item.region.h > 0;

  const saveImage = async (item: PoolItem) => {
    if (!doc || !hasRegion(item)) return undefined;
    const path = questionImagePath(folder, code, item.id);
    try {
      await writeVaultBinary(path, canvasPng(await renderRegion(doc, item.region)).bytes, true);
      return path;
    } catch {
      // The vault can refuse the image; the Source link still carries the region for Show source.
      return undefined;
    }
  };

  const accept = (targets: PoolItem[]) =>
    run("Could not accept the question", async () => {
      const done = new Set<string>();
      try {
        for (const item of targets) {
          await saveQuestion(folder, code, item.topic!, questionDraft(item, pool.items, pool.source, type, await saveImage(item)));
          done.add(item.id);
        }
      } finally {
        if (done.size) await update((items) => items.map((i) => (done.has(i.id) ? { ...i, state: "accepted" } : i)));
      }
      setSelected(new Set());
    });

  const saveEdit = () => {
    if (!editing) return;
    const { id, text, answer } = editing;
    return run("Could not save the edit", async () => {
      await update((items) =>
        items.map((i) => {
          if (i.id !== id) return i;
          const { answer: _a, answer_source: _s, ...rest } = i;
          const source = isUnverifiedMark(i.answer_source) ? undefined : i.answer_source;
          return { ...rest, text: text.trim(), ...(answer.trim() ? { answer: answer.trim(), ...(source && { answer_source: source }) } : {}), tags: i.tags.filter((t) => t !== "needs-cleanup" && !isUnverifiedMark(t)) };
        }),
      );
      setEditing(null);
    });
  };

  const reread = (item: PoolItem) =>
    run("Could not re-read the question", async () => {
      const reading = await aiReadQuestion(canvasPng(await renderRegion(doc!, item.region)).base64);
      if (!reading) throw new Error("The AI did not return a question");
      const log = await recordAi({
        code,
        kind: "question-reread",
        title: `Re-read question ${item.number}`,
        markdown: questionsMarkdown([{ number: item.number, page: item.page, text: reading.question, answer: reading.answer }]),
        source: `${pdfPathOf(path, pool.source)}#page=${item.page}`,
      });
      await update((items) => items.map((i) => (i.id === item.id ? { ...withAiReading(i, reading), ...(log && { ai_log: log }) } : i)));
    });

  const toggleSource = (id: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const setTopic = (id: string, slug: string) =>
    run("Could not change the topic", () =>
      update((items) =>
        items.map((i) => {
          if (i.id !== id) return i;
          const { topic: _t, ...rest } = i;
          return slug === UNSORTED ? rest : { ...rest, topic: slug };
        }),
      ),
    );

  const open = pool.items.filter((i) => i.state === "pool");
  const ready = open.filter((i) => i.topic && !isUnclear(i));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {open.length} to review, {pool.items.filter((i) => i.state === "accepted").length} accepted
        </span>
        <Button size="sm" variant="outline" disabled={busy || !ready.length} onClick={() => void accept(ready)}>
          <Check className="h-3.5 w-3.5 mr-1" /> Accept all ({ready.length})
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !selected.size} onClick={() => void setState(selected, "rejected").then(() => setSelected(new Set()))}>
          <X className="h-3.5 w-3.5 mr-1" /> Reject selected ({selected.size})
        </Button>
      </div>
      {!pool.items.length && <p className="text-sm text-muted-foreground">No questions were found.</p>}
      <ul className="space-y-3">
        {pool.items.map((item) => {
          const unclear = isUnclear(item);
          const source = !!doc && hasRegion(item) && (unclear || shown.has(item.id));
          const edit = editing?.id === item.id ? editing : null;
          return (
            <li key={item.id} data-testid="pool-item" className={`glass-card p-3 space-y-2 text-sm ${item.state === "rejected" ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                {item.state === "pool" && (
                  <input type="checkbox" aria-label={`Select ${item.number}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                )}
                <span className="font-medium">{item.number}</span>
                <span className="text-xs text-muted-foreground">p. {item.page}</span>
                {item.answer_source && !isUnverifiedMark(item.answer_source) && <span className={`${badge} border-border text-muted-foreground`}>{item.answer_source}</span>}
                {isAiUnverified(item) && <span className={unverifiedBadge}>AI, unverified</span>}
                {unclear && !isAiUnverified(item) && <span className={`${badge} border-amber-300/60 text-amber-300`}>Unclear</span>}
                {item.state !== "pool" && <span className={`${badge} border-primary/40 text-primary`}>{item.state}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{titleOf(item.topic) ?? "Unsorted"}</span>
              </div>
              <div className={source ? "grid gap-3 sm:grid-cols-2" : undefined}>
                {edit ? (
                  <div className="space-y-2">
                    <Textarea aria-label="Question" value={edit.text} onChange={(e) => setEditing({ ...edit, text: e.target.value })} />
                    <Textarea aria-label="Answer" value={edit.answer} onChange={(e) => setEditing({ ...edit, answer: e.target.value })} />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy || !edit.text.trim()} onClick={() => void saveEdit()}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 min-w-0">
                    <Markdown>{item.text}</Markdown>
                    {item.answer ? (
                      <div className="text-muted-foreground"><Markdown>{item.answer}</Markdown></div>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">No answer</p>
                    )}
                  </div>
                )}
                {source && doc && <RegionImage doc={doc} region={item.region} />}
              </div>
              {item.state === "pool" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ThemedSelect
                    aria-label={`Topic for ${item.number}`}
                    className="w-44 h-8"
                    value={item.topic ?? UNSORTED}
                    options={topicOptions}
                    disabled={busy}
                    onChange={(v) => void setTopic(item.id, v)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: item.id, text: item.text, answer: item.answer ?? "" })}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  {doc && hasRegion(item) && !unclear && (
                    <Button size="sm" variant="ghost" aria-expanded={shown.has(item.id)} onClick={() => toggleSource(item.id)}>
                      <Image className="h-3.5 w-3.5 mr-1" /> {shown.has(item.id) ? "Hide source" : "Show source"}
                    </Button>
                  )}
                  {ai && aiExtract && doc && hasRegion(item) && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reread(item)}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Re-read with AI
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !item.topic}
                    title={item.topic ? undefined : "Pick a topic first"}
                    onClick={() => void accept([item])}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> {unclear ? "Confirm and accept" : "Accept"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setState(new Set([item.id]), "rejected")}>
                    <X className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </div>
              ) : (
                item.state === "rejected" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setState(new Set([item.id]), "pool")}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" /> Restore
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
