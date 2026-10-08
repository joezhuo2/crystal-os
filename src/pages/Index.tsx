import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppProvider } from "@/contexts/AppContext";
import { appUi, useAppUi } from "@/lib/appUi";
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/components/auth/LoginPage";
import AppSplash from "@/components/layout/AppSplash";
import { SidebarNav, BottomNav, type TabId } from "@/components/layout/Navigation";
import { AnimatePresence } from "framer-motion";
import CommandPalette from "@/components/CommandPalette";
import TerminalStatic from "@/components/layout/TerminalStatic";
import PortalBackdrop from "@/components/layout/PortalBackdrop";
import NebulaBackdrop from "@/components/layout/NebulaBackdrop";
import ObsidianBackdrop from "@/components/layout/ObsidianBackdrop";
import AtmosphereBackdrop from "@/components/layout/AtmosphereBackdrop";
import ImageBackdrop from "@/components/layout/ImageBackdrop";
import BackdropSlot from "@/components/layout/BackdropSlot";
import { useHarness } from "@/hooks/useHarness";
import { usePortal } from "@/hooks/usePortal";
import { isDesktop } from "@/lib/platform";
import { hidePortal } from "@/lib/portalNative";
import { PORTAL_THEME_CLASS } from "@/lib/portalStore";
import QuickAddDialog from "@/components/QuickAddDialog";
import { useTrayQuickAdd } from "@/hooks/useTrayQuickAdd";
import { useHomeHotkey, usePaletteHotkey } from "@/hooks/useGlobalHotkey";
import { inTerminal, isPaletteShortcut } from "@/lib/hotkey";
import { useVaultLiveUpdates } from "@/hooks/useVault";
import { useAppActivity } from "@/lib/appActivity";
import { useOrbitStore } from "@/lib/orbitStore";
import OrbitAutoExport from "@/components/views/orbit/OrbitAutoExport";
import NotificationScheduler from "@/components/NotificationScheduler";
import { LazyTaskForm, LazyTransactionDrawer, lazyViews as views, preloadViews, recordVisit } from "@/lib/viewLoader";

/** Tabs with a page backdrop of their own. */
const BACKDROP_TABS: ReadonlySet<TabId> = new Set(["terminal", "portal", "nebula", "weather", "archive", "calendar", "tasks", "orbit"]);

/**
 * How many page backdrops stay mounted: the current one and the last one
 * left, so flipping between two themed tabs never rebuilds either.
 */
const KEPT_BACKDROPS = 2;

/** Long enough for the view's first content (and a preloaded chunk) to fade in. */
const VIEW_ENTER_MS = 600;

/**
 * Fades a newly opened view in. Opacity on this wrapper would cut off the
 * blur of every glass card inside it until the fade ended (opacity on an
 * ancestor of a backdrop-filter does that), so the cards flashed see-through
 * and then snapped back. Instead `data-entering` fades each glass card, and
 * the content beside them, on its own (`.view-enter` in index.css). It is
 * removed shortly after, so content that appears later does not fade.
 */
function ViewEnter({ fade, children }: { fade: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !fade) return;
    const timer = window.setTimeout(() => el.removeAttribute("data-entering"), VIEW_ENTER_MS);
    return () => clearTimeout(timer);
  }, [fade]);
  return (
    <div ref={ref} className="view-enter" data-entering={fade ? "" : undefined}>
      {children}
    </div>
  );
}

