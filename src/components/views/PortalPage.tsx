import { useEffect, useRef, useState } from "react";
import { AlertTriangle, MonitorSmartphone, Orbit, Plus, RotateCw } from "lucide-react";
import { toast } from "sonner";
import PortalNavbar, { AppIcon, type Confirm } from "@/components/portal/PortalNavbar";
import AddPortalAppDialog from "@/components/portal/AddPortalAppDialog";
import PortalSkeleton from "@/components/portal/PortalSkeleton";
import { startPortalSession, usePortal, usePortalOcclusion } from "@/hooks/usePortal";
import { isDesktop } from "@/lib/platform";
import { PRESETS, type PortalApp } from "@/lib/portalApps";
import {
  PORTAL_FADE_MS,
  fadeOutPortal,
  hidePortal,
  navigatePortalApp,
  openPortalAppExternally,
  removePortalApp,
  showPortalApp,
  signOutPortalApp,
  type PortalNavAction,
} from "@/lib/portalNative";
import { portal } from "@/lib/portalStore";

/** How long bounds are re-measured every frame after mounting (the page slides in). */
const MOUNT_TRACK_MS = 400;

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function EmptyState({ onConnect, onCustom }: { onConnect: (app: PortalApp) => void; onCustom: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Open a portal</h3>
        <p className="text-sm text-white/55">Connect a web app. You sign in once and it stays signed in here.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onConnect({ id: preset.id, name: preset.name, url: preset.url })}
            className="portal-tile"
          >
            <AppIcon app={preset} size={32} />
            <span className="text-xs font-medium">{preset.name}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onCustom} className="portal-icon-btn w-auto gap-2 px-3 text-xs font-medium">
        <Plus className="w-4 h-4" /> Custom app
      </button>
    </div>
  );
}

