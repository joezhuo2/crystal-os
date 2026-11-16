import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionButton } from "./ActionButton";
import { AiHistory } from "./AiHistory";
import { recordAi } from "./resources/aiRecord";
import { EMPTY_WORK, hasWork, reviewWork, workMarkdown } from "./aiStudy";
import { errorText } from "./errorText";
import { topicPath, type Topic } from "./model";
import { PROSE } from "./QuestionEditor";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { WorkInput } from "./WorkInput";

export function WorkReview({ topic, courseName }: { topic: Topic; courseName: string }) {
  const { folder } = useObservatorySettings();
  const ai = useObservatoryAi();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [work, setWork] = useState(EMPTY_WORK);
  const [feedback, setFeedback] = useState<string | null>(null);
  const source = topicPath(folder, topic.course, topic.slug);

  const review = async () => {
    let md: string;
    try {
      md = await reviewWork({ code: topic.course, name: courseName }, topic, work);
    } catch (err) {
      toast.error("Could not review your work", { description: errorText(err) });
      return false;
    }
    setFeedback(md);
    await recordAi({ code: topic.course, kind: "work review", title: topic.title, markdown: `${workMarkdown(work)}\n\n## Feedback\n\n${md}`, source });
    void queryClient.invalidateQueries({ queryKey: ["vault"] });
    return true;
  };

  return (
    <>
      {ai && (
        <Button variant="outline" size="sm" className="ml-2" onClick={() => setOpen(true)}>
          <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Review my work
        </Button>
      )}
      <AiHistory code={topic.course} filter={{ kind: "work review", source }} label="Past work reviews" />
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review my work: {topic.title}</DialogTitle>
              <DialogDescription>Add an assignment, notes or a solution. The AI checks it against this topic's summary, key points and questions.</DialogDescription>
            </DialogHeader>
            <WorkInput pdf work={work} onChange={setWork} label="Your work" placeholder="Paste your work here, or attach a PDF or images" />
            <ActionButton size="sm" disabled={!hasWork(work)} pending="Reviewing" done="Reviewed" action={review}>
              Review
            </ActionButton>
            {feedback && (
              <div className={`${PROSE} border-t border-border/40 pt-3`} role="status" aria-label="Work review">
                <Markdown>{feedback}</Markdown>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
