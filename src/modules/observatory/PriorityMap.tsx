import { useState, type MouseEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ChevronRight, ExternalLink, Sparkles, Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThemedSelect } from "@/components/ui/field-controls";
import { useAppActivity } from "@/lib/appActivity";
import { isDesktop, openExternal } from "@/lib/platform";
import type { Priority, Topic } from "./model";
import { parseQuestions } from "./questions";
import { priorityScore } from "./queue";
import { useObservatorySettings } from "./settings";
import { cardKey, readCard } from "./srs";
import { topicMastery } from "./stats";
import { saveTopic } from "./store";
import { TopicPanel } from "./TopicPanel";
import { useProgress, useTopicBodies } from "./useObservatory";

const PRIORITIES = (["high", "medium", "low"] as Priority[]).map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }));
const EXPAND_TRANSITION = { type: "tween", duration: 0.2, ease: [0.4, 0, 0.2, 1] } as const;
const weeksLabel = (w: number[]) => (w.length ? `Week${w.length > 1 ? "s" : ""} ${w.join(", ")}` : "");

export function PriorityMap({ code, courseName, topics, initialOpen }: { code: string; courseName?: string; topics: Topic[]; initialOpen?: string }) {
  const { folder } = useObservatorySettings();
  const { still } = useAppActivity();
  const queryClient = useQueryClient();
  const { topics: full } = useTopicBodies(topics);
  const progress = useProgress([code]).progress[code]!;
  const [chosen, setChosen] = useState<Record<string, Priority>>({});
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const now = Date.now();

  const rows = full
    .map((t) => {
      const topic = { ...t, priority: chosen[t.slug] ?? t.priority };
      const ids = parseQuestions(t.body).map((q) => q.id);
      const due = ids.filter((id) => {
        const card = readCard(progress, cardKey(t.slug, id));
        return card && Date.parse(card.dueAt) <= now;
      }).length;
      return { topic, score: priorityScore(topic), mastery: topicMastery(progress, t.slug, ids), due };
    })
    .sort((a, b) => b.score - a.score || (a.topic.weeks[0] ?? Infinity) - (b.topic.weeks[0] ?? Infinity) || a.topic.title.localeCompare(b.topic.title));
  const allMastered = rows.length > 0 && rows.every((r) => r.mastery >= 1);

  const setPriority = async (t: Topic, priority: Priority) => {
    setChosen((c) => ({ ...c, [t.slug]: priority }));
    try {
      await saveTopic(folder, code, t.slug, { priority });
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    } catch (err) {
      toast.error("Could not save the priority", { description: err instanceof Error ? err.message : String(err) });
    }
    setChosen(({ [t.slug]: _drop, ...rest }) => rest);
  };

  const openLearn = (e: MouseEvent, url: string) => {
    if (!isDesktop()) return;
    e.preventDefault();
    openExternal(url).catch((err: unknown) => toast.error("Could not open Learn", { description: err instanceof Error ? err.message : String(err) }));
  };

  return (
    <section className="space-y-2">
      {allMastered && (
        <p className="glass-card px-4 py-3 flex items-center gap-2 text-sm text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Constellation complete: every topic is mastered.
        </p>
      )}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No topics yet. Import an outline to add them.</p>}
      {rows.map(({ topic: t, score, mastery, due }) => (
        <div key={t.slug} className="glass-card px-4 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Star
              className="h-4 w-4 shrink-0 text-primary"
              style={{ opacity: 0.25 + 0.75 * mastery }}
              fill={mastery > 0 ? "currentColor" : "none"}
              role="img"
              aria-label={`Mastery ${Math.round(mastery * 100)}%`}
            />
            <button
              type="button"
              className="flex items-center gap-1 font-medium text-left"
              aria-expanded={open === t.slug}
              onClick={() => setOpen((o) => (o === t.slug ? null : t.slug))}
            >
              <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open === t.slug ? "rotate-90" : ""}`} />
              {t.title}
            </button>
            {t.objective && (
              <span className="rounded-full border border-primary/40 text-primary px-2 text-[10px] uppercase tracking-wide">Objective</span>
            )}
            {t.tutorial !== undefined && (
              <span className="rounded-full border border-border px-2 text-[10px] uppercase tracking-wide text-muted-foreground">Tutorial {t.tutorial}</span>
            )}
            <span className="text-xs text-muted-foreground">{[weeksLabel(t.weeks), t.pages && `pp. ${t.pages}`].filter(Boolean).join(" · ")}</span>
            <div className="ml-auto flex items-center gap-3">
              {t.learn_url && (
                <a
                  href={t.learn_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={(e) => openLearn(e, t.learn_url!)}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" /> Learn
                </a>
              )}
              <span className="text-xs text-muted-foreground">{due} due</span>
              <span className="text-xs tabular-nums text-muted-foreground" title="Priority score">{+score.toFixed(2)}</span>
              <ThemedSelect
                aria-label={`Priority for ${t.title}`}
                className="w-28 h-8"
                value={t.priority}
                options={PRIORITIES}
                onChange={(v) => void setPriority(t, v as Priority)}
              />
            </div>
          </div>
          <AnimatePresence initial={false}>
            {open === t.slug && (
              <m.div
                key="panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={still ? { duration: 0 } : EXPAND_TRANSITION}
                className="overflow-hidden"
              >
                <TopicPanel topic={t} due={due} courseName={courseName} />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </section>
  );
}
