import { useState } from "react";
import { ClipboardCheck, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { ActionButton } from "./ActionButton";
import { AiHistory } from "./AiHistory";
import { recordAi } from "./resources/aiRecord";
import { EMPTY_WORK, checkWork, gradeName, hasWork, solveQuestion, workMarkdown, type WorkCheck } from "./aiStudy";
import { errorText } from "./errorText";
import { topicPath } from "./model";
import { PROSE } from "./QuestionEditor";
import { withSolution, type Question } from "./questions";
import type { QueueItem } from "./queue";
import { useObservatorySettings } from "./settings";
import type { Grade } from "./srs";
import { editTopicBody } from "./store";
import { WorkInput } from "./WorkInput";

const useSource = (item: QueueItem, q: Question) => `${topicPath(useObservatorySettings().folder, item.course, item.topic.slug)}#${q.id}`;

export function SolutionDetails({ text, open }: { text: string; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-dashed border-primary/40 px-3 py-2" data-testid="ai-solution">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        AI solution <span className="ml-1 rounded-full border border-amber-300/60 px-1.5 text-[10px] uppercase tracking-wide text-amber-300">unverified</span>
      </summary>
      <div className={`${PROSE} pt-2`}>
        <Markdown>{text}</Markdown>
      </div>
    </details>
  );
}

export function CheckWork({ item, question, onHint }: { item: QueueItem; question: Question; onHint: (g: Grade | null) => void }) {
  const queryClient = useQueryClient();
  const source = useSource(item, question);
  const [open, setOpen] = useState(false);
  const [work, setWork] = useState(EMPTY_WORK);
  const [result, setResult] = useState<WorkCheck | null>(null);

  const check = async () => {
    let r: WorkCheck;
    try {
      r = await checkWork(question, work);
    } catch (err) {
      toast.error("Could not check your work", { description: errorText(err) });
      return false;
    }
    setResult(r);
    onHint(r.grade);
    const hint = r.grade ? `\n\nSuggested grade: ${gradeName(r.grade)}` : "";
    await recordAi({ code: item.course, kind: "check my work", title: `${item.topic.title} ${question.id}`, markdown: `${workMarkdown(work)}\n\n## Feedback\n\n${r.feedback}${hint}`, source });
    void queryClient.invalidateQueries({ queryKey: ["vault"] });
    return true;
  };

  return (
    <div className="space-y-2">
      {!open ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Check my work
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <WorkInput work={work} onChange={setWork} label="Your working" placeholder="Type your working, or attach a photo of it" />
          <ActionButton size="sm" disabled={!hasWork(work)} pending="Checking" done="Checked" action={check}>
            Check my work
          </ActionButton>
          {result && (
            <div className="space-y-2 border-t border-border/40 pt-2" role="status" aria-label="Work feedback">
              <div className={PROSE}>
                <Markdown>{result.feedback}</Markdown>
              </div>
              {result.grade && (
                <p className="text-xs text-muted-foreground">
                  Suggested grade: <span className="font-medium text-foreground">{gradeName(result.grade)}</span>. You still pick the grade.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <AiHistory code={item.course} filter={{ kind: "check my work", source }} label="Past feedback" />
    </div>
  );
}

export function SolutionStrip({ item, grade, canAi }: { item: QueueItem; grade: Grade; canAi: boolean }) {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const q = item.question;
  const source = useSource(item, q);
  const [text, setText] = useState<string | null>(null);

  const generate = async () => {
    let md: string;
    try {
      md = await solveQuestion(q);
    } catch (err) {
      toast.error("Could not generate a solution", { description: errorText(err) });
      return false;
    }
    setText(md);
    let applied = true;
    try {
      await editTopicBody(folder, item.course, item.topic.slug, (body) => withSolution(body, q.id, md));
    } catch (err) {
      applied = false;
      toast.error("Could not add the solution to the card", { description: errorText(err) });
    }
    await recordAi({ code: item.course, kind: "solution", title: `${item.topic.title} ${q.id}`, markdown: md, source, status: applied ? "applied" : "pending" });
    void queryClient.invalidateQueries({ queryKey: ["vault"] });
    return true;
  };

  if (!canAi && !text) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border/40 px-3 py-2 text-xs" aria-label="Last graded card" role="group">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">
          Graded {gradeName(grade)}: {item.topic.title} {q.id}
        </span>
        {canAi && (
          <ActionButton size="sm" variant="ghost" className="ml-auto" pending="Solving" done="Solved" action={generate}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate solution
          </ActionButton>
        )}
      </div>
      {text && <SolutionDetails text={text} open />}
    </div>
  );
}
