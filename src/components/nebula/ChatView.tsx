import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, ArrowRightLeft, Brain, Check, ChevronRight, CircleAlert, Info, Loader2, Send, ShieldQuestion, Square, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { nebula } from "@/hooks/useHarness";
import { stripAnsi } from "@/lib/harness/sanitize";
import { harness } from "@/lib/harness/store";
import type { Block, ChatMessage, ChatMeta } from "@/lib/harness/types";

const ENGINE_LABEL = { dsh: "DeepSeek Harness", claude: "Claude Code" } as const;

function Collapsible({ icon, label, tone, children }: { icon: React.ReactNode; label: React.ReactNode; tone?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`nebula-block ${tone ?? ""}`}>
      <button type="button" className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-xs" onClick={() => setOpen((o) => !o)} disabled={!children}>
        {children ? <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} /> : <span className="w-3" />}
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      {open && children && <div className="border-t border-white/[0.06] px-3 py-2">{children}</div>}
    </div>
  );
}

function Pre({ text }: { text?: string }) {
  if (!text) return null;
  const clean = stripAnsi(text);
  return <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/70 scrollbar-thin">{clean.length > 20000 ? `${clean.slice(0, 20000)}\n…` : clean}</pre>;
}

function BlockView({ chatId, block }: { chatId: string; block: Block }) {
  switch (block.kind) {
    case "text":
      return (
        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:text-xs prose-code:before:content-none prose-code:after:content-none prose-a:text-[var(--nebula-c)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripAnsi(block.text)}</ReactMarkdown>
        </div>
      );
    case "thought":
      return (
        <Collapsible icon={<Brain className="h-3.5 w-3.5 shrink-0 text-white/50" />} label={<span className="text-white/50">Thinking</span>}>
          <Pre text={block.text} />
        </Collapsible>
      );
    case "tool": {
      const icon =
        block.status === "completed" ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : block.status === "failed" ? (
          <X className="h-3.5 w-3.5 shrink-0 text-red-400" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--nebula-c)]" />
        );
      return (
        <Collapsible icon={icon} label={<span className="flex items-center gap-1.5"><Wrench className="h-3 w-3 text-white/40" />{block.title}</span>}>
          {block.input && (
            <>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Input</p>
              <Pre text={block.input} />
            </>
          )}
          {block.output && (
            <>
              <p className="mb-1 mt-2 text-[10px] uppercase tracking-wider text-white/40">Output</p>
              <Pre text={block.output} />
            </>
          )}
        </Collapsible>
      );
    }
    case "permission":
      return (
        <div className={`nebula-permission ${block.status === "pending" ? "nebula-permission-pending" : ""}`}>
          <div className="flex items-start gap-2">
            <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">{block.title}</p>
              {block.detail && <Pre text={block.detail} />}
              {block.status === "pending" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => nebula.answerPermission(chatId, block.id, true)}>
                    Allow once
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => nebula.answerPermission(chatId, block.id, false)}>
                    Deny
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-white/50">{block.status === "allowed" ? "Allowed" : block.status === "denied" ? "Denied" : "Cancelled"}</p>
              )}
            </div>
          </div>
        </div>
      );
    case "notice": {
      const Icon = block.tone === "error" ? CircleAlert : block.tone === "warning" ? AlertTriangle : Info;
      const color = block.tone === "error" ? "text-red-300" : block.tone === "warning" ? "text-amber-300" : "text-white/55";
      return (
        <p className={`flex items-start gap-2 text-xs ${color} [overflow-wrap:anywhere]`}>
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {block.text}
        </p>
      );
    }
    case "handoff":
      return (
        <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-wider text-white/40">
          <span className="h-px flex-1 bg-white/10" />
          <ArrowRightLeft className="h-3 w-3" />
          {ENGINE_LABEL[block.from]} → {ENGINE_LABEL[block.to]}, context summarised
          <span className="h-px flex-1 bg-white/10" />
        </div>
      );
  }
}

const MessageView = memo(function MessageView({ chatId, message }: { chatId: string; message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="space-y-1 px-1">
        {message.blocks.map((block, i) => (
          <BlockView key={i} chatId={chatId} block={block} />
        ))}
      </div>
    );
  }
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="nebula-user-bubble max-w-[85%] whitespace-pre-wrap break-words px-4 py-2.5 text-sm">
          {message.blocks.map((b) => (b.kind === "text" ? b.text : "")).join("")}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[11px] text-white/45">
        <span className="nebula-model-badge">{message.model ?? ENGINE_LABEL[message.engine ?? "dsh"]}</span>
        {message.engine && ENGINE_LABEL[message.engine]}
      </p>
      {message.blocks.length === 0 ? (
        <Loader2 className="h-4 w-4 animate-spin text-white/40" />
      ) : (
        message.blocks.map((block, i) => <BlockView key={block.kind === "tool" || block.kind === "permission" ? block.id : i} chatId={chatId} block={block} />)
      )}
    </div>
  );
});

interface Props {
  chat: ChatMeta;
  messages: ChatMessage[];
  running: boolean;
  stopping: boolean;
  loaded: boolean;
  banner: string | null;
}

export default function ChatView({ chat, messages, running, stopping, loaded, banner }: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    stickToBottom.current = true;
    setDraft("");
  }, [chat.id]);

  // Esc stops from anywhere on the page; open dialogs and menus consume it first.
  useEscapeKey(() => void nebula.stop(chat.id), running);

  const submit = () => {
    const text = draft.trim();
    if (!text || running) return;
    setDraft("");
    stickToBottom.current = true;
    void nebula.send(chat.id, text);
  };

  return (
    <div className="nebula-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      {banner && (
        <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{banner}</span>
          <button type="button" onClick={() => harness.setBanner(chat.id, null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-5 overflow-y-auto px-5 py-5 scrollbar-thin"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!loaded ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-white/40" />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="nebula-title text-2xl font-semibold">What are we building?</p>
            <p className="max-w-sm text-sm text-white/50">
              The agent works inside this project folder. Use Plan mode to explore safely, or Manual to approve each change.
            </p>
          </div>
        ) : (
          messages.map((message) => <MessageView key={message.id} chatId={chat.id} message={message} />)
        )}
      </div>

      <form
        className="border-t border-white/[0.06] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="nebula-composer flex items-end gap-2 p-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={stopping ? "Stopping…" : running ? "Working… (Esc to stop)" : chat.tier === "high" ? "Ask Claude Code…" : "Ask the Nebula…"}
            rows={1}
            className="max-h-48 min-h-[2.5rem] resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          />
          {running ? (
            <Button
              type="button"
              size="icon"
              onClick={() => void nebula.stop(chat.id)}
              aria-label={stopping ? "Force stop" : "Stop"}
              title={stopping ? "Stopping… click again to force stop" : "Stop (Esc)"}
              className="bg-red-500/85 text-white hover:bg-red-600"
            >
              {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send" className="nebula-send">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-white/35">
          {stopping ? "Stopping… press Stop again to force it" : "Enter to send · Shift+Enter for a new line · Esc to stop"}
        </p>
      </form>
    </div>
  );
}
