import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RotateCw, SquareTerminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { harnessNative } from "@/lib/harness/native";
import { TerminalHub, closeTerminal, listTerminals, onTerminalEvent, openTerminal, writeTerminal } from "@/lib/terminalNative";
import { TerminalPane } from "@/modules/terminal/TerminalPage";

const FOLDER_KEY = "crystal-os-nebula-cli-folder";

// Outlives the view, so leaving The Nebula and coming back shows the same session.
let lastSession: number | null = null;

const noop = () => {};

function readFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}

function folderName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

interface Session {
  id: number;
  shell: string;
  exited: boolean;
}

export default function NebulaCli({ projects }: { projects: { id: string; name: string; path: string }[] }) {
  const [hub] = useState(() => new TerminalHub());
  const [folder, setFolder] = useState(readFolder);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    const unlisten = onTerminalEvent((event) => hub.push(event));
    listTerminals().then((sessions) => {
      const found = sessions.find((s) => s.id === lastSession);
      if (!disposed && found) setSession(found);
    }, noop);
    return () => {
      disposed = true;
      unlisten();
    };
  }, [hub]);

  const start = useCallback(
    async (path: string) => {
      setBusy(true);
      try {
        if (lastSession !== null) {
          hub.forget(lastSession);
          await closeTerminal(lastSession).catch(noop);
          lastSession = null;
        }
        const info = await openTerminal(80, 24, path);
        lastSession = info.id;
        await writeTerminal(info.id, "claude\r");
        setFolder(path);
        try {
          localStorage.setItem(FOLDER_KEY, path);
        } catch {
          // Storage blocked: the folder still applies for this session.
        }
        setSession({ id: info.id, shell: info.shell, exited: info.exited });
      } catch (err) {
        setSession(null);
        toast.error("Could not start Claude CLI", { description: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusy(false);
      }
    },
    [hub],
  );

  const pick = async () => {
    try {
      const path = await harnessNative.pickFolder(folder ?? undefined);
      if (path) await start(path);
    } catch (err) {
      toast.error("Could not open the folder picker", { description: String(err) });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="nebula-panel flex flex-wrap items-center gap-2 p-3">
        <button type="button" className="nebula-chip" onClick={() => void pick()} disabled={busy}>
          <FolderOpen className="h-3.5 w-3.5" />
          Pick folder
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            className="nebula-chip"
            title={p.path}
            aria-pressed={Boolean(session) && p.path === folder}
            data-state={session && p.path === folder ? "open" : undefined}
            onClick={() => void start(p.path)}
            disabled={busy}
          >
            {p.name}
          </button>
        ))}
        {session && folder && (
          <>
            <span className="ml-auto min-w-0 truncate text-xs text-white/55" title={folder}>
              {folder}
            </span>
            <button type="button" className="nebula-chip" onClick={() => void start(folder)} disabled={busy}>
              <RotateCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </>
        )}
      </div>
      <div className="nebula-panel min-h-0 flex-1 p-3">
        {session ? (
          <TerminalPane
            key={session.id}
            tab={{ key: `cli${session.id}`, ...session }}
            focused
            hub={hub}
            onChange={(_key, patch) => setSession((s) => s && { ...s, ...patch })}
            onShortcut={noop}
            register={noop}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <SquareTerminal className="h-8 w-8 text-white/40" />
            <p className="nebula-title text-xl font-semibold">Claude CLI</p>
            <p className="max-w-sm text-sm text-white/55">Pick a folder and Claude Code starts there in a real terminal.</p>
            {folder && (
              <Button onClick={() => void start(folder)} disabled={busy}>
                Start in {folderName(folder)}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
