import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ChevronRight, Dices, FolderSearch, GraduationCap, Plus, Sparkles, Star, ThumbsDown, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { ThemedSelect } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVaultNotes } from "@/hooks/useVault";
import { useAppActivity } from "@/lib/appActivity";
import { isDesktop } from "@/lib/platform";
import { useAiBodies, useAiNotes } from "../aiNotes";
import { markAi, recordAi } from "../resources/aiRecord";
import { draftsMarkdown } from "../draft";
import { errorText } from "../errorText";
import type { Course, Topic } from "../model";
import { parseQuestions } from "../questions";
import { ReviewView } from "../ReviewView";
import { useObservatoryAi, useObservatorySettings } from "../settings";
import { topicMastery } from "../stats";
import { TopicPanel } from "../TopicPanel";
import {
  DEEP_SKY,
  DEEP_SKY_COURSE,
  SUGGESTION_KINDS,
  addDeepSkyTopic,
  addNotInterested,
  appendCards,
  draftCards,
  moveToCourse,
  suggestFromProjects,
  suggestRandom,
  summaryBody,
  unverifiedCount,
  withCards,
  type CardDraft,
  type Suggestion,
} from "./deepsky";
import { useDeepSkyQueue, useDeepSkyTopics, useNotInterested } from "./hooks";

const ALL = { limit: 10000 };
const EXPAND = { duration: 0.2, ease: "easeOut" } as const;
const KINDS = Object.values(SUGGESTION_KINDS);
const sourceOf = (kind: string): Suggestion["source"] => (kind === SUGGESTION_KINDS.projects ? "projects" : "random");

