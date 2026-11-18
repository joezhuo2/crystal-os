import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, ClipboardPaste, Flame, Gamepad2, Plus, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AddPortalAppDialog from "@/components/portal/AddPortalAppDialog";
import { AppIcon } from "@/components/portal/PortalNavbar";
import PortalSkeleton from "@/components/portal/PortalSkeleton";
import { usePortal, usePortalOcclusion } from "@/hooks/usePortal";
import { useToday } from "@/hooks/useToday";
import { GAME_PRESETS, averageScore, recentDays, scoreLabel, streak } from "@/lib/funGames";
import { fun } from "@/lib/funStore";
import { isDesktop } from "@/lib/platform";
import type { PortalApp } from "@/lib/portalApps";
import { GAME_PREFIX, hidePortal, navigatePortalApp, onPortalShare, removePortalApp, showPortalApp } from "@/lib/portalNative";
import { toLocalDateStr } from "@/lib/utils";

const MOUNT_TRACK_MS = 400;

const webviewOf = (game: PortalApp): PortalApp => ({ ...game, id: GAME_PREFIX + game.id });

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function formatAverage(value: number | null) {
  return value === null ? "–" : value.toFixed(1).replace(/\.0$/, "");
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-3">
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-white/45">{label}</span>
    </div>
  );
}

