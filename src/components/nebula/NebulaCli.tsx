import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RotateCw, SquareTerminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { harnessNative } from "@/lib/harness/native";
import { TerminalHub, closeTerminal, listTerminals, onTerminalEvent, openTerminal, writeTerminal } from "@/lib/terminalNative";
import { TerminalPane } from "@/modules/terminal/TerminalPage";

export type CliKind = "claude" | "codex";

const CLIS: Record<CliKind, { label: string; product: string; folderKey: string }> = {
  claude: { label: "Claude CLI", product: "Claude Code", folderKey: "crystal-os-nebula-cli-folder" },
  codex: { label: "Codex CLI", product: "Codex", folderKey: "crystal-os-nebula-codex-folder" },
};

// Outlives the view, so leaving The Nebula and coming back shows the same session.
const lastSessions: Record<CliKind, number | null> = { claude: null, codex: null };

const noop = () => {};

function readFolder(key: string): string | null {
  try {
    return localStorage.getItem(key);
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

export default function NebulaCli({ cli, projects }: { cli: CliKind; projects: { id: string; name: string; path: string }[] }) {
  const { label, product, folderKey } = CLIS[cli];
  const [hub] = useState(() => new TerminalHub());
  const [folder, setFolder] = useState(() => readFolder(folderKey));
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    const unlisten = onTerminalEvent((event) => hub.push(event));
    listTerminals().then((sessions) => {
      const found = sessions.find((s) => s.id === lastSessions[cli]);
      if (!disposed && found) setSession(found);
    }, noop);
    return () => {
      disposed = true;
      unlisten();
    };
  }, [hub, cli]);

  const start = useCallback(
    async (path: string) => {
      setBusy(true);
      try {
        const last = lastSessions[cli];
        if (last !== null) {
          hub.forget(last);
          await closeTerminal(last).catch(noop);
          lastSessions[cli] = null;
        }
        const info = await openTerminal(80, 24, path);
        lastSessions[cli] = info.id;
        await writeTerminal(info.id, `${cli}\r`);
        setFolder(path);
        try {
          localStorage.setItem(folderKey, path);
        } catch {
          // Storage blocked: the folder still applies for this session.
        }
        setSession({ id: info.id, shell: info.shell, exited: info.exited });
      } catch (err) {
        setSession(null);
        toast.error(`Could not start ${label}`, { description: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusy(false);
      }
    },
    [hub, cli, label, folderKey],
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
            <p className="nebula-title text-xl font-semibold">{label}</p>
            <p className="max-w-sm text-sm text-white/55">Pick a folder and {product} starts there in a real terminal.</p>
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
