import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AiStreamEvent } from "@/lib/ai";
import { parseCitations, type AskSource, type AskTurn } from "./aiAsk";
import { errorText } from "./errorText";
import { PROSE } from "./QuestionEditor";

export type ChatRun = (turns: AskTurn[], onEvent: (e: AiStreamEvent) => void, onSources: (sent: AskSource[]) => void, signal: AbortSignal) => Promise<void>;

function Reply({ turn, live, finding, onSource }: { turn: AskTurn; live: boolean; finding: boolean; onSource?: (s: AskSource) => void }) {
  const thinkingNow = live && !turn.text;
  const status = finding && !turn.sources ? "Finding the pages…" : "Thinking…";
  const { text, cited } = turn.sources ? parseCitations(turn.text, turn.sources) : { text: turn.text, cited: [] };
  const listed = cited.length || live ? cited : (turn.sources ?? []);
  return (
    <div className="space-y-2">
      {turn.thinking ? (
        <details open={thinkingNow} className="rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground">
          <summary className={`cursor-pointer select-none ${thinkingNow ? "motion-safe:animate-pulse" : ""}`}>{thinkingNow ? "Thinking…" : "Thinking"}</summary>
          <p className="mt-2 whitespace-pre-wrap">{turn.thinking}</p>
        </details>
      ) : (
        thinkingNow && <p className="text-xs text-muted-foreground motion-safe:animate-pulse" role="status">{status}</p>
      )}
      {text && (
        <div className={PROSE}>
          <Markdown>{text}</Markdown>
          {live && <span aria-hidden="true" className="inline-block h-4 w-1.5 rounded-sm bg-foreground/70 motion-safe:animate-pulse" />}
        </div>
      )}
      {turn.truncated && <p className="text-xs text-amber-300">The reply hit the length limit and was cut off.</p>}
      {listed.length > 0 && (
        <ol aria-label={cited.length ? "Sources" : "Pages read"} className="space-y-0.5 text-xs">
          {listed.map((s, i) => (
            <li key={s.key}>
              <button type="button" className="text-left text-primary hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={!onSource} onClick={() => onSource?.(s)}>
                {cited.length ? `[${i + 1}] ` : ""}
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface Props {
  run: ChatRun;
  label: string;
  placeholder: string;
  defaultAsk?: string;
  autoAsk?: boolean;
  finding?: boolean;
  onSource?: (s: AskSource) => void;
  children?: ReactNode;
}

export function AiChat({ run, label, placeholder, defaultAsk, autoAsk, finding = false, onSource, children }: Props) {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [live, setLive] = useState<AskTurn | null>(null);
  const [draft, setDraft] = useState("");
  const started = useRef(false);
  const stop = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => () => stop.current?.abort(), []);

  useLayoutEffect(() => {
    const box = end.current?.offsetParent ? end.current.closest("section, [role=dialog]") : null;
    if (live && box && box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
  }, [live]);

  const send = async (text: string) => {
    if (live || !text) return;
    const next: AskTurn[] = [...turns, { role: "user", text }];
    const reply: AskTurn = { role: "assistant", text: "" };
    const ctl = new AbortController();
    stop.current = ctl;
    setTurns(next);
    setDraft("");
    setLive(reply);
    try {
      await run(
        next,
        (e) => {
          if (e.type === "done") reply.truncated = e.truncated;
          else reply[e.type] = (reply[e.type] ?? "") + e.text;
          setLive({ ...reply });
        },
        (sent) => {
          reply.sources = sent;
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
    if (!autoAsk || !defaultAsk || started.current) return;
    started.current = true;
    void send(defaultAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 p-1">
      {children}
      {turns.map((t, i) =>
        t.role === "user" ? (
          <p key={i} className="ml-6 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">{t.text}</p>
        ) : (
          <Reply key={i} turn={t} live={false} finding={finding} onSource={onSource} />
        ),
      )}
      {live && <Reply turn={live} live finding={finding} onSource={onSource} />}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft.trim() || defaultAsk || "");
        }}
      >
        <Textarea
          aria-label={label}
          rows={2}
          className="min-h-0 resize-none text-sm"
          placeholder={turns.length ? "Ask a follow-up" : placeholder}
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
