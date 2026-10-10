import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { m } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileText,
  FileX,
  FolderOpen,
  Link2,
  NotebookPen,
  Pencil,
  RotateCw,
  Search,
  Tag as TagIcon,
} from "lucide-react";
import { appUi, useAppUi } from "@/lib/appUi";
import { recordRecent } from "@/lib/recents";
import {
  usePickVault,
  useVaultNote,
  useVaultNotes,
  vaultErrorCode,
  type VaultNote,
} from "@/hooks/useVault";
import { isDesktop } from "@/lib/platform";
import { useDebouncedValue } from "@/lib/utils";
import {
  buildLinkTargets,
  noteConnections,
  relatedByCategory,
  resolveWikilinks,
  type RelatedNote,
} from "@/lib/wikilinks";

// CodeMirror is only needed once someone edits, so it stays out of the main bundle.
const NoteEditor = lazy(() => import("./NoteEditor"));

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
      data-active={active || undefined}
      className="obsidian-chip px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border"
    >
      {tag}
    </button>
  );
}

/** The tag filter. Memoised: `allTags` only changes when the listing does. */
const TagCloud = memo(function TagCloud({
  tags,
  activeTag,
  onToggle,
}: {
  tags: string[];
  activeTag: string | null;
  onToggle: (tag: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <TagChip tag="all" active={activeTag === null} onClick={() => onToggle(null)} />
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} active={activeTag === tag} onClick={() => onToggle(tag)} />
      ))}
    </div>
  );
});

const NoteRow = memo(function NoteRow({
  note,
  date,
  active,
  onSelect,
}: {
  note: VaultNote;
  /** Relative date, computed once per list rather than on every row render. */
  date: string;
  active: boolean;
  onSelect: (path: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(note.path)}
      data-active={active || undefined}
      className="obsidian-note w-full text-left px-3 py-2.5 rounded-lg transition-colors border"
    >
      <p className="text-sm font-medium truncate">{note.title}</p>
      <p className="text-xs text-muted-foreground truncate mt-0.5">
        {note.tags.length > 0 ? note.tags.join(" · ") : "untagged"} — {date}
      </p>
      {note.matchContext && (
        <p className="text-[11px] text-muted-foreground/70 mt-1 line-clamp-2">
          {note.matchContext}
        </p>
      )}
    </button>
  );
});

/**
 * Past this many notes the list is virtualised: only the rows in view (plus a
 * few either side) are mounted, so a vault of thousands scrolls like one of
 * dozens. Smaller lists stagger in when the list first mounts; rows a search
 * or tag filter brings in later just appear.
 */
const VIRTUALIZE_AFTER = 80;

/** A limit no vault reaches, for queries that want every note. */
const ALL_NOTES = 1_000_000;

/** Pixels per line for wheel events reported in lines (DOM_DELTA_LINE). */
const WHEEL_LINE_PX = 16;

/**
 * Scroll a panel by the mouse wheel ourselves. In the desktop app (WebView2)
 * a notched wheel over a hovered note row left the list where it was, while
 * the same wheel over the gaps between rows scrolled it. Handling the wheel
 * on the scroller works wherever the cursor rests inside it. When the panel
 * is already at its end in that direction the event is left alone.
 */
function useWheelScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Pinch-zoom and sideways scrolling keep their native behaviour.
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const delta =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? e.deltaY * WHEEL_LINE_PX
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? e.deltaY * el.clientHeight
            : e.deltaY;
      const max = el.scrollHeight - el.clientHeight;
      if ((delta < 0 && el.scrollTop <= 0) || (delta > 0 && el.scrollTop >= max - 1)) return;
      e.preventDefault();
      el.scrollTop = Math.min(max, Math.max(0, el.scrollTop + delta));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);
}

