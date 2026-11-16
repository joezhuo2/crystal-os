import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { vaultErrorCode } from "@/hooks/useVault";
import { ActionButton } from "./ActionButton";
import { markAi, recordAi } from "./resources/aiRecord";
import { DraftCard } from "./DraftCard";
import { draftQuestions, draftsMarkdown, draftSummary, withSummary, type DraftQuestion } from "./draft";
import { errorText } from "./errorText";
import { topicPath, type Topic } from "./model";
import { PROSE, QuestionEditor, QuestionTypeLabel } from "./QuestionEditor";
import { parseQuestions, topicSummary, type QuestionDraft } from "./questions";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { releaseFocus, requestFocus } from "./focus";
import { editTopicBody, saveQuestion } from "./store";
import { TopicLinks } from "./TopicLinks";
import { WorkReview } from "./WorkReview";

type Logged = DraftQuestion & { log?: string };

export function TopicPanel({ topic, due = 0, courseName = "" }: { topic: Topic; due?: number; courseName?: string }) {
  const { folder, aiDraft } = useObservatorySettings();
  const ai = useObservatoryAi();
  const canDraft = aiDraft && !!ai;
  const [drafts, setDrafts] = useState<Logged[]>([]);
  const [summaryDraft, setSummaryDraft] = useState<{ text: string; log?: string } | null>(null);
  const acceptedLogs = useRef(new Set<string>());
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const summary = topicSummary(topic.body);

  useEffect(() => {
    requestFocus("topic", { code: topic.course, slug: topic.slug, title: topic.title, taskId: topic.tasks[0] });
    return () => releaseFocus("topic");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.course, topic.slug]);
  const questions = parseQuestions(topic.body);

  const save = async (draft: Omit<QuestionDraft, "id">, id?: string) => {
    setPending(true);
    try {
      await saveQuestion(folder, topic.course, topic.slug, { ...draft, id });
      setEditing(null);
    } catch (err) {
      if (vaultErrorCode(err) === "conflict") toast.error("The topic note changed while saving", { description: "It has been reloaded. Save again to keep your question." });
      else toast.error("Could not save the question", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    }
  };

  const course = { code: topic.course, name: courseName };
  const draft = async <T,>(what: string, make: () => Promise<T>, keep: (v: T) => void) => {
    try {
      keep(await make());
      return true;
    } catch (err) {
      toast.error(`Could not draft ${what}`, { description: errorText(err) });
      return false;
    }
  };
  const write = async (task: () => Promise<unknown>) => {
    try {
      await task();
      return true;
    } catch (err) {
      toast.error("Could not save to the topic note", { description: errorText(err) });
      return false;
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    }
  };
  const record = (kind: string, markdown: string) => recordAi({ code: topic.course, kind, title: topic.title, markdown, source: topicPath(folder, topic.course, topic.slug) });
  const acceptQuestion = async (d: Logged) => {
    const { log, ...q } = d;
    const ok = await write(() => saveQuestion(folder, topic.course, topic.slug, q));
    if (ok) {
      setDrafts((ds) => ds.filter((x) => x !== d));
      if (log && !acceptedLogs.current.has(log)) {
        acceptedLogs.current.add(log);
        await markAi(log, "accepted");
      }
    }
    return ok;
  };
  const discardQuestion = (d: Logged) => {
    const rest = drafts.filter((x) => x !== d);
    setDrafts(rest);
    if (d.log && !acceptedLogs.current.has(d.log) && !rest.some((x) => x.log === d.log)) void markAi(d.log, "dismissed");
  };
  const acceptSummary = async ({ text, log }: { text: string; log?: string }) => {
    const ok = await write(() => editTopicBody(folder, topic.course, topic.slug, (body) => withSummary(body, text)));
    if (ok) {
      setSummaryDraft(null);
      await markAi(log, "accepted");
    }
    return ok;
  };

  return (
    <div className="space-y-3 pt-3 text-sm">
      <TopicLinks topic={topic} due={due} />
      {summary && (
        <div className={`${PROSE} text-muted-foreground`}>
          <Markdown>{summary}</Markdown>
        </div>
      )}
      {!summary && canDraft && summaryDraft === null && (
        <ActionButton variant="outline" size="sm" pending="Drafting" done="Drafted" action={() => draft("a summary", async () => {
          const text = await draftSummary(course, topic);
          return { text, log: await record("draft summary", text) };
        }, setSummaryDraft)}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> Draft summary
        </ActionButton>
      )}
      {summaryDraft !== null && (
        <DraftCard label="Drafted summary" onAccept={() => acceptSummary(summaryDraft)} onDiscard={() => {
          void markAi(summaryDraft.log, "dismissed");
          setSummaryDraft(null);
        }}>
          <div className={PROSE}>
            <Markdown>{summaryDraft.text}</Markdown>
          </div>
        </DraftCard>
      )}
      <ul className="space-y-2">
        {questions.map((q) =>
          editing === q.id ? (
            <li key={q.id}>
              <QuestionEditor initial={q} pending={pending} onSave={(d) => void save(d, q.id)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={q.id} className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <QuestionTypeLabel type={q.type} />
                <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label={`Edit question ${q.id}`} disabled={editing !== null} onClick={() => setEditing(q.id)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className={PROSE}>
                <Markdown>{q.prompt}</Markdown>
              </div>
              {q.answer && (
                <div className={`${PROSE} border-t border-border/60 pt-2 text-muted-foreground`}>
                  <Markdown>{q.answer}</Markdown>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      {editing === "" ? (
        <QuestionEditor pending={pending} onSave={(d) => void save(d)} onCancel={() => setEditing(null)} />
      ) : (
        <Button variant="outline" size="sm" disabled={editing !== null} onClick={() => setEditing("")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add question
        </Button>
      )}
      {canDraft && (
        <ActionButton variant="outline" size="sm" className="ml-2" pending="Drafting" done="Drafted" action={() => draft("questions", async () => {
          const qs = await draftQuestions(course, topic);
          const log = qs.length ? await record("draft questions", draftsMarkdown(qs)) : undefined;
          return qs.map((q) => ({ ...q, log }));
        }, (qs) => {
          if (!qs.length) toast.error("The AI did not suggest any usable questions");
          setDrafts((ds) => [...ds, ...qs.filter((q) => !ds.some((x) => x.prompt === q.prompt))]);
        })}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> Draft questions
        </ActionButton>
      )}
      <WorkReview topic={topic} courseName={courseName} />
      {drafts.map((d, i) => (
        <DraftCard key={d.prompt} label={`Drafted question ${i + 1}`} onAccept={() => acceptQuestion(d)} onDiscard={() => discardQuestion(d)}>
          <QuestionTypeLabel type={d.type} />
          <div className={PROSE}>
            <Markdown>{d.prompt}</Markdown>
          </div>
          {d.answer && (
            <div className={`${PROSE} border-t border-border/60 pt-2 text-muted-foreground`}>
              <Markdown>{d.answer}</Markdown>
            </div>
          )}
        </DraftCard>
      ))}
      {!questions.length && editing === null && <p className="text-xs text-muted-foreground">No questions yet.</p>}
    </div>
  );
}
