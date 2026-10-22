import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FileDiff, GitCommitHorizontal, Loader2, RefreshCw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { harnessNative } from "@/lib/harness/native";
import {
  changeKind,
  commitMessage,
  commitPaths,
  diffStats,
  isUntracked,
  parseDiff,
  type ChangedFile,
  type DiffLine,
} from "@/lib/harness/diffReview";
import NebulaTip from "./NebulaTip";

const KIND_CLASS = { added: "text-emerald-300", deleted: "text-red-300", renamed: "text-sky-300", modified: "text-amber-200" } as const;
const KIND_LETTER = { added: "A", deleted: "D", renamed: "R", modified: "M" } as const;

const LINE_CLASS: Record<DiffLine["kind"], string> = {
  add: "bg-emerald-500/10 text-emerald-200",
  del: "bg-red-500/10 text-red-200",
  hunk: "text-[var(--nebula-c)]/80",
  ctx: "text-white/60",
  note: "text-white/40 italic",
};

/**
 * What the agent changed in the project folder, shown after each run: the
 * changed files with their diffs, Accept or Revert per file, and a commit of
 * the accepted files with a generated message. Hidden when the folder is not
 * a git repository or nothing has changed.
 */
export default function DiffReview({ cwd, chatTitle, running }: { cwd: string; chatTitle: string; running: boolean }) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, DiffLine[] | string>>({});
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    harnessNative.gitStatus(cwd).then(
      (next) => {
        setFiles(next);
        setDiffs({});
        setAccepted((prev) => new Set([...prev].filter((p) => next.some((f) => f.path === p))));
        setSelected((prev) => (prev && next.some((f) => f.path === prev) ? prev : (next[0]?.path ?? null)));
      },
      // Not a git repository (or no git): nothing to review.
      () => setFiles([]),
    );
  }, [cwd]);

  useEffect(refresh, [refresh]);

  // A run that just ended may have changed files: look again and show the pane.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      setDismissed(false);
      setOpen(true);
      setEdited(false);
      refresh();
    }
    wasRunning.current = running;
  }, [running, refresh]);

  const current = files.find((f) => f.path === selected) ?? null;
  useEffect(() => {
    if (!current || diffs[current.path] !== undefined) return;
    harnessNative.gitDiff(cwd, current.path, isUntracked(current)).then(
      (text) => setDiffs((d) => ({ ...d, [current.path]: parseDiff(text) })),
      (err: Error) => setDiffs((d) => ({ ...d, [current.path]: err.message })),
    );
  }, [cwd, current, diffs]);

  const toCommit = useMemo(() => (accepted.size ? files.filter((f) => accepted.has(f.path)) : files), [files, accepted]);
  useEffect(() => {
    if (!edited) setMessage(commitMessage(toCommit, chatTitle));
  }, [toCommit, chatTitle, edited]);

  if (dismissed || files.length === 0) return null;

  const toggleAccept = (path: string) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const revert = async (f: ChangedFile) => {
    if (confirmRevert !== f.path) {
      setConfirmRevert(f.path);
      return;
    }
    setConfirmRevert(null);
    setBusy(true);
    try {
      await harnessNative.gitRevert(cwd, f.path, f.origPath, isUntracked(f));
      toast.success(`Reverted ${f.path}`);
    } catch (err) {
      toast.error(`Could not revert ${f.path}`, { description: (err as Error).message });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const hash = await harnessNative.gitCommit(cwd, toCommit.flatMap(commitPaths), message);
      toast.success(`Committed ${toCommit.length} file${toCommit.length === 1 ? "" : "s"}`, { description: `${hash} · ${message.split("\n")[0]}` });
      setEdited(false);
    } catch (err) {
      toast.error("Could not commit", { description: (err as Error).message });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const diff = current ? diffs[current.path] : undefined;

  return (
    <section className="nebula-panel flex max-h-[45%] min-h-0 shrink-0 flex-col px-3 py-2" aria-label="Changes from this run">
      <div className="flex items-center gap-2">
        <FileDiff className="h-4 w-4 text-[var(--nebula-c)]" />
        <span className="text-sm font-medium">Changes</span>
        <span className="text-xs text-white/50">
          {files.length} file{files.length === 1 ? "" : "s"}
          {accepted.size > 0 && ` · ${accepted.size} accepted`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <NebulaTip label="Refresh" hint="Read the folder's changes again" side="bottom">
            <button type="button" className="nebula-chip px-2" onClick={refresh} aria-label="Refresh changes">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </NebulaTip>
          <NebulaTip label={open ? "Collapse" : "Expand"} side="bottom">
            <button type="button" className="nebula-chip px-2" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse changes" : "Expand changes"} aria-expanded={open}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          </NebulaTip>
          <NebulaTip label="Hide until the next run" side="bottom">
            <button type="button" className="nebula-chip px-2" onClick={() => setDismissed(true)} aria-label="Hide changes">
              <X className="h-3.5 w-3.5" />
            </button>
          </NebulaTip>
        </div>
      </div>

      {open && (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex min-h-0 flex-1 gap-2">
            <ul className="w-64 shrink-0 space-y-0.5 overflow-y-auto" aria-label="Changed files">
              {files.map((f) => {
                const kind = changeKind(f);
                const lines = diffs[f.path];
                const stats = Array.isArray(lines) ? diffStats(lines) : null;
                const isAccepted = accepted.has(f.path);
                return (
                  <li
                    key={f.path}
                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs ${selected === f.path ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    <button type="button" onClick={() => setSelected(f.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      <span className={`w-3 shrink-0 font-mono font-semibold ${KIND_CLASS[kind]}`} aria-label={kind}>
                        {KIND_LETTER[kind]}
                      </span>
                      <span className={`truncate ${isAccepted ? "text-emerald-200" : "text-white/80"}`} title={f.path}>
                        {f.path}
                      </span>
                      {stats && (
                        <span className="ml-auto shrink-0 tabular-nums text-[10px]">
                          <span className="text-emerald-300">+{stats.added}</span> <span className="text-red-300">−{stats.removed}</span>
                        </span>
                      )}
                    </button>
                    <NebulaTip label={isAccepted ? "Accepted" : "Accept"} hint={isAccepted ? "Click to un-accept" : "Keep it and include it in the commit"} side="left">
                      <button
                        type="button"
                        onClick={() => toggleAccept(f.path)}
                        aria-pressed={isAccepted}
                        aria-label={`Accept ${f.path}`}
                        className={`rounded p-1 ${isAccepted ? "text-emerald-300" : "text-white/40 hover:text-white"}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </NebulaTip>
                    <NebulaTip
                      label={confirmRevert === f.path ? "Click again to revert" : "Revert"}
                      hint={isUntracked(f) ? "Deletes this new file" : "Puts the file back as it was in the last commit"}
                      side="left"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void revert(f)}
                        onBlur={() => setConfirmRevert((p) => (p === f.path ? null : p))}
                        aria-label={`Revert ${f.path}`}
                        className={`rounded p-1 ${confirmRevert === f.path ? "bg-red-500/20 text-red-300" : "text-white/40 hover:text-white"}`}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    </NebulaTip>
                  </li>
                );
              })}
            </ul>

            <div className="min-w-0 flex-1 overflow-auto rounded-md bg-black/30 font-mono text-[11px] leading-5" aria-label={current ? `Diff of ${current.path}` : "Diff"}>
              {diff === undefined ? (
                <p className="flex items-center gap-2 p-2 text-white/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading diff…
                </p>
              ) : typeof diff === "string" ? (
                <p className="p-2 text-red-300">{diff}</p>
              ) : diff.length === 0 ? (
                <p className="p-2 text-white/50">No line changes (mode or empty file).</p>
              ) : (
                diff.map((line, i) => (
                  <div key={i} className={`whitespace-pre px-2 ${LINE_CLASS[line.kind]}`}>
                    {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                    {line.text}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setEdited(true);
              }}
              rows={2}
              aria-label="Commit message"
              className="min-h-0 flex-1 resize-none font-mono text-xs"
            />
            <NebulaTip
              label={accepted.size ? `Commit ${accepted.size} accepted file${accepted.size === 1 ? "" : "s"}` : "Accept all and commit"}
              hint="Other changes in the folder are left alone"
              side="top"
            >
              <Button size="sm" disabled={busy || !message.trim()} onClick={() => void commit()}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GitCommitHorizontal className="mr-1.5 h-3.5 w-3.5" />}
                {accepted.size ? `Commit ${accepted.size}` : "Commit all"}
              </Button>
            </NebulaTip>
          </div>
        </div>
      )}
    </section>
  );
}
