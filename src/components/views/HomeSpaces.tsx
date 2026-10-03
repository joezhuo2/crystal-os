/**
 * The Home tab's bottom row: one box each for The Nebula, The Portal and the
 * Terminal. Each box and the space around it wear that page's look (index.css,
 * "Home spaces"), following the user's Nebula palette and Portal theme.
 */
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Orbit, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppIcon } from "@/components/portal/PortalNavbar";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { useHarness } from "@/hooks/useHarness";
import { usePortal } from "@/hooks/usePortal";
import { harnessNative } from "@/lib/harness/native";
import { parseStateFile } from "@/lib/harness/store";
import type { ChatMeta } from "@/lib/harness/types";
import { isDesktop } from "@/lib/platform";
import { badgeLabel } from "@/lib/portalApps";
import { PORTAL_THEMES, PORTAL_THEME_CLASS, portal, selectBadgeTotal } from "@/lib/portalStore";
import { listTerminals } from "@/lib/terminalNative";

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

export function NebulaSpace({ onClick }: { onClick?: () => void }) {
  const desktop = isDesktop();
  const { hydrated, chats, projects, runtime, theme } = useHarness();

  // The store fills on the first Nebula visit. Until then, read the saved chat
  // index directly: a plain file read that starts no agents.
  const saved = useQuery({
    queryKey: ["nebula", "state-file"],
    queryFn: async () => parseStateFile(await harnessNative.stateLoad()),
    enabled: desktop && !hydrated,
    staleTime: 60_000,
  });
  const index = hydrated ? { chats, projects } : saved.data;
  const running = Object.values(runtime).filter((r) => r.running).length;
  const latest = index?.chats.reduce<ChatMeta | null>((a, c) => (!a || c.updatedAt > a.updatedAt ? c : a), null);

  const style = {
    "--nebula-a": theme.colors[0],
    "--nebula-b": theme.colors[1],
    "--nebula-c": theme.colors[2],
  } as React.CSSProperties;

  return (
    <div className="home-space home-space-nebula" data-stars={theme.stars.enabled || undefined} style={style}>
      <div onClick={onClick} className="home-card-nebula h-full p-6 cursor-pointer group">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest font-semibold nebula-title">The Nebula</p>
          <Sparkles className="w-4 h-4 home-nebula-icon" />
        </div>

        {!desktop ? (
          <p className="text-sm text-white/60">Agents run in the desktop app.</p>
        ) : !index ? (
          <SkeletonLines count={2} />
        ) : index.chats.length === 0 ? (
          <p className="text-sm text-white/60">No chats yet. Open the Nebula to start one.</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold tabular-nums">{index.chats.length}</span>
              <span className="text-sm text-white/60">
                {index.chats.length !== 1 ? "chats" : "chat"} across {plural(index.projects.length, "project")}
              </span>
            </div>
            {latest && (
              <p className="text-sm truncate text-white/80">
                <span className="text-white/45">Last · </span>
                {latest.title || "Untitled chat"}
                <span className="text-[10px] text-white/40 ml-2">
                  {formatDistanceToNow(latest.updatedAt, { addSuffix: true })}
                </span>
              </p>
            )}
            {running > 0 && (
              <p className="flex items-center gap-2 text-xs mt-2 text-white/75">
                <span className="glow-dot home-nebula-pulse" />
                {plural(running, "agent")} running
              </p>
            )}
          </>
        )}

        <p className="flex items-center gap-1 text-xs text-white/45 group-hover:text-white transition-colors mt-3">
          Enter the Nebula <ChevronRight className="w-3.5 h-3.5" />
        </p>
      </div>
    </div>
  );
}

