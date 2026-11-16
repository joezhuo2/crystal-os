import { createContext, useMemo } from "react";
import { useVaultNotes } from "@/hooks/useVault";
import { useIsInstalled } from "@/lib/installedModules";
import { isDesktop } from "@/lib/platform";
import { moduleById, type TabId } from "@/modules/registry";
import { topicFromData, type Topic } from "./model";
import { useObservatorySettings } from "./settings";
import { saveTopic } from "./store";

export const TopicNavigateContext = createContext<((tab: TabId) => void) | undefined>(undefined);

export type LinkKind = "tasks" | "events";

export interface TopicLinkIndex {
  topics: Topic[];
  tasks: Map<string, Topic[]>;
  events: Map<string, Topic[]>;
}

export function buildTopicLinkIndex(notes: { path: string; title: string; frontmatter: Record<string, unknown> }[], folder: string): TopicLinkIndex {
  const topics = notes.flatMap((n) => {
    const m = /^([^/]+)\/topics\/([^/]+)\.md$/.exec(n.path.startsWith(`${folder}/`) ? n.path.slice(folder.length + 1) : "");
    return m ? [topicFromData({ ...n.frontmatter, title: n.title, course: m[1] }, m[2]!)] : [];
  });
  const group = (kind: LinkKind) => {
    const map = new Map<string, Topic[]>();
    for (const t of topics) for (const id of t[kind]) map.set(id, [...(map.get(id) ?? []), t]);
    return map;
  };
  return { topics, tasks: group("tasks"), events: group("events") };
}

export function setTopicLink(folder: string, topic: Topic, kind: LinkKind, id: string, linked: boolean): Promise<void> {
  const rest = topic[kind].filter((x) => x !== id);
  return saveTopic(folder, topic.course, topic.slug, { [kind]: linked ? [...rest, id] : rest });
}

export function useObservatoryLinksEnabled(): boolean {
  const installed = useIsInstalled("observatory");
  return installed && (isDesktop() || !moduleById.observatory.desktopOnly);
}

export function useTopicLinkIndex(enabled = true): TopicLinkIndex {
  const { folder } = useObservatorySettings();
  const { data } = useVaultNotes({ limit: 10000 }, enabled);
  return useMemo(() => buildTopicLinkIndex(data?.notes ?? [], folder), [data, folder]);
}