function AddTopicForm({ canDraft, busy, onAdd, onCancel }: { canDraft: boolean; busy: boolean; onAdd: (title: string, notes: string, draft: boolean) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const submit = (e: FormEvent, draft = false) => {
    e.preventDefault();
    if (title.trim()) onAdd(title, notes, draft);
  };
  return (
    <form className="glass-card p-4 space-y-3" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor="deepsky-title" className="text-xs text-muted-foreground">Topic</Label>
        <Input id="deepsky-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How bridges carry load" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="deepsky-notes" className="text-xs text-muted-foreground">Notes (optional)</Label>
        <Textarea id="deepsky-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you already know, links, or what you want to learn" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || !title.trim()}>Add topic</Button>
        {canDraft && (
          <Button type="button" size="sm" variant="outline" disabled={busy || !title.trim()} onClick={(e) => submit(e, true)}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Add and draft cards with AI
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function TopicRow({ topic, courses, mastery, canDraft, busy, onDraft, onMove }: {
  topic: Topic; courses: Course[]; mastery: number; canDraft: boolean; busy: boolean; onDraft: () => void; onMove: (code: string) => void;
}) {
  const { still } = useAppActivity();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const cards = parseQuestions(topic.body).length;
  const unverified = unverifiedCount(topic.body);
  return (
    <div className="glass-card px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Star className="h-4 w-4 shrink-0 text-primary" style={{ opacity: 0.25 + 0.75 * mastery }} fill={mastery > 0 ? "currentColor" : "none"} role="img" aria-label={`Mastery ${Math.round(mastery * 100)}%`} />
        <button type="button" className="flex items-center gap-1 font-medium text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          <span data-private>{topic.title}</span>
        </button>
        {unverified > 0 && (
          <span className="rounded-full border border-primary/40 text-primary px-2 text-[10px] uppercase tracking-wide" title="Written by AI and not checked yet. Editing a card marks it checked.">
            {unverified} unverified
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{cards} card{cards === 1 ? "" : "s"}</span>
          {canDraft && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDraft}>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Draft cards
            </Button>
          )}
          {isDesktop() && courses.length > 0 && (
            <>
              <ThemedSelect
                aria-label={`Move ${topic.title} to a course`}
                className="w-36 h-8"
                placeholder="Move to course"
                value={target}
                options={courses.map((c) => ({ value: c.code, label: c.code, color: c.color }))}
                onChange={setTarget}
              />
              {target && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onMove(target)}>
                  Move
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <m.div key="panel" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={still ? { duration: 0 } : EXPAND} className="overflow-hidden">
            <TopicPanel topic={topic} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DeepSkyView({ courses }: { courses: Course[] }) {
  const { still } = useAppActivity();
  const { folder, aiDraft, deepSkyProjects, deepSkyRandom } = useObservatorySettings();
  const ai = useObservatoryAi();
  const queryClient = useQueryClient();
  const { topics, loading } = useDeepSkyTopics();
  const queue = useDeepSkyQueue();
  const notInterested = useNotInterested();
  const canDraft = !!ai && aiDraft;
  const canProjects = !!ai && deepSkyProjects;
  const canRandom = !!ai && deepSkyRandom;
  const { data: vault } = useVaultNotes(ALL, canProjects);
  const [reviewing, setReviewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState<Suggestion[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const stored = useAiNotes(DEEP_SKY, { kind: KINDS, status: "pending" });
  const bodies = useAiBodies(stored.map((n) => n.path));
  const suggestions = useMemo(() => {
    const kept = stored
      .filter((n) => !fresh.some((s) => s.path === n.path))
      .map((n): Suggestion => ({ title: n.title, summary: bodies[n.path] ?? "", source: sourceOf(n.kind), path: n.path }));
    return [...fresh, ...kept].filter((s) => !s.path || !gone.includes(s.path));
  }, [fresh, stored, bodies, gone]);
  const [busy, setBusy] = useState(false);
  const live = courses.filter((c) => !c.archived);
  const slugs = topics.map((t) => t.slug);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vault"] });
  const run = async (failure: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(failure, { description: errorText(err) });
    } finally {
      setBusy(false);
      void refresh();
    }
  };
  const drop = (s: Suggestion) => {
    setFresh((list) => list.filter((x) => x !== s));
    if (s.path) setGone((list) => [...list, s.path!]);
  };
  const dismiss = (s: Suggestion) => {
    drop(s);
    void markAi(s.path, "dismissed").then(refresh);
  };
  const recordCards = (title: string, cards: CardDraft[]) =>
    recordAi({ code: DEEP_SKY, kind: "draft cards", title, markdown: draftsMarkdown(cards) });

  const suggest = (source: Suggestion["source"]) =>
    run("Could not get suggestions", async () => {
      const exclude = [...notInterested, ...topics.map((t) => t.title), ...suggestions.map((s) => s.title)];
      const next = source === "projects" ? await suggestFromProjects(vault?.notes ?? [], exclude) : await suggestRandom(exclude);
      if (!next.length) toast("No new ideas this time");
      const logged: Suggestion[] = [];
      for (const s of next) logged.push({ ...s, path: await recordAi({ code: DEEP_SKY, kind: SUGGESTION_KINDS[s.source], title: s.title, markdown: s.summary || s.title }) });
      setFresh((list) => [...logged, ...list]);
    });

  const add = (title: string, notes: string, draft: boolean) =>
    run("Could not add the topic", async () => {
      const cards = draft ? await draftCards(title, notes) : [];
      const log = cards.length ? await recordCards(title, cards) : undefined;
      const body = draft ? withCards(notes, cards) : notes.trim() ? `${notes.trim()}\n` : "";
      await addDeepSkyTopic(folder, title, body, slugs);
      await markAi(log, "applied");
      setAdding(false);
    });

  const accept = (s: Suggestion) =>
    run("Could not add the topic", async () => {
      await addDeepSkyTopic(folder, s.title, summaryBody(s.summary), slugs);
      drop(s);
      await markAi(s.path, "accepted");
    });

  const reject = (s: Suggestion) =>
    run("Could not save your choice", async () => {
      await addNotInterested(folder, s.title);
      drop(s);
      await markAi(s.path, "dismissed");
    });

  const draftFor = (t: Topic) =>
    run("Could not draft cards", async () => {
      const cards = await draftCards(t.title, t.body);
      const log = await recordCards(t.title, cards);
      await appendCards(folder, t.slug, cards);
      await markAi(log, "applied");
    });

  const move = (t: Topic, code: string) =>
    run("Could not move the topic", async () => {
      await moveToCourse(folder, t.slug, code);
      toast.success(`Moved ${t.title} to ${code}`);
    });

  if (reviewing) return <ReviewView courses={[DEEP_SKY_COURSE]} source="Deep Sky" onClose={() => setReviewing(false)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Casual learning outside your courses. {queue.due} card{queue.due === 1 ? "" : "s"} to review.
        </p>
        {canProjects && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void suggest("projects")}>
            <FolderSearch className="h-3.5 w-3.5 mr-1" /> Suggest from my projects
          </Button>
        )}
        {canRandom && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void suggest("random")}>
            <Dices className="h-3.5 w-3.5 mr-1" /> Random ideas
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={!queue.due} onClick={() => setReviewing(true)}>
          <GraduationCap className="h-3.5 w-3.5 mr-1" /> Review
        </Button>
        <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add topic
        </Button>
      </div>

      {adding && <AddTopicForm canDraft={canDraft} busy={busy} onAdd={(t, n, d) => void add(t, n, d)} onCancel={() => setAdding(false)} />}

      {suggestions.length > 0 && (
        <section className="space-y-2" aria-label="Suggestions">
          <p className="text-xs uppercase tracking-widest text-primary">Suggestions</p>
          {suggestions.map((s) => (
            <m.div
              key={s.path ?? s.title}
              initial={still ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: still ? 0 : 0.18 }}
              className="glass-card px-4 py-3 text-sm space-y-2"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium" data-private>{s.title}</span>
                <span className="text-xs text-muted-foreground">{s.source === "projects" ? "From your projects" : "Random idea"}</span>
              </div>
              {s.summary && <p className="text-muted-foreground">{s.summary}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void accept(s)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismiss(s)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reject(s)}>
                  <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Not interested
                </Button>
              </div>
            </m.div>
            ))}
        </section>
      )}

      {loading ? (
        <div role="status" aria-label="Loading Deep Sky" className="glass-card p-4">
          <SkeletonLines count={3} />
        </div>
      ) : topics.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-2">
          <p className="font-semibold">No Deep Sky topics yet</p>
          <p className="text-sm text-muted-foreground">
            Add something you are curious about and write a few cards for it.
            {!canProjects && !canRandom && " Suggestions from your projects and random ideas need an AI provider and their switches in Settings → The Observatory."}
          </p>
        </div>
      ) : (
        <section className="space-y-2" aria-label="Deep Sky topics">
          {topics.map((t) => (
            <TopicRow
              key={t.slug}
              topic={t}
              courses={live}
              mastery={topicMastery(queue.progress, t.slug, parseQuestions(t.body).map((q) => q.id))}
              canDraft={canDraft}
              busy={busy}
              onDraft={() => void draftFor(t)}
              onMove={(code) => void move(t, code)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
