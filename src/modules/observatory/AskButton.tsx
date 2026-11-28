import { useMemo, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { appUi } from "@/lib/appUi";
import { isDesktop } from "@/lib/platform";
import { AiChat } from "./AiChat";
import { askScope, type AskScope, type AskSource } from "./aiAsk";
import { DEEP_SKY } from "./deepsky/deepsky";
import { IconAction } from "./IconAction";
import type { Course } from "./model";
import { useCourseResources } from "./resources/ingest";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { useCoursesTopics } from "./useObservatory";

function AskDialog({ courses, title, onClose }: { courses: Course[]; title: string; onClose: () => void }) {
  const codes = courses.map((c) => c.code);
  const resources = useCourseResources(codes);
  const { topics } = useCoursesTopics(codes);
  const scope = useMemo<AskScope>(
    () => ({
      courses: courses.map((c) => ({ code: c.code, name: c.name })),
      topics,
      resources: resources.map((r) => ({ pdf: r.pdf, sidecar: r.sidecar, title: r.title || r.name, type: r.type, code: r.code })),
    }),
    [courses, topics, resources],
  );
  const open = (s: AskSource) => {
    onClose();
    appUi.setObservatoryTarget(s.topic ? { code: s.code, tab: "Topics", topic: s.topic } : { code: s.code, tab: "Resources", resource: s.pdf, page: s.page });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>The AI picks the pages and topic notes that fit your question, then answers from them with links to its sources.</DialogDescription>
        </DialogHeader>
        <AiChat
          run={(turns, onEvent, onSources, signal) => askScope(scope, turns, onEvent, onSources, signal)}
          label={title}
          placeholder="What do you want to know?"
          finding
          onSource={open}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AskButton({ courses, flag, label }: { courses: Course[]; flag: "aiAskAll" | "aiAskCourse"; label: string }) {
  const ai = useObservatoryAi();
  const on = useObservatorySettings()[flag];
  const [open, setOpen] = useState(false);
  if (!ai || !on || !isDesktop()) return null;
  const wanted = courses.filter((c) => c.code !== DEEP_SKY);
  return (
    <>
      <IconAction
        icon={MessageCircleQuestion}
        label={label}
        hint="Sends your question, a map of your files and the pages the AI picks to the selected AI provider"
        disabled={!wanted.length}
        action={() => {
          setOpen(true);
          return false;
        }}
      />
      {open && <AskDialog courses={wanted} title={label} onClose={() => setOpen(false)} />}
    </>
  );
}