export default function FunPage() {
  const desktop = isDesktop();
  const { occluders } = usePortal();
  const { games, activeId, results } = useSyncExternalStore(fun.subscribe, fun.getState);
  const today = useToday();
  const active = games.find((g) => g.id === activeId) ?? null;
  const hostRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  usePortalOcclusion(adding);

  useEffect(() => setRemoving(false), [activeId]);

  useEffect(() => {
    if (!desktop) return;
    return onPortalShare(({ id, text }) => {
      if (!id.startsWith(GAME_PREFIX)) return;
      const game = fun.getState().games.find((g) => g.id === id.slice(GAME_PREFIX.length));
      if (!game) return;
      fun.record(game.id, text, toLocalDateStr());
      toast.success(`${game.name} result saved`);
    });
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    const host = hostRef.current;
    if (!host || !active || occluders > 0) {
      hidePortal().catch(() => undefined);
      return;
    }
    let cancelled = false;
    let lastKey = "";
    const push = () => {
      if (cancelled) return;
      const r = host.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const bounds = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
      if (key === lastKey) return;
      lastKey = key;
      showPortalApp(webviewOf(active), bounds).catch((err) => {
        if (!cancelled) setError({ id: active.id, message: errorText(err) });
      });
    };
    const until = performance.now() + MOUNT_TRACK_MS;
    let frame = 0;
    const follow = () => {
      push();
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    const observer = new ResizeObserver(push);
    observer.observe(host);
    window.addEventListener("resize", push);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", push);
    };
  }, [desktop, active, occluders, attempt]);

  useEffect(() => {
    if (!desktop) return;
    return () => {
      hidePortal().catch(() => undefined);
    };
  }, [desktop]);

  const select = (game: PortalApp) => {
    if (!desktop) window.open(game.url, "_blank", "noopener,noreferrer");
    fun.setActive(game.id);
  };

  const remove = (game: PortalApp) => {
    fun.remove(game.id);
    if (desktop) {
      removePortalApp(webviewOf(game).id).catch((err) =>
        toast.error(`Could not delete ${game.name}'s data`, { description: errorText(err) }),
      );
    }
  };

  const logClipboard = (game: PortalApp) => {
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!text.trim()) throw new Error("The clipboard has no text.");
        fun.record(game.id, text, toLocalDateStr());
        toast.success(`${game.name} result saved`);
      })
      .catch((err) => toast.error("Could not read the clipboard", { description: errorText(err) }));
  };

  const week = active ? recentDays(results, active.id, today, 7) : [];
  const lastWeek = active ? recentDays(results, active.id, week[0].date, 8).slice(0, 7) : [];

  let content: React.ReactNode;
  if (!active) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Pick a daily game</h3>
          <p className="text-sm text-white/55">Play it here. Clicking the game's Share button saves your result.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GAME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => fun.add({ id: preset.id, name: preset.name, url: preset.url })}
              className="portal-tile"
            >
              <AppIcon app={preset} size={32} />
              <span className="text-xs font-medium">{preset.name}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAdding(true)} className="portal-icon-btn w-auto gap-2 px-3 text-xs font-medium">
          <Plus className="w-4 h-4" /> Custom game
        </button>
      </div>
    );
  } else if (!desktop) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Gamepad2 className="h-10 w-10 portal-accent" />
        <p className="max-w-md text-sm text-white/55">
          Games open in a new tab in the browser version. Copy your result there, then use "Log clipboard" to save it.
        </p>
      </div>
    );
  } else if (error && error.id === active.id) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <h3 className="text-base font-semibold">Could not open {active.name}</h3>
        <p className="max-w-md text-xs text-white/55 [overflow-wrap:anywhere]">{error.message}</p>
        <button
          type="button"
          className="portal-icon-btn w-auto gap-2 px-3 text-xs font-medium"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          <RotateCw className="w-4 h-4" /> Try again
        </button>
      </div>
    );
  } else {
    content = <PortalSkeleton app={active} />;
  }

  return (
    <div className="flex flex-col gap-3 min-h-[20rem] h-[calc(100vh-7rem)] md:h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-3 px-1">
        <Gamepad2 className="w-6 h-6 portal-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-tight">
            <span className="portal-gradient-text">Fun</span>
          </h2>
          <p className="text-xs text-white/50 truncate">Daily games, streaks and scores.</p>
        </div>
      </header>

      <nav aria-label="Games" className="flex flex-wrap items-center gap-2 px-2">
        {games.map((game) => {
          const run = streak(results, game.id, today);
          return (
            <button
              key={game.id}
              type="button"
              aria-pressed={game.id === activeId}
              onClick={() => select(game)}
              className={`portal-icon-btn w-auto gap-2 px-3 text-xs font-medium ${game.id === activeId ? "bg-white/15" : ""}`}
            >
              <AppIcon app={game} size={16} />
              {game.name}
              {run > 0 && (
                <span className="flex items-center gap-0.5 text-amber-300" aria-label={`${run} day streak`}>
                  <Flame className="h-3 w-3" />
                  {run}
                </span>
              )}
            </button>
          );
        })}
        <button type="button" onClick={() => setAdding(true)} aria-label="Add a game" className="portal-icon-btn">
          <Plus className="w-4 h-4" />
        </button>
      </nav>

      {active && (
        <section aria-label={`${active.name} scores`} className="flex flex-wrap items-center gap-y-2 px-2">
          <Stat label="Streak" value={streak(results, active.id, today)} />
          <Stat label="Today" value={scoreLabel(week[6].result)} />
          <Stat label="Yesterday" value={scoreLabel(week[5].result)} />
          <Stat label="7-day avg" value={formatAverage(averageScore(week.map((d) => d.result)))} />
          <Stat label="Week before" value={formatAverage(averageScore(lastWeek.map((d) => d.result)))} />
          <ol className="ml-2 flex gap-1" aria-label="Last 7 days">
            {week.map(({ date, result }) => (
              <li
                key={date}
                title={result?.text ? `${date}\n${result.text}` : date}
                className={`flex h-9 w-9 flex-col items-center justify-center rounded-md border text-[11px] tabular-nums ${
                  result ? "border-white/25 bg-white/10" : "border-white/10 text-white/35"
                }`}
              >
                <span>{scoreLabel(result)}</span>
                <span className="text-[8px] text-white/40">{date.slice(8)}</span>
              </li>
            ))}
          </ol>
          <div className="ml-auto flex items-center gap-1">
            {desktop && (
              <button
                type="button"
                aria-label={`Reload ${active.name}`}
                title="Reload"
                className="portal-icon-btn"
                onClick={() =>
                  navigatePortalApp(webviewOf(active), "reload").catch((err) =>
                    toast.error(`Could not reload ${active.name}`, { description: errorText(err) }),
                  )
                }
              >
                <RotateCw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              title="Save the result you copied"
              className="portal-icon-btn w-auto gap-2 px-3 text-xs font-medium"
              onClick={() => logClipboard(active)}
            >
              <ClipboardPaste className="w-4 h-4" /> Log clipboard
            </button>
            <button
              type="button"
              title="Removes the game, its sign-in and its scores"
              className="portal-icon-btn w-auto gap-2 px-3 text-xs font-medium"
              onClick={() => (removing ? remove(active) : setRemoving(true))}
              onBlur={() => setRemoving(false)}
            >
              <Trash2 className="w-4 h-4" /> {removing ? "Click again to remove" : "Remove"}
            </button>
          </div>
        </section>
      )}

      <div className="portal-frame flex-1 min-h-0 mx-2 mb-2">
        <div className="portal-host h-full w-full">
          <div ref={hostRef} className="portal-screen h-full w-full overflow-hidden">
            <div key={active?.id ?? "none"} className="portal-fade h-full">
              {content}
            </div>
          </div>
        </div>
      </div>

      <AddPortalAppDialog
        open={adding}
        onOpenChange={setAdding}
        apps={games}
        onAdd={fun.add}
        presets={GAME_PRESETS}
        title="Add a game"
      />
    </div>
  );
}