function NoteList({
  notes,
  selectedPath,
  onSelect,
}: {
  notes: VaultNote[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useWheelScroll(scrollRef);
  const virtual = notes.length > VIRTUALIZE_AFTER;
  const dates = useMemo(() => notes.map(relativeDate), [notes]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const stagger = !mounted.current;
  const virtualizer = useVirtualizer({
    count: virtual ? notes.length : 0,
    getScrollElement: () => scrollRef.current,
    // A row without a match snippet; rows with one are measured as they mount.
    estimateSize: () => 62,
    overscan: 8,
    getItemKey: (i) => notes[i].path,
  });

  return (
    <div ref={scrollRef} className="flex-1 basis-0 min-h-0 overflow-y-auto scrollbar-thin -mx-1 px-1">
      {virtual ? (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const note = notes[item.index];
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full pb-1"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <NoteRow
                  note={note}
                  date={dates[item.index]}
                  active={selectedPath === note.path}
                  onSelect={onSelect}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {notes.map((note, i) => (
            <m.div
              key={note.path}
              initial={stagger ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger ? { delay: Math.min(i * 0.03, 0.3) } : undefined}
            >
              <NoteRow
                note={note}
                date={dates[i]}
                active={selectedPath === note.path}
                onSelect={onSelect}
              />
            </m.div>
          ))}
        </div>
      )}
    </div>
  );
}

const REMARK_PLUGINS = [remarkGfm];

/** The rendered body. Memoised so typing in the search box never re-parses it. */
const NoteMarkdown = memo(function NoteMarkdown({ body }: { body: string }) {
  return <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{body}</ReactMarkdown>;
});

function ConnectionGroup({
  label,
  notes,
  onOpen,
}: {
  label: string;
  notes: VaultNote[];
  onOpen: (path: string) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">
        {label} <span className="text-muted-foreground/60">{notes.length}</span>
      </p>
      <ul className="space-y-1">
        {notes.map((n) => (
          <li key={n.path}>
            <button
              onClick={() => onOpen(n.path)}
              title={n.path}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span className="block text-sm truncate">{n.title}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{n.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Category matches shown before "Show all", so a tag on hundreds of notes stays short. */
const RELATED_PREVIEW = 12;

/** Other notes sharing a tag or category with this one, with what they share. */
function RelatedGroup({
  notePath,
  related,
  onOpen,
}: {
  notePath: string;
  related: RelatedNote<VaultNote>[];
  onOpen: (path: string) => void;
}) {
  // Keyed by path, so opening another note collapses the list again.
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  if (related.length === 0) return null;
  const expanded = expandedPath === notePath;
  const shown = expanded ? related : related.slice(0, RELATED_PREVIEW);

  return (
    <div className="mt-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">
        Shares a category <span className="text-muted-foreground/60">{related.length}</span>
      </p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {shown.map(({ note: n, shared }) => (
          <li key={n.path}>
            <button
              onClick={() => onOpen(n.path)}
              title={n.path}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span className="block text-sm truncate">{n.title}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{shared.join(" · ")}</span>
            </button>
          </li>
        ))}
      </ul>
      {related.length > RELATED_PREVIEW && (
        <button
          onClick={() => setExpandedPath(expanded ? null : notePath)}
          className="mt-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:bg-white/5 transition-colors"
        >
          {expanded ? "Show fewer" : `Show all ${related.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * Notes this one links to, notes linking back to it, and notes sharing a
 * category. Clicking one opens it.
 */
function NoteConnectionsPanel({
  note,
  allNotes,
  linkTargets,
  onOpen,
}: {
  note: VaultNote;
  allNotes: VaultNote[];
  linkTargets: Map<string, string>;
  onOpen: (path: string) => void;
}) {
  const { outgoing, backlinks } = useMemo(
    () => noteConnections(note.path, note.links ?? [], allNotes, linkTargets),
    [note, allNotes, linkTargets],
  );
  const related = useMemo(() => relatedByCategory(note, allNotes), [note, allNotes]);

  return (
    <section className="mt-8 pt-4 border-t border-white/10" aria-label="Connections">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
        <Link2 className="w-3.5 h-3.5" />
        Connections
      </h3>
      {outgoing.length === 0 && backlinks.length === 0 && related.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No connected notes yet. Add a [[wikilink]], a tag or a category to connect one.
        </p>
      ) : (
        <>
          {(outgoing.length > 0 || backlinks.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ConnectionGroup label="Links to" notes={outgoing} onOpen={onOpen} />
              <ConnectionGroup label="Linked from" notes={backlinks} onOpen={onOpen} />
            </div>
          )}
          <RelatedGroup notePath={note.path} related={related} onOpen={onOpen} />
        </>
      )}
    </section>
  );
}

function NoteReader({
  linkTargets,
  allNotes,
}: {
  linkTargets: Map<string, string>;
  allNotes: VaultNote[];
}) {
  const selectedNotePath = useAppUi((s) => s.selectedNotePath);
  const { setSelectedNotePath } = appUi;
  const { data: note, isLoading, error } = useVaultNote(selectedNotePath);
  // Keyed by path, so opening another note always comes back to reading.
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const editing = !!note && editingPath === note.path;
  // Recorded once the note has loaded, so a moved or deleted path never lands in the palette's recents.
  const notePath = note?.path;
  const noteTitle = note?.title;
  useEffect(() => {
    if (notePath && noteTitle) recordRecent({ kind: "note", id: notePath, title: noteTitle });
  }, [notePath, noteTitle]);
  const content = note?.content;
  const body = useMemo(
    () => (content === undefined ? "" : resolveWikilinks(content, linkTargets)),
    [content, linkTargets],
  );

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

  if (vaultErrorCode(error) === "not_found") {
    return (
      <div className="glass-card p-10 flex flex-col items-center justify-center text-center h-full min-h-[320px]">
        <FileX className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium">This note is gone</p>
        <p className="text-xs text-muted-foreground mt-1">
          <code>{selectedNotePath}</code> was deleted or moved.
        </p>
        <button
          onClick={() => setSelectedNotePath(null)}
          className="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors"
        >
          Close note
        </button>
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

  return (
    <m.div
      key={note.path}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 min-h-[320px]"
    >
      <div className="flex items-start gap-3 mb-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest min-w-0 break-all flex-1">
          {note.path}
        </p>
        {!editing && (
          <button
            onClick={() => setEditingPath(note.path)}
            className="obsidian-action flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>
      <h2 className="text-2xl font-bold tracking-tight">{note.title}</h2>

      {editing ? (
        <div className="mt-4">
          <Suspense fallback={<p className="text-sm text-muted-foreground py-10 text-center">Opening editor…</p>}>
            <NoteEditor path={note.path} onDone={() => setEditingPath(null)} />
          </Suspense>
        </div>
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="obsidian-tag px-2 py-0.5 rounded-full text-[11px]"
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
          <NoteMarkdown body={body} />
        </div>

        <NoteConnectionsPanel
          note={note}
          allNotes={allNotes}
          linkTargets={linkTargets}
          onOpen={setSelectedNotePath}
        />
        </>
      )}
    </m.div>
  );
}

const DESKTOP_HINTS: Record<string, { title: string; hint: string }> = {
  not_configured: {
    title: "Choose your vault",
    hint: "Pick the folder that holds your Obsidian vault. Crystal OS only reads and writes notes inside it.",
  },
  missing: {
    title: "Vault folder not found",
    hint: "It may have been moved or renamed, or it lives on a drive that is not connected. Reconnect it and retry, or choose another folder.",
  },
  permission_denied: {
    title: "Vault folder is not readable",
    hint: "Crystal OS does not have permission to read this folder. Check its permissions, or choose another folder.",
  },
};

/** Why the vault cannot be listed, and on desktop, the way out. */
function VaultUnavailable({ error }: { error: Error }) {
  const queryClient = useQueryClient();
  const pickVault = usePickVault();
  const desktop = isDesktop();
  const code = vaultErrorCode(error);
  const copy = desktop ? DESKTOP_HINTS[code ?? ""] : undefined;
  // First run on desktop is setup, not a failure.
  const setup = desktop && code === "not_configured";

  const choose = () =>
    pickVault.mutate(undefined, {
      onSuccess: (status) => {
        if (status) toast.success("Vault connected", { description: status.path ?? undefined });
      },
      onError: (err) => toast.error("Could not use that folder", { description: err.message }),
    });

  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3">
        {setup ? (
          <FolderOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${setup ? "" : "text-destructive"}`}
          >
            {copy?.title ?? "Vault unavailable"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 break-words">
            {copy ? copy.hint : error.message}
          </p>
          {copy && !setup && (
            <p className="text-xs text-muted-foreground/70 mt-1 break-all">{error.message}</p>
          )}

          {desktop ? (
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={choose}
                disabled={pickVault.isPending}
                className="obsidian-action flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Choose vault folder
              </button>
              {!setup && (
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["vault"] })}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/70 mt-2">
              Set <code>OBSIDIAN_VAULT_PATH</code> in <code>.env.local</code> and restart
              the dev server.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const selectedNotePath = useAppUi((s) => s.selectedNotePath);
  const { setSelectedNotePath, setShowQuickAdd, setQuickAddDraft } = appUi;
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);

  const { data, isLoading, error } = useVaultNotes({
    q: debouncedSearch.trim() || undefined,
    tag: activeTag ?? undefined,
  });

  const notes = useMemo(() => data?.notes ?? [], [data]);

  // Wikilinks resolve against the whole vault, not only the filtered list. On
  // desktop this reads the same cached listing; on the web it is one request.
  const { data: everything } = useVaultNotes({ limit: ALL_NOTES });
  const allNotes = everything?.notes ?? notes;
  const linkTargets = useMemo(() => buildLinkTargets(allNotes), [allNotes]);

  const toggleTag = useCallback(
    (tag: string | null) => setActiveTag((current) => (tag === null || current === tag ? null : tag)),
    [],
  );

  const openQuickAdd = () => {
    setQuickAddDraft("");
    setShowQuickAdd(true);
  };

  const header = (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="obsidian-title">The Archive</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your Obsidian vault</p>
      </div>
      <button
        onClick={openQuickAdd}
        className="obsidian-action flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
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
        <VaultUnavailable error={error} />
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-4">
        {/* ── Left rail: search, tags, note list ── */}
        {/* The search bar is hidden on this tab (see Index), so the rail takes its space. */}
        <div className="glass-card p-4 flex flex-col gap-3 h-[70vh] lg:h-[calc(100vh-8.5rem)]">
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
              <TagCloud tags={data!.allTags} activeTag={activeTag} onToggle={toggleTag} />
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-white/5 shrink-0">
            <TagIcon className="w-3 h-3" />
            {isLoading ? "Loading…" : `${data?.total ?? 0} note${data?.total === 1 ? "" : "s"}`}
          </div>

          {/* Bottom half: filtered notes. */}
          {isLoading || notes.length === 0 ? (
            <div className="flex-1 basis-0 min-h-0 overflow-y-auto scrollbar-thin space-y-1 -mx-1 px-1">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="px-3 py-2.5 space-y-1.5">
                    <div className="w-2/3 h-4 rounded bg-primary/10 animate-pulse" />
                    <div className="w-1/2 h-3 rounded bg-primary/5 animate-pulse" />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground px-3 py-6 text-center">
                  No notes match.
                </p>
              )}
            </div>
          ) : (
            <NoteList notes={notes} selectedPath={selectedNotePath} onSelect={setSelectedNotePath} />
          )}
        </div>

        {/* ── Right pane: reader ── */}
        <NoteReader linkTargets={linkTargets} allNotes={allNotes} />
      </div>
    </div>
  );
}