export default function PortalPage() {
  const desktop = isDesktop();
  const { apps, activeId, badges, occluders } = usePortal();
  const active = apps.find((a) => a.id === activeId) ?? null;
  const hostRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The app being switched to while the current one fades out.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const switchTimer = useRef<number>();
  usePortalOcclusion(adding);

  useEffect(() => () => window.clearTimeout(switchTimer.current), []);

  useEffect(() => {
    startPortalSession();
  }, []);

  // Keep the active app's native webview exactly over the host element.
  useEffect(() => {
    if (!desktop) return;
    const host = hostRef.current;
    if (!host || !active || occluders > 0) {
      hidePortal().catch(() => undefined);
      return;
    }

    let cancelled = false;
    let lastKey = "";
    let inflight = false;
    let queued = false;

    const push = () => {
      if (cancelled) return;
      const r = host.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const bounds = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
      if (key === lastKey) return;
      if (inflight) {
        queued = true;
        return;
      }
      inflight = true;
      lastKey = key;
      showPortalApp(active, bounds)
        .then(() => {
          if (!cancelled) setError((prev) => (prev ? null : prev));
        })
        .catch((err) => {
          if (!cancelled) setError({ id: active.id, message: errorText(err) });
        })
        .finally(() => {
          inflight = false;
          if (queued) {
            queued = false;
            push();
          }
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

  const fail = (what: string) => (err: unknown) => toast.error(what, { description: errorText(err) });

  const select = (app: PortalApp) => {
    if (!desktop) {
      openInNewTab(app.url);
      return;
    }
    window.clearTimeout(switchTimer.current);
    if (app.id === activeId || !active || occluders > 0) {
      setPendingId(null);
      portal.setActive(app.id);
      return;
    }
    // Fade the current page out, then show the next, which fades itself in.
    setPendingId(app.id);
    fadeOutPortal().catch(() => undefined);
    switchTimer.current = window.setTimeout(() => {
      setPendingId(null);
      portal.setActive(app.id);
    }, PORTAL_FADE_MS);
  };

  const add = (app: PortalApp) => {
    portal.add(app);
    if (!desktop) openInNewTab(app.url);
  };

  const navigate = (app: PortalApp, action: PortalNavAction) => {
    navigatePortalApp(app, action).catch(fail(`Could not ${action} ${app.name}`));
  };

  const openExternal = (app: PortalApp) => {
    if (desktop) openPortalAppExternally(app).catch(fail(`Could not open ${app.name} in the browser`));
    else openInNewTab(app.url);
  };

  const signOut = (app: PortalApp) => {
    signOutPortalApp(app)
      .then(() => toast.success(`Signed out of ${app.name}`))
      .catch(fail(`Could not sign out of ${app.name}`));
  };

  const remove = (app: PortalApp) => {
    portal.remove(app.id);
    if (desktop) removePortalApp(app.id).catch(fail(`Could not delete ${app.name}'s data`));
  };

  /** Move to the next (−1) or previous (−1) connected app, wrapping around. */
  const cycle = (direction: -1 | 1) => {
    if (apps.length === 0 || !activeId) return;
    const next = (apps.findIndex((a) => a.id === activeId) + direction + apps.length) % apps.length;
    select(apps[next]);
  };

  // Browser-style tab shortcuts for the Portal, desktop only. Ctrl+Tab cycles
  // the connected apps, Ctrl+W removes the active one (confirmed), and Ctrl+R
  // reloads it. Under the Tauri webview, Ctrl+R would otherwise reload the whole
  // app — which drops you back on the Home tab while the child webview (Discord,
  // Instagram…) stays up over the page. preventDefault stops that default reload.
  useEffect(() => {
    if (!desktop) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;

      // Don't hijack keys while an overlay or dialog is up, or while typing.
      if (occluders > 0) return;
      const target = e.target as Element | null;
      if (target && (target.closest("input, textarea, [contenteditable='true']") || target.isContentEditable)) return;

      if (e.code === "Tab") {
        e.preventDefault();
        cycle(e.shiftKey ? -1 : 1);
      } else if (e.code === "KeyW") {
        e.preventDefault();
        if (active) setConfirm({ kind: "remove", app: active });
      } else if (e.code === "KeyR") {
        e.preventDefault();
        if (active) navigate(active, "reload");
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, occluders, apps, activeId, active]);

  let content: React.ReactNode;
  if (apps.length === 0) {
    content = <EmptyState onConnect={add} onCustom={() => setAdding(true)} />;
  } else if (!desktop) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <MonitorSmartphone className="h-10 w-10 portal-accent" />
        <h3 className="text-lg font-semibold">Embedding needs the desktop app</h3>
        <p className="max-w-md text-sm text-white/55">
          Discord, Instagram and most sites with a sign-in refuse to load inside another web page. Click an app above to
          open it in a new tab, or use the Crystal OS desktop app to keep them here.
        </p>
      </div>
    );
  } else if (error && active && error.id === active.id) {
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
  } else if (active && occluders > 0) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
        <AppIcon app={active} size={40} />
        <p className="text-sm">{active.name}</p>
      </div>
    );
  } else if (active) {
    // Covered by the app's webview once its page has loaded.
    content = <PortalSkeleton app={active} />;
  }

  // The search bar is hidden on this tab (see Index), so the page takes its space.
  return (
    <div className="flex flex-col gap-3 min-h-[20rem] h-[calc(100vh-7rem)] md:h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-3 px-1">
        <Orbit className="w-6 h-6 portal-accent portal-orbit-icon" />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-tight">
            <span className="portal-gradient-text">The Portal</span>
          </h2>
          <p className="text-xs text-white/50 truncate">
            {!desktop
              ? "Your web apps, one click away. They open in new tabs in the browser version."
              : active
                ? hostOf(active.url)
                : "Your web apps, signed in and one click away."}
          </p>
        </div>
      </header>

      <PortalNavbar
        desktop={desktop}
        apps={apps}
        activeId={pendingId ?? activeId}
        badges={badges}
        confirm={confirm}
        onConfirmChange={setConfirm}
        onSelect={select}
        onReorder={portal.reorder}
        onAdd={() => setAdding(true)}
        onNavigate={navigate}
        onOpenExternal={openExternal}
        onSignOut={signOut}
        onRemove={remove}
      />

      <div className="portal-frame flex-1 min-h-0 mx-2 mb-2">
        {/* The webview is a plain rectangle, so it goes on the inner screen,
            inset far enough that its square corners clear the rounded ring. */}
        <div className="portal-host h-full w-full">
          <div ref={hostRef} className="portal-screen h-full w-full overflow-hidden">
            <div key={active?.id ?? "none"} className="portal-fade h-full">
              {content}
            </div>
          </div>
        </div>
      </div>

      <AddPortalAppDialog open={adding} onOpenChange={setAdding} apps={apps} onAdd={add} />
    </div>
  );
}
