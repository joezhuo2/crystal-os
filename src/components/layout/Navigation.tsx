import { memo, useRef } from "react";
import { Home, ListTodo, Calendar, Wallet, CloudSun, BookOpen, Settings, SquareTerminal, Orbit, Sparkles, AppWindow } from "lucide-react";
import { m } from "framer-motion";
import { isDesktop } from "@/lib/platform";
import { usePortal } from "@/hooks/usePortal";
import { useFocusMuted } from "@/hooks/usePomodoro";
import { badgeLabel, type PortalBadge } from "@/lib/portalApps";
import { selectBadgeTotal } from "@/lib/portalStore";
import { useNow, useOrbitReady } from "@/hooks/useOrbitReview";

export type TabId = "home" | "orbit" | "tasks" | "calendar" | "financials" | "weather" | "archive" | "portal" | "nebula" | "terminal" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "home", label: "The Pulse", icon: Home },
  { id: "orbit", label: "The Orbit", icon: Orbit },
  { id: "tasks", label: "The Engine", icon: ListTodo },
  { id: "calendar", label: "The Horizon", icon: Calendar },
  { id: "financials", label: "The Vault", icon: Wallet },
  { id: "weather", label: "The Atmosphere", icon: CloudSun },
];

/** Pinned to the bottom of the sidebar, apart from the views above. */
const settingsTab: Tab = { id: "settings", label: "Settings", icon: Settings };

/** Desktop only, above Settings. The shell runs in Rust (src-tauri/src/terminal.rs). */
const terminalTab: Tab = { id: "terminal", label: "Terminal", icon: SquareTerminal };

/**
 * Above Terminal. Shown on the web too, where the page explains that embedding
 * needs the desktop app (src-tauri/src/portal.rs).
 */
const portalTab: Tab = { id: "portal", label: "The Portal", icon: AppWindow };

/** Desktop only, above The Portal. Agents run in Rust (src-tauri/src/harness/). */
const nebulaTab: Tab = { id: "nebula", label: "The Nebula", icon: Sparkles };

/** Top of the bottom group, above The Nebula. */
const archiveTab: Tab = { id: "archive", label: "The Archive", icon: BookOpen };

/** The phone bar has no bottom group, so The Archive stays in its row. */
const bottomTabs: Tab[] = [...tabs, archiveTab];

/** The Terminal, Portal, Nebula, Atmosphere, Archive, Horizon, Engine, and Orbit tabs restyle the sidebar to match their pages. */
type SidebarMode = "default" | "terminal" | "portal" | "nebula" | "atmosphere" | "obsidian" | "horizon" | "engine" | "orbit";

interface SidebarNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const activePillStyle: Record<SidebarMode, React.CSSProperties> = {
  default: { background: "hsl(239 84% 67% / 0.15)", border: "1px solid hsl(239 84% 67% / 0.25)" },
  terminal: { background: "#000", border: "1px solid rgb(255 255 255 / 0.25)" },
  // Colours come from the portal-theme-* class on the page root (index.css).
  portal: {
    background: "color-mix(in srgb, var(--portal-a) 18%, transparent)",
    border: "1px solid color-mix(in srgb, var(--portal-a) 45%, transparent)",
    boxShadow: "0 0 18px color-mix(in srgb, var(--portal-a) 35%, transparent)",
  },
  // Colours come from the --nebula-* variables on the page root (Index.tsx).
  nebula: {
    background: "color-mix(in srgb, var(--nebula-a) 22%, transparent)",
    border: "1px solid color-mix(in srgb, var(--nebula-c) 40%, transparent)",
    boxShadow: "0 0 18px color-mix(in srgb, var(--nebula-b) 30%, transparent)",
  },
  atmosphere: {
    background: "rgb(45 212 191 / 0.16)",
    border: "1px solid rgb(125 211 252 / 0.38)",
    boxShadow: "0 0 18px rgb(52 211 153 / 0.28)",
  },
  obsidian: {
    background: "rgb(168 85 247 / 0.22)",
    border: "1px solid rgb(216 180 254 / 0.4)",
    boxShadow: "0 0 18px rgb(168 85 247 / 0.35)",
  },
  horizon: {
    background: "rgb(59 130 246 / 0.2)",
    border: "1px solid rgb(147 197 253 / 0.4)",
    boxShadow: "0 0 18px rgb(59 130 246 / 0.35)",
  },
  engine: {
    background: "rgb(249 115 22 / 0.2)",
    border: "1px solid rgb(253 186 116 / 0.4)",
    boxShadow: "0 0 18px rgb(249 115 22 / 0.35)",
  },
  orbit: {
    background: "linear-gradient(120deg, rgb(125 211 252 / 0.2), rgb(196 181 253 / 0.16))",
    border: "1px solid rgb(186 230 253 / 0.42)",
    boxShadow: "0 0 18px rgb(125 211 252 / 0.3)",
  },
};

