import { useContext, useMemo } from "react";
import { Star, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThemedCombobox, type ComboboxOption } from "@/components/ui/field-controls";
import { appUi } from "@/lib/appUi";
import { errorText } from "./errorText";
import type { Topic } from "./model";
import { useObservatorySettings } from "./settings";
import { setTopicLink, TopicNavigateContext, useObservatoryLinksEnabled, useTopicLinkIndex, type LinkKind } from "./topicLinkIndex";

function useTopicLinks(kind: LinkKind, id: string) {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const index = useTopicLinkIndex();
  const navigate = useContext(TopicNavigateContext);
  const linked = index[kind].get(id) ?? [];

  const write = async (topic: Topic, on: boolean) => {
    try {
      await setTopicLink(folder, topic, kind, id, on);
    } catch (err) {
      toast.error(on ? "Could not link the topic" : "Could not unlink the topic", { description: errorText(err) });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    }
  };

  const open = (topic: Topic) => {
    appUi.setObservatoryTarget({ code: topic.course, tab: "Topics", topic: topic.slug });
    navigate?.("observatory");
  };

  return { index, linked, write, open };
}

function Chips({ kind, id }: { kind: LinkKind; id: string }) {
  const { linked, write, open } = useTopicLinks(kind, id);
  if (!linked.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {linked.map((t) => (
        <span key={`${t.course}/${t.slug}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs">
          <button type="button" className="inline-flex min-w-0 items-center gap-1 hover:text-primary" title="Open in The Observatory" onClick={(e) => { e.stopPropagation(); open(t); }}>
            <Star className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate" data-private>{t.title} · {t.course}</span>
          </button>
          <button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={`Unlink ${t.title}`} onClick={(e) => { e.stopPropagation(); void write(t, false); }}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function Control({ kind, id }: { kind: LinkKind; id: string }) {
  const { index, linked, write } = useTopicLinks(kind, id);
  const options = useMemo<ComboboxOption[]>(
    () => index.topics.filter((t) => !t[kind].includes(id)).map((t) => ({ value: `${t.course}/${t.slug}`, label: t.title, hint: t.course })),
    [index.topics, kind, id],
  );
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Linked topics</p>
      <Chips kind={kind} id={id} />
      {!linked.length && !options.length ? null : (
        <ThemedCombobox
          value=""
          onChange={(v) => {
            const topic = index.topics.find((t) => `${t.course}/${t.slug}` === v);
            if (topic) void write(topic, true);
          }}
          options={options}
          placeholder="Link topic…"
          aria-label="Link topic"
          className="w-full"
        />
      )}
    </div>
  );
}

export function TopicChips(props: { kind: LinkKind; id: string }) {
  return useObservatoryLinksEnabled() ? <Chips {...props} /> : null;
}

export function TopicLinkControl(props: { kind: LinkKind; id: string }) {
  return useObservatoryLinksEnabled() ? <Control {...props} /> : null;
}
export { TopicNavigateContext } from "./topicLinkIndex";
