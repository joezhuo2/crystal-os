import { createContext, useContext, useState } from "react";
import { FileText, X } from "lucide-react";
import { useVaultNotes } from "@/hooks/useVault";
import { appUi } from "@/lib/appUi";
import type { TabId } from "@/components/layout/Navigation";

export const NoteNavigateContext = createContext<((tab: TabId) => void) | undefined>(undefined);

const noteName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");

export function NoteLinkButton({ path }: { path: string }) {
  const navigate = useContext(NoteNavigateContext);
  if (!navigate) return null;
  return (
    <button
      type="button"
      title={`Open ${path}`}
      aria-label={`Open note ${noteName(path)}`}
      onClick={(e) => {
        e.stopPropagation();
        appUi.setSelectedNotePath(path);
        navigate("archive");
      }}
      className="text-primary/80 hover:text-primary shrink-0"
    >
      <FileText className="w-2.5 h-2.5" />
    </button>
  );
}

export function NotePicker({ value, onChange }: { value: string | undefined; onChange: (path: string | undefined) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const { data } = useVaultNotes({ q, limit: 5 }, q.length >= 2);
  const results = q.length >= 2 ? (data?.notes ?? []) : [];

  if (value) {
    return (
      <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 text-sm">
        <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="flex-1 truncate" title={value}>{value}</span>
        <button type="button" aria-label="Unlink note" onClick={() => onChange(undefined)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search vault notes"
        placeholder="Search your vault…"
        className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
      />
      {results.map((note) => (
        <button
          key={note.path}
          type="button"
          onClick={() => {
            onChange(note.path);
            setQuery("");
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs hover:bg-primary/10"
        >
          <FileText className="w-3 h-3 shrink-0" />
          <span className="truncate">{note.title}</span>
          <span className="ml-auto truncate text-muted-foreground/60">{note.path}</span>
        </button>
      ))}
    </div>
  );
}
