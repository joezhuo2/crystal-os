import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  FileText,
  NotebookPen,
  Search,
  Tag as TagIcon,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useVaultNote, useVaultNotes, type VaultNote } from "@/hooks/useVault";
import { useDebouncedValue } from "@/lib/utils";

function relativeDate(note: VaultNote): string {
  const ms = note.date ? Date.parse(note.date) : note.mtime;
  if (!ms || Number.isNaN(ms)) return "";
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

function TagChip({
  tag,
  active,
  onClick,
}: {
  tag: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border"
      style={{
        background: active ? "hsl(239 84% 67% / 0.18)" : "hsl(0 0% 100% / 0.04)",
        borderColor: active ? "hsl(239 84% 67% / 0.4)" : "hsl(0 0% 100% / 0.08)",
        color: active ? "hsl(239 84% 80%)" : undefined,
      }}
    >
      {tag}
    </button>
  );
}

function NoteRow({
  note,
  active,
  onSelect,
}: {
  note: VaultNote;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-colors border"
      style={{
        background: active ? "hsl(239 84% 67% / 0.12)" : "transparent",
        borderColor: active ? "hsl(239 84% 67% / 0.25)" : "transparent",
      }}
    >
      <p className="text-sm font-medium truncate">{note.title}</p>
      <p className="text-xs text-muted-foreground truncate mt-0.5">
        {note.tags.length > 0 ? note.tags.join(" · ") : "untagged"} — {relativeDate(note)}
      </p>
      {note.matchContext && (
        <p className="text-[11px] text-muted-foreground/70 mt-1 line-clamp-2">
          {note.matchContext}
        </p>
      )}
    </button>
  );
}

/** Rewrite Obsidian wikilinks so they resolve against the notes we actually have. */
function resolveWikilinks(content: string, notes: VaultNote[]): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, alias?: string) => {
      const label = (alias ?? target).trim();
      const wanted = target.trim().toLowerCase();
      const hit = notes.find(
        (n) =>
          n.title.toLowerCase() === wanted ||
          n.path.toLowerCase() === `${wanted}.md` ||
          n.path.toLowerCase().endsWith(`/${wanted}.md`),
      );
      // Unresolved links stay plain text rather than becoming dead anchors.
      return hit ? `[${label}](#vault/${encodeURIComponent(hit.path)})` : label;
    },
  );
}