export function PortalSpace({ onClick }: { onClick?: () => void }) {
  const state = usePortal();
  const { apps, badges, theme } = state;
  const unread = selectBadgeTotal(state);
  const swatch = PORTAL_THEMES.find((t) => t.id === theme)?.swatch;
  const shown = apps.slice(0, 6);

  const openApp = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    portal.setActive(id);
    onClick?.();
  };

  return (
    <div className={`home-space home-space-portal ${PORTAL_THEME_CLASS[theme]}`}>
      <div onClick={onClick} className="home-card-portal h-full p-6 cursor-pointer group">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest font-semibold portal-gradient-text">The Portal</p>
          <Orbit className="w-4 h-4 portal-accent portal-orbit-icon" />
        </div>

        {apps.length === 0 ? (
          <p className="text-sm text-white/60">No apps connected. Open the Portal to add one.</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold tabular-nums text-white">{apps.length}</span>
              <span className="text-sm text-white/60">
                {apps.length !== 1 ? "apps" : "app"} connected
                {unread != null && (unread === "dot" ? " · new activity" : ` · ${unread} unread`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {shown.map((app) => {
                const badge = badges[app.id];
                return (
                  <GlassTip
                    key={app.id}
                    label={app.name}
                    hint="Open in the Portal"
                    colors={swatch ? [swatch[1], swatch[2]] : undefined}
                  >
                    <button onClick={(e) => openApp(e, app.id)} className="home-portal-app" aria-label={`Open ${app.name}`}>
                      <AppIcon app={app} size={18} />
                      {badge != null && (
                        <span className={`sidebar-badge ${badge === "dot" ? "sidebar-badge-dot" : ""}`}>
                          {badgeLabel(badge)}
                        </span>
                      )}
                    </button>
                  </GlassTip>
                );
              })}
              {apps.length > shown.length && (
                <span className="home-portal-app text-[11px] text-white/60">+{apps.length - shown.length}</span>
              )}
            </div>
          </>
        )}

        <p className="flex items-center gap-1 text-xs text-white/45 group-hover:text-white transition-colors mt-3">
          Step through <ChevronRight className="w-3.5 h-3.5" />
        </p>
      </div>
    </div>
  );
}

/** `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` → `powershell`. */
function shellName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.exe$/i, "");
}

export function TerminalSpace({ onClick }: { onClick?: () => void }) {
  const desktop = isDesktop();
  const shells = useQuery({
    queryKey: ["terminal", "list"],
    queryFn: listTerminals,
    enabled: desktop,
    staleTime: 10_000,
  });
  const live = (shells.data ?? []).filter((s) => !s.exited);

  return (
    <div className="home-space home-space-terminal">
      <div onClick={onClick} className="home-card-terminal terminal-glitch-frame h-full p-6 cursor-pointer group terminal-font">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold">
            <span className="terminal-glitch-text" data-text="Terminal">Terminal</span>
          </p>
          <span className="text-[10px] text-neutral-500">{desktop ? "tty" : "offline"}</span>
        </div>

        <div className="space-y-1 text-sm">
          {!desktop ? (
            <p className="text-neutral-400">
              <span className="text-neutral-600">$</span> shell runs in the desktop app
            </p>
          ) : shells.isLoading ? (
            <p className="text-neutral-500">
              <span className="text-neutral-600">$</span> listing shells…
            </p>
          ) : shells.error ? (
            <p className="text-neutral-400">
              <span className="text-neutral-600">$</span> could not list shells
            </p>
          ) : (
            <>
              <p className="text-neutral-300">
                <span className="text-neutral-600">$</span>{" "}
                {live.length === 0 ? "no shells running" : `${plural(live.length, "shell")} running`}
              </p>
              {live.slice(0, 3).map((s) => (
                <p key={s.id} className="text-xs text-neutral-500 truncate">
                  [{s.id}] {shellName(s.shell)}
                </p>
              ))}
            </>
          )}
          <p className="text-neutral-400 group-hover:text-neutral-50 transition-colors pt-1">
            <span className="text-neutral-600">$</span> open
            <span className="home-terminal-cursor">_</span>
          </p>
        </div>
      </div>
    </div>
  );
}
