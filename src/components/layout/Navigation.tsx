import { useState } from "react";
import { Home, ListTodo, Calendar, Wallet, CloudSun, BookOpen, Settings, SquareTerminal, Orbit, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { isDesktop } from "@/lib/platform";
import { usePortal } from "@/hooks/usePortal";
import { badgeLabel, type PortalBadge } from "@/lib/portalApps";
import { selectBadgeTotal } from "@/lib/portalStore";

export type TabId = "home" | "tasks" | "calendar" | "financials" | "weather" | "archive" | "portal" | "nebula" | "terminal" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: "home", label: "The Pulse", icon: Home },
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
const portalTab: Tab = { id: "portal", label: "The Portal", icon: Orbit };

/** Desktop only, above The Portal. Agents run in Rust (src-tauri/src/harness/). */
const nebulaTab: Tab = { id: "nebula", label: "The Nebula", icon: Sparkles };

/** Top of the bottom group, above The Nebula. */
const archiveTab: Tab = { id: "archive", label: "The Archive", icon: BookOpen };

/** The phone bar has no bottom group, so The Archive stays in its row. */
const bottomTabs: Tab[] = [...tabs, archiveTab];

/** The Terminal, Portal, Nebula, Atmosphere, and Archive tabs restyle the sidebar to match their pages. */
type SidebarMode = "default" | "terminal" | "portal" | "nebula" | "atmosphere" | "obsidian";

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
};

function SidebarButton({
  tab,
  active,
  expanded,
  mode,
  badge,
  onClick,
}: {
  tab: Tab;
  active: boolean;
  expanded: boolean;
  mode: SidebarMode;
  badge?: PortalBadge | null;
  onClick: () => void;
}) {
  const textClass =
    mode === "terminal"
      ? active
        ? "text-neutral-50"
        : "text-neutral-500 hover:text-neutral-100 hover:bg-white/5"
      : mode === "portal" || mode === "nebula" || mode === "atmosphere" || mode === "obsidian"
        ? active
          ? "text-white"
          : "text-white/45 hover:text-white hover:bg-white/5"
        : active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground";
  const radius = mode === "terminal" ? "rounded-sm" : "rounded-lg";
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap overflow-hidden ${radius} ${textClass}`}
      title={!expanded ? tab.label : undefined}
    >
      {active && (
        <motion.div
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
            className={`sidebar-badge ${badge === "dot" ? "sidebar-badge-dot" : ""}`}
            aria-label={badge === "dot" ? "Unread" : `${badge} unread`}
          >
            {badgeLabel(badge)}
          </span>
        )}
      </span>
      <motion.span
        className="relative z-10"
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      >
        {tab.label}
      </motion.span>
    </button>
  );
}

/**
 * Collapsed, the sidebar is 64px wide with a 1px right border. Padding of 12px
 * left and 11px right leaves a 40px button, so a 16px icon behind 12px of
 * button padding sits exactly centred in its highlight.
 */
export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  const [expanded, setExpanded] = useState(false);
  const portalBadge = selectBadgeTotal(usePortal());
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
            : "text-gradient-indigo";

  const button = (tab: Tab, badge?: PortalBadge | null) => (
    <SidebarButton
      key={tab.id}
      tab={tab}
      active={activeTab === tab.id}
      expanded={expanded}
      mode={mode}
      badge={badge}
      onClick={() => onTabChange(tab.id)}
    />
  );

  return (
    <motion.aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      animate={{ width: expanded ? 256 : 64 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
      className={`hidden md:flex flex-col h-screen sticky top-0 glass-card border-r border-t-0 border-b-0 border-l-0 rounded-none pl-3 pr-[11px] pb-4 pt-8 gap-2 overflow-hidden transition-colors duration-300 ${sidebarClass}`}
    >
      <button
        type="button"
        onClick={() => onTabChange("home")}
        className={`block w-full text-left mb-8 px-3 whitespace-nowrap overflow-hidden cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${terminal ? "rounded-sm" : "rounded-lg"}`}
        aria-label="Go to home"
        title={!expanded ? "Home" : undefined}
      >
        <AnimatePresence mode="wait">
          {expanded ? (
            <motion.div key="full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
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
            </motion.div>
          ) : (
            <motion.div key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <h1 className={`text-xl font-bold tracking-tight ${terminal ? "terminal-font" : ""}`}>
                {terminal ? (
                  <span className="terminal-glitch-text" data-text="C">C</span>
                ) : (
                  <span className={gradientClass}>C</span>
                )}
              </h1>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
      <nav className="flex flex-col gap-1">{tabs.map((tab) => button(tab))}</nav>
      <div className="mt-auto flex flex-col gap-1">
        {button(archiveTab)}
        {isDesktop() && button(nebulaTab)}
        {button(portalTab, portalBadge)}
        {isDesktop() && button(terminalTab)}
        {button(settingsTab)}
      </div>
    </motion.aside>
  );
}

export function BottomNav({ activeTab, onTabChange }: SidebarNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-card rounded-none border-l-0 border-r-0 border-b-0 px-2 py-1 flex justify-around">
      {bottomTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] font-medium transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="bottom-active"
                className="absolute -top-0.5 w-8 h-0.5 rounded-full bg-primary"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <tab.icon className="w-5 h-5" />
            <span>{tab.label.replace("The ", "")}</span>
          </button>
        );
      })}
    </nav>
  );
}
