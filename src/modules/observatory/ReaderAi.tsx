import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { imageUrl, type AiImage } from "./aiImages";
import { streamCapture, type CaptureTurn } from "./aiStudy";
import { errorText } from "./errorText";
import { PROSE } from "./QuestionEditor";
import { useObservatoryAi, useObservatorySettings } from "./settings";

const DEFAULT_ASK = "Help me with what I highlighted.";

function Reply({ turn, live }: { turn: CaptureTurn; live: boolean }) {
  const thinkingNow = live && !turn.text;
  return (
    <div className="space-y-2">
      {turn.thinking ? (
        <details open={thinkingNow} className="rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground">
          <summary className={`cursor-pointer select-none ${thinkingNow ? "motion-safe:animate-pulse" : ""}`}>{thinkingNow ? "Thinking…" : "Thinking"}</summary>
          <p className="mt-2 whitespace-pre-wrap">{turn.thinking}</p>
        </details>
      ) : (
        thinkingNow && <p className="text-xs text-muted-foreground motion-safe:animate-pulse" role="status">Thinking…</p>
      )}
      {turn.text && (
        <div className={PROSE}>
          <Markdown>{turn.text}</Markdown>
          {live && <span aria-hidden="true" className="inline-block h-4 w-1.5 rounded-sm bg-foreground/70 motion-safe:animate-pulse" />}
        </div>
      )}
      {turn.truncated && <p className="text-xs text-amber-300">The reply hit the length limit and was cut off.</p>}
    </div>
  );
}

export function ReaderAi({ image, onClear }: { image: AiImage | null; onClear: () => void }) {
  const ai = useObservatoryAi();
  const { aiCaptureAsk } = useObservatorySettings();
  const [turns, setTurns] = useState<CaptureTurn[]>([]);
  const [live, setLive] = useState<CaptureTurn | null>(null);
  const [draft, setDraft] = useState("");
  const started = useRef(false);
  const stop = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const src = useMemo(() => (image ? imageUrl(image) : ""), [image]);

  useEffect(() => () => stop.current?.abort(), []);

  useLayoutEffect(() => {
    const box = end.current?.offsetParent ? end.current.closest("section") : null;
    if (live && box && box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
  }, [live]);

  const send = async (text: string) => {
    if (!image || live) return;
    const next: CaptureTurn[] = [...turns, { role: "user", text }];
    const reply: CaptureTurn = { role: "assistant", text: "" };
    const ctl = new AbortController();
    stop.current = ctl;
    setTurns(next);
    setDraft("");
    setLive(reply);
    try {
      await streamCapture(
        image,
        next,
        (e) => {
          if (e.type === "done") reply.truncated = e.truncated;
          else reply[e.type] = (reply[e.type] ?? "") + e.text;
          setLive({ ...reply });
        },
        ctl.signal,
      );
      if (!reply.text.trim()) throw new Error("The AI reply was empty");
      setTurns([...next, { ...reply, text: reply.text.trim() }]);
    } catch (err) {
      if (ctl.signal.aborted) return;
      setTurns(turns);
      setDraft(text);
      toast.error("Could not ask the AI", { description: errorText(err) });
    } finally {
      if (!ctl.signal.aborted) setLive(null);
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
        <img src={src} alt="Captured region" className="max-h-40 rounded-md border border-border/60 bg-white object-contain" />
        <Button type="button" variant="secondary" size="icon" className="absolute right-1 top-1 h-6 w-6" aria-label="Remove captured region" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {turns.map((t, i) =>
        t.role === "user" ? (
          <p key={i} className="ml-6 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">{t.text}</p>
        ) : (
          <Reply key={i} turn={t} live={false} />
        ),
      )}
      {live && <Reply turn={live} live />}
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
        <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!!live} aria-label="Ask the AI">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <div ref={end} />
    </div>
  );
}