/** Shown for the moment a view's chunk is still loading. */
function ViewFallback() {
  return (
    <div className="flex h-40 items-center justify-center" role="status" aria-label="Loading">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

const closeTaskForm = () => {
  appUi.setShowTaskForm(false);
  appUi.setEditingTask(null);
};

const closeTransactionForm = () => {
  appUi.setShowTransactionForm(false);
  appUi.setEditingTransaction(null);
};

// Each form subscribes to its own flags, so opening one re-renders only it.
function TaskFormOverlay() {
  const show = useAppUi((s) => s.showTaskForm);
  const editingTask = useAppUi((s) => s.editingTask);
  return <AnimatePresence>{show && <LazyTaskForm editingTask={editingTask} onClose={closeTaskForm} />}</AnimatePresence>;
}

function TransactionFormOverlay() {
  const show = useAppUi((s) => s.showTransactionForm);
  const editingTransaction = useAppUi((s) => s.editingTransaction);
  return (
    <AnimatePresence>
      {show && <LazyTransactionDrawer editingTransaction={editingTransaction} onClose={closeTransactionForm} />}
    </AnimatePresence>
  );
}

function GlobalOverlays() {
  useTrayQuickAdd(() => {
    appUi.setQuickAddDraft("");
    appUi.setShowQuickAdd(true);
  });
  useVaultLiveUpdates();
  const { autoExport } = useOrbitStore();
  return (
    <>
      {autoExport && <OrbitAutoExport />}
      <NotificationScheduler />
      <Suspense fallback={null}>
        <TaskFormOverlay />
        <TransactionFormOverlay />
      </Suspense>
      <QuickAddDialog />
    </>
  );
}

const Index = () => {
  const { session, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const { theme: portalTheme } = usePortal();
  const { theme: nebulaTheme } = useHarness();
  const { still } = useAppActivity();
  const View = views[activeTab];
  useHomeHotkey(() => setActiveTab("home"));

  // Most recent backdrop tabs first. Updated during render, so the new tab's
  // backdrop mounts in the same commit as its page.
  const [keptBackdrops, setKeptBackdrops] = useState<TabId[]>([]);
  if (BACKDROP_TABS.has(activeTab) && keptBackdrops[0] !== activeTab) {
    setKeptBackdrops([activeTab, ...keptBackdrops.filter((t) => t !== activeTab)].slice(0, KEPT_BACKDROPS));
  }

  // The search bar is an overlay over whichever tab is open.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Desktop global hotkey (Rust shows and focuses the window first). Opens
  // rather than toggles, so it never closes a bar left open while hidden.
  // Also toasts hotkeys that failed to register, so it stays mounted.
  usePaletteHotkey(useCallback(() => setPaletteOpen(true), []));

  // In-app Ctrl/Cmd+K toggles the bar. Skipped when something else already
  // handled the key, such as the hotkey recorder, and inside the Terminal,
  // whose keys belong to the shell.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isPaletteShortcut(e) || inTerminal(e)) return;
      e.preventDefault();
      setPaletteOpen((open) => !open);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Runs once: fetches the most used views' chunks after Home has settled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => preloadViews(activeTab), []);

  useEffect(() => {
    recordVisit(activeTab);
  }, [activeTab]);

  // Popups (dropdowns, pickers) portal to <body>, outside the page root, so
  // the Horizon's, the Engine's and the Orbit's palettes go on <body> too for
  // them to pick up.
  useEffect(() => {
    document.body.classList.toggle("horizon-theme", activeTab === "calendar");
    document.body.classList.toggle("engine-theme", activeTab === "tasks");
    document.body.classList.toggle("orbit-theme", activeTab === "orbit");
  }, [activeTab]);

  // Hide the Portal's native webview as soon as another tab is picked. The
  // page only unmounts after its exit animation, and the webview would sit
  // over everything until then.
  const portalOpened = useRef(false);
  useEffect(() => {
    if (activeTab === "portal") portalOpened.current = true;
    else if (portalOpened.current && isDesktop()) hidePortal().catch(() => undefined);
  }, [activeTab]);

  if (loading) return <AppSplash />;

  // AppProvider sits inside this check so it never mounts without a user and
  // therefore never issues an unauthenticated query.
  if (!session) return <LoginPage />;

  const rootClass =
    activeTab === "terminal"
      ? "terminal-root bg-black"
      : activeTab === "portal"
        ? `portal-root ${PORTAL_THEME_CLASS[portalTheme]}`
        : activeTab === "nebula"
          ? "nebula-root"
          : activeTab === "weather"
            ? "atmosphere-root"
            : activeTab === "archive"
              ? "obsidian-root"
              : activeTab === "calendar"
                ? "horizon-root"
                : activeTab === "tasks"
                  ? "engine-root"
                  : activeTab === "orbit"
                    ? "orbit-root"
                    : "mesh-gradient-bg";
  const backdrop = (tab: TabId) => {
    switch (tab) {
      case "terminal":
        return <TerminalStatic />;
      case "portal":
        return <PortalBackdrop theme={portalTheme} />;
      case "nebula":
        return <NebulaBackdrop theme={nebulaTheme} />;
      case "weather":
        return <AtmosphereBackdrop />;
      case "archive":
        return <ObsidianBackdrop />;
      case "calendar":
        return <ImageBackdrop image="horizon" />;
      case "tasks":
        return <ImageBackdrop image="engine" />;
      case "orbit":
        return <ImageBackdrop image="orbit" />;
      default:
        return null;
    }
  };

  // The Nebula page, sidebar, and backdrop read their colours from these.
  const rootStyle =
    activeTab === "nebula"
      ? ({ "--nebula-a": nebulaTheme.colors[0], "--nebula-b": nebulaTheme.colors[1], "--nebula-c": nebulaTheme.colors[2] } as React.CSSProperties)
      : undefined;

  return (
    <AppProvider>
      <div className={`h-screen flex isolate overflow-hidden ${rootClass}`} style={rootStyle}>
        {/* Leaving a tab hides its backdrop instead of unmounting it, so
            coming back skips the WebGL setup, canvas restart or image decode.
            Sorted, so switching never moves a backdrop's DOM node. */}
        {[...keptBackdrops].sort().map((tab) => (
          <BackdropSlot key={tab} active={tab === activeTab}>
            {backdrop(tab)}
          </BackdropSlot>
        ))}
        <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 min-h-0 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto scrollbar-thin">
          {/* The last view leaves at once and the next fades in. Keyed, so
              each switch mounts a fresh ViewEnter. */}
          <ViewEnter key={activeTab} fade={!still}>
            <Suspense fallback={<ViewFallback />}>
              <View onNavigate={setActiveTab} />
            </Suspense>
          </ViewEnter>
        </main>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        <GlobalOverlays />
        {/* Inside the page root, so the page's theme reaches it. */}
        <CommandPalette open={paletteOpen} onClose={closePalette} onNavigate={setActiveTab} />
      </div>
    </AppProvider>
  );
};

export default Index;
