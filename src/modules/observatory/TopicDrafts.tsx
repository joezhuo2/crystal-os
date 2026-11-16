import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ActionButton } from "./ActionButton";
import { markAi, recordAi } from "./resources/aiRecord";
import { DraftCard } from "./DraftCard";
import { DRAFT_TAGS, draftedTopic, draftTopics, type DraftTopic } from "./draft";
import { errorText } from "./errorText";
import type { Course, Topic } from "./model";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { createTopic } from "./store";

const topicsMarkdown = (ds: DraftTopic[]) =>
  ds
    .map((d) => [`## ${d.title}`, d.summary, d.keyPoints.map((k) => `- ${k}`).join("\n"), d.outcomes.length ? `Outcomes: ${d.outcomes.join("; ")}` : ""].filter(Boolean).join("\n\n"))
    .join("\n\n");

export function TopicDrafts({ course, topics }: { course: Course; topics: Topic[] }) {
  const { folder, aiDraft } = useObservatorySettings();
  const ai = useObservatoryAi();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<DraftTopic[]>([]);
  const log = useRef<{ path?: string; accepted: boolean }>({ accepted: false });
  if (!aiDraft || !ai) return null;

  const draft = async () => {
    try {
      const next = await draftTopics(course, topics);
      if (!next.length) toast.error("The AI did not suggest any new topics");
      if (log.current.path && !log.current.accepted && drafts.length) void markAi(log.current.path, "dismissed");
      log.current = { path: next.length ? await recordAi({ code: course.code, kind: "draft topics", title: course.code, markdown: topicsMarkdown(next) }) : undefined, accepted: false };
      setDrafts(next);
      return true;
    } catch (err) {
      toast.error("Could not draft topics", { description: errorText(err) });
      return false;
    }
  };

  const accept = async (d: DraftTopic) => {
    try {
      await createTopic(folder, course.code, draftedTopic(d, course.code, new Set(topics.map((t) => t.slug))), DRAFT_TAGS);
      setDrafts((ds) => ds.filter((x) => x !== d));
      if (!log.current.accepted) {
        log.current.accepted = true;
        await markAi(log.current.path, "accepted");
      }
      return true;
    } catch (err) {
      toast.error(`Could not create ${d.title}`, { description: errorText(err) });
      return false;
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    }
  };

  return (
    <section className="space-y-2">
      <ActionButton variant="outline" size="sm" pending="Drafting" done="Drafted" action={draft}>
        <Sparkles className="h-3.5 w-3.5 mr-1" /> Draft topics
      </ActionButton>
      {drafts.map((d) => (
        <DraftCard key={d.title} label={`Drafted topic ${d.title}`} onAccept={() => accept(d)} onDiscard={() => {
          const rest = drafts.filter((x) => x !== d);
          setDrafts(rest);
          if (!rest.length && !log.current.accepted) void markAi(log.current.path, "dismissed");
        }}>
          <p className="font-medium text-sm">{d.title}</p>
          {d.summary && <p className="text-sm text-muted-foreground">{d.summary}</p>}
          {d.keyPoints.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {d.keyPoints.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          )}
          {d.outcomes.length > 0 && <p className="text-xs text-primary">Outcomes: {d.outcomes.join("; ")}</p>}
        </DraftCard>
      ))}
    </section>
  );
}
