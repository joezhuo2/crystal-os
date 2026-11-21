import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { imageUrl, type AiImage } from "./aiImages";
import { askCapture, type CaptureTurn } from "./aiStudy";
import { errorText } from "./errorText";
import { PROSE } from "./QuestionEditor";
import { useObservatoryAi, useObservatorySettings } from "./settings";

const DEFAULT_ASK = "Help me with what I highlighted.";

export function ReaderAi({ image, onClear }: { image: AiImage | null; onClear: () => void }) {
  const ai = useObservatoryAi();
  const { aiCaptureAsk } = useObservatorySettings();
  const [turns, setTurns] = useState<CaptureTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const send = async (text: string) => {
    if (!image || busy) return;
    const next: CaptureTurn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const reply = await askCapture(image, next);
      setTurns([...next, { role: "assistant", text: reply }]);
    } catch (err) {
      setTurns(turns);
      setDraft(text);
      toast.error("Could not ask the AI", { description: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!image || !ai || !aiCaptureAsk || started.current) return;
    started.current = true;
    void send(DEFAULT_ASK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ai) return <p className="text-sm text-muted-foreground">Pick an AI provider in Settings → The Observatory to ask about a region of the page.</p>;
  if (!image) return <p className="text-sm text-muted-foreground">Drag a box over the page to ask the AI about that question or topic.</p>;

  return (
    <div className="space-y-3 p-1">
      <div className="relative w-fit">
        <img src={imageUrl(image)} alt="Captured region" className="max-h-40 rounded-md border border-border/60 bg-white object-contain" />
        <Button type="button" variant="secondary" size="icon" className="absolute right-1 top-1 h-6 w-6" aria-label="Remove captured region" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {turns.map((t, i) =>
        t.role === "user" ? (
          <p key={i} className="ml-6 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">{t.text}</p>
        ) : (
          <div key={i} className={PROSE}>
            <Markdown>{t.text}</Markdown>
          </div>
        ),
      )}
      {busy && <p className="text-xs text-muted-foreground motion-safe:animate-pulse" role="status">Thinking…</p>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft.trim() || DEFAULT_ASK);
        }}
      >
        <Textarea
          aria-label="Ask about the captured region"
          rows={2}
          className="min-h-0 resize-none text-sm"
          placeholder={turns.length ? "Ask a follow-up" : "What do you want to know? Leave blank for a general explanation"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={busy} aria-label="Ask the AI">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
