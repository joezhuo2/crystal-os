import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Markdown } from "@/components/Markdown";
import { aiBodyKey, readAiBody, useAiNotes, type AiFilter, type AiNote } from "./aiNotes";
import { PROSE } from "./QuestionEditor";

function HistoryItem({ note }: { note: AiNote }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: aiBodyKey(note.path), queryFn: () => readAiBody(note.path), enabled: open });
  return (
    <li>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {note.day} {note.title}
          {note.status && note.status !== "pending" && <span className="ml-1.5 opacity-70">({note.status})</span>}
        </summary>
        <div className="pt-2">
          {error ? (
            <p className="text-xs text-destructive">Could not read {note.path}</p>
          ) : isLoading || data == null ? (
            <p className="text-xs text-muted-foreground">Loading</p>
          ) : (
            <div className={PROSE}>
              <Markdown>{data}</Markdown>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

export function AiHistory({ code, filter, label, enabled = true }: { code: string; filter: AiFilter; label: string; enabled?: boolean }) {
  const notes = useAiNotes(code, filter, enabled);
  if (!enabled || !notes.length) return null;
  return (
    <details className="text-sm" data-testid="ai-history">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {label} ({notes.length})
      </summary>
      <ul className="space-y-1.5 pt-2 pl-3">
        {notes.map((n) => (
          <HistoryItem key={n.path} note={n} />
        ))}
      </ul>
    </details>
  );
}
