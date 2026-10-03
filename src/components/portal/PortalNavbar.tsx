import { useState, type ReactNode } from "react";
import { Reorder } from "framer-motion";
import { ArrowLeft, ArrowRight, ExternalLink, LogOut, Plus, RotateCw, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePortalOcclusion } from "@/hooks/usePortal";
import { badgeLabel, faviconUrl, presetFor, type PortalApp, type PortalBadge } from "@/lib/portalApps";
import type { PortalNavAction } from "@/lib/portalNative";

/** Site favicon, or a coloured letter when it fails to load. */
export function AppIcon({ app, size = 18 }: { app: PortalApp; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = faviconUrl(app.url);
  const style = { width: size, height: size };
  if (!src || failed) {
    const color = presetFor(app.id)?.color ?? "var(--portal-a, hsl(239 84% 67%))";
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white"
        style={{ ...style, background: color, fontSize: size * 0.55, color: color === "#E7E9EA" ? "#000" : "#fff" }}
      >
        {app.name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-sm object-contain"
      style={style}
    />
  );
}

function Badge({ badge }: { badge: PortalBadge }) {
  if (badge === "dot") return <span className="portal-badge portal-badge-dot" aria-label="Unread" />;
  return (
    <span className="portal-badge" aria-label={`${badge} unread`}>
      {badgeLabel(badge)}
    </span>
  );
}

/**
 * Tooltip in the Portal theme. Always opens above its trigger, over the page
 * header: the app webview sits above all page content, so a tooltip below
 * the navbar would be hidden (collision flipping is off for that reason).
 */
function PortalTip({
  children,
  name,
  hint,
  align = "center",
}: {
  children: ReactNode;
  name?: string;
  hint?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align={align} sideOffset={8} avoidCollisions={false} className="portal-tooltip">
        {name && <span className="portal-tooltip-name">{name}</span>}
        {hint && <span className="portal-tooltip-hint">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export type Confirm = { kind: "signout" | "remove"; app: PortalApp } | null;

interface PortalNavbarProps {
  desktop: boolean;
  apps: PortalApp[];
  activeId: string | null;
  badges: Record<string, PortalBadge>;
  confirm: Confirm;
  onConfirmChange: (confirm: Confirm) => void;
  onSelect: (app: PortalApp) => void;
  onReorder: (ids: string[]) => void;
  onAdd: () => void;
  onNavigate: (app: PortalApp, action: PortalNavAction) => void;
  onOpenExternal: (app: PortalApp) => void;
  onSignOut: (app: PortalApp) => void;
  onRemove: (app: PortalApp) => void;
  onKeepLiveChange: (app: PortalApp, keepLive: boolean) => void;
  onKeepLoadedChange: (app: PortalApp, keepLoaded: boolean) => void;
}

/**
 * The Portal's own navbar: one pill per connected app (drag to reorder,
 * right-click for more), then browser controls for the active app.
 * Every control's tooltip is a themed `PortalTip`.
 */
export default function PortalNavbar({
  desktop,
  apps,
  activeId,
  badges,
  confirm,
  onConfirmChange,
  onSelect,
  onReorder,
  onAdd,
  onNavigate,
  onOpenExternal,
  onSignOut,
  onRemove,
  onKeepLiveChange,
  onKeepLoadedChange,
}: PortalNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  usePortalOcclusion(menuOpen || confirm !== null);

  const active = apps.find((a) => a.id === activeId) ?? null;

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "signout") onSignOut(confirm.app);
    else onRemove(confirm.app);
    onConfirmChange(null);
  };

  return (
    <div className="portal-navbar flex items-center gap-2">
      <Reorder.Group
        as="ul"
        axis="x"
        values={apps.map((a) => a.id)}
        onReorder={onReorder}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-thin py-1"
        aria-label="Connected apps"
      >
        {apps.map((app) => {
          const isActive = desktop && app.id === activeId;
          const badge = badges[app.id];
          return (
            <ContextMenu key={app.id} onOpenChange={setMenuOpen}>
              <ContextMenuTrigger asChild>
                <Reorder.Item
                  as="li"
                  value={app.id}
                  className="shrink-0 list-none"
                  whileDrag={{ scale: 1.05, zIndex: 10 }}
                >
                  <PortalTip
                    name={app.name}
                    hint={desktop ? "Right-click for options, drag to reorder" : "Opens in a new tab"}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(app)}
                      className={`portal-pill ${isActive ? "portal-pill-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <AppIcon app={app} />
                      <span className="max-w-[9rem] truncate">{app.name}</span>
                      {badge !== undefined && <Badge badge={badge} />}
                    </button>
                  </PortalTip>
                </Reorder.Item>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-64">
                {desktop && (
                  <>
                    <ContextMenuItem onSelect={() => onNavigate(app, "reload")}>
                      <RotateCw className="w-4 h-4 mr-2" /> Reload
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onNavigate(app, "home")}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back to home page
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onOpenExternal(app)}>
                      <ExternalLink className="w-4 h-4 mr-2" /> Open in browser
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuCheckboxItem
                      checked={app.keepLoaded !== false}
                      onCheckedChange={(checked) => onKeepLoadedChange(app, checked === true)}
                      className="items-start"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span>Keep loaded in background</span>
                        <span className="text-[11px] leading-snug text-muted-foreground">
                          {app.keepLoaded === false
                            ? "Closes after being hidden a while. Reopening reloads it; drafts and scroll position are lost."
                            : "Turn off to free memory. Unsent drafts, scroll position and unread badges are lost when it closes."}
                        </span>
                      </span>
                    </ContextMenuCheckboxItem>
                    <ContextMenuCheckboxItem
                      checked={app.keepLive === true}
                      disabled={app.keepLoaded === false}
                      onCheckedChange={(checked) => onKeepLiveChange(app, checked === true)}
                    >
                      Keep live in background
                    </ContextMenuCheckboxItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => onConfirmChange({ kind: "signout", app })}>
                      <LogOut className="w-4 h-4 mr-2" /> Sign out…
                    </ContextMenuItem>
                  </>
                )}
                <ContextMenuItem
                  onSelect={() => onConfirmChange({ kind: "remove", app })}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Remove…
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        <li className="shrink-0 list-none">
          <PortalTip name="Connect an app">
            <button type="button" onClick={onAdd} className="portal-icon-btn" aria-label="Connect an app">
              <Plus className="w-4 h-4" />
            </button>
          </PortalTip>
        </li>
      </Reorder.Group>

      {desktop && active && (
        <div className="flex shrink-0 items-center gap-1" role="toolbar" aria-label={`${active.name} controls`}>
          <PortalTip name="Back" align="end">
            <button type="button" className="portal-icon-btn" onClick={() => onNavigate(active, "back")} aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </PortalTip>
          <PortalTip name="Forward" align="end">
            <button type="button" className="portal-icon-btn" onClick={() => onNavigate(active, "forward")} aria-label="Forward">
              <ArrowRight className="w-4 h-4" />
            </button>
          </PortalTip>
          <PortalTip name="Reload" align="end">
            <button type="button" className="portal-icon-btn" onClick={() => onNavigate(active, "reload")} aria-label="Reload">
              <RotateCw className="w-4 h-4" />
            </button>
          </PortalTip>
          <PortalTip name="Open in browser" align="end">
            <button type="button" className="portal-icon-btn" onClick={() => onOpenExternal(active)} aria-label="Open in browser">
              <ExternalLink className="w-4 h-4" />
            </button>
          </PortalTip>
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && onConfirmChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "signout" ? `Sign out of ${confirm.app.name}?` : `Remove ${confirm?.app.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "signout"
                ? "Clears this app's cookies and saved data in Crystal OS. Your other apps stay signed in."
                : "Removes the app from The Portal and deletes its saved sign-in and data in Crystal OS. Your account itself is not affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirm}>{confirm?.kind === "signout" ? "Sign out" : "Remove"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