function NoteReader({ notes }: { notes: VaultNote[] }) {
  const { selectedNotePath, setSelectedNotePath } = useApp();
  const { data: note, isLoading, error } = useVaultNote(selectedNotePath);

  if (!selectedNotePath) {
    return (
      <div className="glass-card p-10 flex flex-col items-center justify-center text-center h-full min-h-[320px]">
        <FileText className="w-8 h-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Select a note to read it here.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass-card p-6 space-y-3 min-h-[320px]">
        <div className="w-1/2 h-6 rounded bg-primary/10 animate-pulse" />
        <div className="w-1/3 h-3 rounded bg-primary/5 animate-pulse" />
        <div className="space-y-2 pt-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-full h-3 rounded bg-primary/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="glass-card p-6 min-h-[320px]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Could not open this note</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error?.message ?? "Unknown error"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const extras = Object.entries(note.frontmatter);
  const body = resolveWikilinks(note.content, notes);

  return (
    <motion.div
      key={note.path}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 min-h-[320px]"
    >
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
        {note.path}
      </p>
      <h2 className="text-2xl font-bold tracking-tight">{note.title}</h2>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {note.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded-full text-[11px]"
            style={{ background: "hsl(239 84% 67% / 0.12)", color: "hsl(239 84% 80%)" }}
          >
            {tag}
          </span>
        ))}
        {note.status && (
          <span
            className="px-2 py-0.5 rounded-full text-[11px]"
            style={{ background: "hsl(160 84% 39% / 0.12)", color: "hsl(160 84% 55%)" }}
          >
            {note.status}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{relativeDate(note)}</span>
      </div>

      {extras.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 p-3 rounded-lg bg-background/30">
          {extras.map(([key, value]) => (
            <div key={key} className="text-xs min-w-0">
              <span className="text-muted-foreground uppercase tracking-wider">{key}</span>{" "}
              <span className="text-foreground/80 break-all">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      <div
        className="prose prose-invert prose-sm max-w-none mt-6 prose-headings:tracking-tight prose-a:text-primary"
        onClick={(e) => {
          // Wikilinks render as #vault/<path> anchors — keep them in-app.
          const anchor = (e.target as HTMLElement).closest("a");
          const href = anchor?.getAttribute("href");
          if (href?.startsWith("#vault/")) {
            e.preventDefault();
            setSelectedNotePath(decodeURIComponent(href.slice("#vault/".length)));
          }
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </motion.div>
  );
}

export default function ArchivePage() {
  const { selectedNotePath, setSelectedNotePath, setShowQuickAdd, setQuickAddDraft } = useApp();
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);

  const { data, isLoading, error } = useVaultNotes({
    q: debouncedSearch.trim() || undefined,
    tag: activeTag ?? undefined,
  });

  const notes = useMemo(() => data?.notes ?? [], [data]);

  const openQuickAdd = () => {
    setQuickAddDraft("");
    setShowQuickAdd(true);
  };

  const header = (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-gradient-indigo">The Archive</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your Obsidian vault</p>
      </div>
      <button
        onClick={openQuickAdd}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
        style={{
          background: "hsl(160 84% 39% / 0.12)",
          borderColor: "hsl(160 84% 39% / 0.25)",
          color: "hsl(160 84% 55%)",
        }}
      >
        <NotebookPen className="w-4 h-4" />
        Quick Add
      </button>
    </div>
  );

  if (error) {
    return (
      <div>
        {header}
        <div className="glass-card p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Vault unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
              <p className="text-xs text-muted-foreground/70 mt-2">
                Set <code>OBSIDIAN_VAULT_PATH</code> in <code>.env.local</code> and restart
                the dev server.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-4">
        {/* ── Left rail: search, tags, note list ── */}
        <div className="glass-card p-4 flex flex-col gap-3 h-[70vh] lg:h-[calc(100vh-13rem)]">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/30">
            <Search className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the vault…"
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Top half: tags, scrolls on its own so a big tag cloud never buries the list. */}
          {(data?.allTags.length ?? 0) > 0 && (
            <div className="flex-1 basis-0 min-h-0 overflow-y-auto scrollbar-thin -mx-1 px-1">
              <div className="flex flex-wrap gap-1.5">
                <TagChip
                  tag="all"
                  active={activeTag === null}
                  onClick={() => setActiveTag(null)}
                />
                {data!.allTags.map((tag) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    active={activeTag === tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-white/5 shrink-0">
            <TagIcon className="w-3 h-3" />
            {isLoading ? "Loading…" : `${data?.total ?? 0} note${data?.total === 1 ? "" : "s"}`}
          </div>

          {/* Bottom half: filtered notes. */}
          <div className="flex-1 basis-0 min-h-0 overflow-y-auto scrollbar-thin space-y-1 -mx-1 px-1">
            {isLoading &&
              [...Array(6)].map((_, i) => (
                <div key={i} className="px-3 py-2.5 space-y-1.5">
                  <div className="w-2/3 h-4 rounded bg-primary/10 animate-pulse" />
                  <div className="w-1/2 h-3 rounded bg-primary/5 animate-pulse" />
                </div>
              ))}

            {!isLoading && notes.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-6 text-center">
                No notes match.
              </p>
            )}

            {!isLoading &&
              notes.map((note, i) => (
                <motion.div
                  key={note.path}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <NoteRow
                    note={note}
                    active={selectedNotePath === note.path}
                    onSelect={() => setSelectedNotePath(note.path)}
                  />
                </motion.div>
              ))}
          </div>
        </div>

        {/* ── Right pane: reader ── */}
        <NoteReader notes={notes} />
      </div>
    </div>
  );
}
