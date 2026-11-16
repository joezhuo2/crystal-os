import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BLANK, fromQuestion, isComplete, keepSolution, toDraft, type Fields } from "./questionFields";
import type { Question, QuestionDraft, QuestionType } from "./questions";

export const PROSE = "prose prose-invert prose-sm max-w-none prose-headings:tracking-tight prose-a:text-primary";

const TYPE_LABELS: Record<QuestionType, string> = {
  mc: "Multiple choice",
  worked: "Worked problem",
  output: "Predict the output",
  bug: "Spot the bug",
  card: "Flashcard",
};
export const QuestionTypeLabel = ({ type }: { type: QuestionType }) => (
  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{TYPE_LABELS[type]}</span>
);

const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as QuestionType[]).map((value) => ({ value, label: TYPE_LABELS[value] }));

const TEXT_LABEL: Record<QuestionType, string> = { mc: "Question", worked: "Problem", output: "Question (optional)", bug: "Question (optional)", card: "Front" };

export function QuestionEditor({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial?: Question;
  pending?: boolean;
  onSave: (draft: Omit<QuestionDraft, "id">) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [f, setF] = useState<Fields>(() => (initial ? fromQuestion(initial) : BLANK));
  const set = (patch: Partial<Fields>) => setF((x) => ({ ...x, ...patch }));
  const draft = toDraft(f);
  const code = (label: string, value: string, key: "code" | "expected") => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`} className="text-xs text-muted-foreground">{label}</Label>
      <Textarea id={`${id}-${key}`} className="font-mono text-xs" spellCheck={false} value={value} onChange={(e) => set(key === "code" ? { code: e.target.value } : { expected: e.target.value })} />
    </div>
  );

  return (
    <form
      className="space-y-3 rounded-lg border border-border/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (isComplete(f)) onSave(keepSolution(initial, draft));
      }}
    >
      <ThemedSelect aria-label="Question type" className="w-48" value={f.type} options={TYPE_OPTIONS} onChange={(v) => set({ type: v as QuestionType })} />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-text`} className="text-xs text-muted-foreground">{TEXT_LABEL[f.type]}</Label>
        <Textarea id={`${id}-text`} value={f.text} onChange={(e) => set({ text: e.target.value })} />
      </div>

      {f.type === "mc" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Options (tick the correct ones)</Label>
          {f.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Switch
                aria-label={`Option ${i + 1} correct`}
                checked={o.correct}
                onCheckedChange={(v) => set({ options: f.options.map((x, j) => (j === i ? { ...x, correct: v } : x)) })}
              />
              <Input
                aria-label={`Option ${i + 1}`}
                value={o.text}
                onChange={(e) => set({ options: f.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
              />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${i + 1}`} onClick={() => set({ options: f.options.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => set({ options: [...f.options, { text: "", correct: false }] })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add option
          </Button>
        </div>
      )}

      {f.type === "worked" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Steps</Label>
          {f.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="pt-2 text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
              <Textarea
                aria-label={`Step ${i + 1}`}
                className="min-h-[56px]"
                value={s}
                onChange={(e) => set({ steps: f.steps.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${i + 1}`} onClick={() => set({ steps: f.steps.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => set({ steps: [...f.steps, ""] })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add step
          </Button>
        </div>
      )}

      {(f.type === "output" || f.type === "bug") && code("Code", f.code, "code")}
      {f.type === "output" && code("Expected output", f.expected, "expected")}
      {f.type === "bug" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-line`} className="text-xs text-muted-foreground">Line with the bug</Label>
          <NumberInput id={`${id}-line`} min="1" className="w-24" value={f.line} onChange={(e) => set({ line: e.target.value })} />
        </div>
      )}
      {f.type !== "worked" && f.type !== "output" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-answer`} className="text-xs text-muted-foreground">{f.type === "card" ? "Back" : "Explanation (optional)"}</Label>
          <Textarea id={`${id}-answer`} value={f.answer} onChange={(e) => set({ answer: e.target.value })} />
        </div>
      )}

      <div className="rounded-md bg-background/40 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Preview</p>
        <div className={PROSE}>
          <Markdown>{draft.prompt || "*Nothing yet*"}</Markdown>
        </div>
        {draft.answer && (
          <div className={`${PROSE} border-t border-border/60 pt-2 opacity-80`}>
            <Markdown>{draft.answer}</Markdown>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !isComplete(f)}>
          Save question
        </Button>
      </div>
    </form>
  );
}