/**
 * Memoized, and never told whether the sidebar is expanded: the label fades
 * with CSS off the shell's `data-expanded`, so hovering the sidebar
 * re-renders no buttons.
 */
const SidebarButton = memo(function SidebarButton({
  tab,
  active,
  mode,
  badge,
  badgeTitle,
  onSelect,
}: {
  tab: Tab;
  active: boolean;
  mode: SidebarMode;
  badge?: PortalBadge | null;
  /** Spoken in place of "Unread" for a dot badge. */
  badgeTitle?: string;
  onSelect: (tab: TabId) => void;
}) {
  const textClass =
    mode === "terminal"
      ? active
        ? "text-neutral-50"
        : "text-neutral-500 hover:text-neutral-100 hover:bg-white/5"
      : mode === "portal" || mode === "nebula" || mode === "atmosphere" || mode === "obsidian" || mode === "horizon" || mode === "engine" || mode === "orbit"
        ? active
          ? "text-white"
          : "text-white/45 hover:text-white hover:bg-white/5"
        : active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground";
  const radius = mode === "terminal" ? "rounded-sm" : "rounded-lg";
  return (
    <button
      onClick={() => onSelect(tab.id)}
      className={`relative flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap overflow-hidden ${radius} ${textClass}`}
    >
      {active && (
        <m.div
          layoutId="sidebar-active"
          className={`absolute inset-0 ${radius}`}
          style={activePillStyle[mode]}
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      <span className="relative z-10 shrink-0">
        <tab.icon className="w-4 h-4" />
        {badge != null && (
          <span
            className={`sidebar-badge ${badge === "dot" ? "sidebar-badge-dot" : ""} ${tab.id === "orbit" ? "orbit-badge" : ""}`}
            aria-label={badge === "dot" ? (badgeTitle ?? "Unread") : `${badge} unread`}
            title={badge === "dot" ? badgeTitle : undefined}
          >
            {badgeLabel(badge)}
          </span>
        )}
      </span>
      <span className="sidebar-reveal relative z-10">{tab.label}</span>
    </button>
  );
});

/**
 * Collapsed, the sidebar is 64px wide with a 1px right border. Padding of 12px
 * left and 11px right leaves a 40px button, so a 16px icon behind 12px of
 * button padding sits exactly centred in its highlight.
 *
 * A fixed 64px spacer holds the sidebar's place in the row, and the panel
 * itself is positioned over the page, so expanding it never re-lays out
 * <main> or the view. Expanding is a `data-expanded` attribute set straight
 * on the spacer: no React state, so hovering re-renders nothing, and the
 * width, labels and headers follow it in CSS (`.sidebar-shell` in index.css).
 * The Portal is the exception: its apps are native webviews drawn above the
 * page, which would hide the expanded panel, so there the spacer grows with
 * the panel (`data-push`) and the app moves aside as before.
 */
export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const setExpanded = (on: boolean) => shellRef.current?.toggleAttribute("data-expanded", on);
  // A running focus session mutes the Portal's badges (v0.9.5).
  const portalTotal = selectBadgeTotal(usePortal());
  const portalBadge = useFocusMuted() ? null : portalTotal;
  const orbitReady = useOrbitReady(useNow());
  const mode: SidebarMode =
    activeTab === "terminal"
      ? "terminal"
      : activeTab === "portal"
        ? "portal"
        : activeTab === "nebula"
          ? "nebula"
          : activeTab === "weather"
            ? "atmosphere"
            : activeTab === "archive"
              ? "obsidian"
              : activeTab === "calendar"
                ? "horizon"
                : activeTab === "tasks"
                  ? "engine"
                  : activeTab === "orbit"
                    ? "orbit"
                    : "default";
  const terminal = mode === "terminal";
  const sidebarClass = terminal
    ? "sidebar-terminal"
    : mode === "portal"
      ? "sidebar-portal"
      : mode === "nebula"
        ? "sidebar-nebula"
        : mode === "atmosphere"
          ? "sidebar-atmosphere"
          : mode === "obsidian"
            ? "sidebar-obsidian"
            : mode === "horizon"
              ? "sidebar-horizon"
              : mode === "engine"
                ? "sidebar-engine"
                : mode === "orbit"
                  ? "sidebar-orbit"
                  : "";
  const gradientClass =
    mode === "portal"
      ? "portal-gradient-text"
      : mode === "nebula"
        ? "nebula-title"
        : mode === "atmosphere"
          ? "atmosphere-title"
          : mode === "obsidian"
            ? "obsidian-title"
            : mode === "horizon"
              ? "horizon-title"
              : mode === "engine"
                ? "engine-title"
                : mode === "orbit"
                  ? "orbit-title"
                  : "text-gradient-indigo";

  const button = (tab: Tab, badge?: PortalBadge | null, badgeTitle?: string) => (
    <SidebarButton
      key={tab.id}
      tab={tab}
      active={activeTab === tab.id}
      mode={mode}
      badge={badge}
      badgeTitle={badgeTitle}
      onSelect={onTabChange}
    />
  );

  return (
    <div ref={shellRef} className="sidebar-shell hidden md:block" data-push={mode === "portal" ? "" : undefined}>
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`sidebar-panel flex flex-col glass-card border-r border-t-0 border-b-0 border-l-0 rounded-none pl-3 pr-[11px] pb-4 pt-8 gap-2 overflow-hidden ${sidebarClass}`}
      >
        <button
          type="button"
          onClick={() => onTabChange("home")}
          className={`block w-full text-left mb-8 px-3 whitespace-nowrap overflow-hidden cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${terminal ? "rounded-sm" : "rounded-lg"}`}
          aria-label="Go to home"
        >
          {/* Both headers stay mounted in one grid cell and cross-fade, so the
              cell is always the taller (expanded) height: swapping them changed
              the header's height and nudged every icon below it. */}
          <div className="grid">
            <div className="sidebar-reveal [grid-area:1/1]">
              {terminal ? (
                <h1 className="text-xl font-bold tracking-tight terminal-font">
                  <span className="terminal-glitch-text" data-text="Crystal">Crystal</span>{" "}
                  <span className="text-neutral-500 font-light">OS</span>
                </h1>
              ) : (
                <h1 className="text-xl font-bold tracking-tight">
                  <span className={gradientClass}>Crystal</span>{" "}
                  <span className="text-muted-foreground font-light">OS</span>
                </h1>
              )}
              <p className={`text-xs mt-1 ${terminal ? "terminal-font text-neutral-500" : "text-muted-foreground"}`}>
                Productivity Ecosystem
              </p>
            </div>
            <div className="sidebar-conceal [grid-area:1/1]" aria-hidden>
              <h1 className={`text-xl font-bold tracking-tight ${terminal ? "terminal-font" : ""}`}>
                {terminal ? (
                  <span className="terminal-glitch-text" data-text="C">C</span>
                ) : (
                  <span className={gradientClass}>C</span>
                )}
              </h1>
            </div>
          </div>
        </button>
        <nav className="flex flex-col gap-1">
          {tabs.map((tab) =>
            tab.id === "orbit" && orbitReady.unseen.length ? button(tab, "dot", readyTitle(orbitReady.unseen)) : button(tab),
          )}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          {button(archiveTab)}
          {isDesktop() && button(nebulaTab)}
          {button(portalTab, portalBadge)}
          {isDesktop() && button(terminalTab)}
          {button(settingsTab)}
        </div>
      </aside>
    </div>
  );
}

/** "Weekly review ready", or "Weekly and monthly reviews ready". */
function readyTitle(unseen: string[]): string {
  return unseen.length > 1 ? "Weekly and monthly reviews ready" : `${unseen[0] === "weekly" ? "Weekly" : "Monthly"} review ready`;
}

export function BottomNav({ activeTab, onTabChange }: SidebarNavProps) {
  const orbitReady = useOrbitReady(useNow());
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-card rounded-none border-l-0 border-r-0 border-b-0 px-2 py-1 flex justify-around">
      {bottomTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-col items-center gap-0.5 py-2 px-2 text-[10px] font-medium transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {isActive && (
              <m.div
                layoutId="bottom-active"
                className="absolute -top-0.5 w-8 h-0.5 rounded-full bg-primary"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="relative">
              <tab.icon className="w-5 h-5" />
              {tab.id === "orbit" && orbitReady.unseen.length > 0 && (
                <span className="sidebar-badge sidebar-badge-dot orbit-badge" role="status" aria-label={readyTitle(orbitReady.unseen)} />
              )}
            </span>
            <span>{tab.label.replace("The ", "")}</span>
          </button>
        );
      })}
    </nav>
  );
}
