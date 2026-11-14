import { memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider } from "@/contexts/AppContext";
import { appUi, useAppUi } from "@/lib/appUi";
import { recordRecent } from "@/lib/recents";
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/components/auth/LoginPage";
import AppSplash from "@/components/layout/AppSplash";
import { SidebarNav, BottomNav, visibleTabIds, type TabId } from "@/components/layout/Navigation";
import { AnimatePresence } from "framer-motion";
import CommandPalette from "@/components/CommandPalette";
import TerminalStatic from "@/components/layout/TerminalStatic";
import NebulaBackdrop from "@/components/layout/NebulaBackdrop";
import ObsidianBackdrop from "@/components/layout/ObsidianBackdrop";
import AtmosphereBackdrop from "@/components/layout/AtmosphereBackdrop";
import ImageBackdrop from "@/components/layout/ImageBackdrop";
import BackdropSlot from "@/components/layout/BackdropSlot";
import FluxLines from "@/components/layout/FluxLines";
import { useThemeSettings } from "@/lib/themeSettings";
import { useHarness } from "@/hooks/useHarness";
import { isDesktop } from "@/lib/platform";
import { hidePortal } from "@/lib/portalNative";
import QuickAddDialog from "@/components/QuickAddDialog";
import { useTrayQuickAdd } from "@/hooks/useTrayQuickAdd";
import { useDndHotkey, useHomeHotkey, usePaletteHotkey } from "@/hooks/useGlobalHotkey";
import { inTerminal } from "@/lib/hotkey";
import { isSearchShortcut } from "@/lib/keymap";
import { useVaultLiveUpdates } from "@/hooks/useVault";
import { useAppActivity } from "@/lib/appActivity";
import { useOrbitStore } from "@/lib/orbitStore";
import OrbitAutoExport from "@/modules/orbit/OrbitAutoExport";
import OrbitReadyNotifier from "@/modules/orbit/OrbitReadyNotifier";
import NotificationScheduler from "@/components/NotificationScheduler";
import { useShortcut } from "@/hooks/useShortcut";
import { stepTab } from "@/lib/stepTab";
import { installedModules, useInstalledModules } from "@/lib/installedModules";
import { LazyTaskForm, LazyTransactionDrawer, lazyViews as views, preloadViews, recordVisit } from "@/lib/viewLoader";

/** Tabs with a page backdrop of their own. */
const BACKDROP_TABS: ReadonlySet<TabId> = new Set(["home", "settings", "terminal", "portal", "nebula", "weather", "archive", "calendar", "tasks", "orbit"]);

/**
 * How many page backdrops stay mounted: the current one and the last one
 * left, so flipping between two themed tabs never rebuilds either.
 */
const KEPT_BACKDROPS = 2;

/** Long enough for the view's first content (and a preloaded chunk) to fade in. */
const VIEW_ENTER_MS = 500;

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

function backdrop(tab: TabId, nebulaTheme: ReturnType<typeof useHarness>["theme"]) {
  switch (tab) {
    case "terminal":
      return <TerminalStatic />;
    case "portal":
      return <ImageBackdrop image="portal" />;
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
    case "home":
      return <ImageBackdrop image="home" />;
    case "settings":
      return <ImageBackdrop image="settings" />;
    default:
      return null;
  }
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
  // Any edit form opened, from any page, counts as opening the task.
  const recentId = show ? editingTask?.id : undefined;
  useEffect(() => {
    if (recentId && editingTask) recordRecent({ kind: "task", id: recentId, title: editingTask.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentId]);
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

function VaultLiveUpdates() {
  useVaultLiveUpdates();
  return null;
}

const GlobalOverlays = memo(function GlobalOverlays() {
  useTrayQuickAdd(() => {
    if (!installedModules.isInstalled("archive")) return;
    appUi.setQuickAddDraft("");
    appUi.setShowQuickAdd(true);
  });
  const { uninstalled } = useInstalledModules();
  const has = (id: TabId) => !uninstalled.includes(id);
  const { autoExport } = useOrbitStore();
  return (
    <>
      {has("archive") && <VaultLiveUpdates />}
      {autoExport && has("orbit") && <OrbitAutoExport />}
      <NotificationScheduler />
      <Suspense fallback={null}>
        <TaskFormOverlay />
        <TransactionFormOverlay />
      </Suspense>
      <QuickAddDialog />
    </>
  );
});

const Index = () => {
  const { session, loading } = useAuth();
  const [activeTab, setActiveTabRaw] = useState<TabId>("home");
  const { uninstalled } = useInstalledModules();
  // Pages of uninstalled modules can't be opened; one uninstalled while open falls back to Home.
  const setActiveTab = useCallback((next: TabId | ((t: TabId) => TabId)) => {
    setActiveTabRaw((t) => {
      const tab = typeof next === "function" ? next(t) : next;
      return installedModules.isInstalled(tab) ? tab : t;
    });
  }, []);
  if (uninstalled.includes(activeTab)) setActiveTabRaw("home");
  const { theme: nebulaTheme } = useHarness();
  const { still } = useAppActivity();
  const { theme, fluxLines } = useThemeSettings();
  const monochrome = theme === "default";
  const viewTab = useDeferredValue(activeTab);
  const View = views[viewTab];
  useHomeHotkey(() => setActiveTab("home"));
  useDndHotkey();
  useShortcut("general.nextPage", () => setActiveTab((t) => stepTab(visibleTabIds(), t, 1)));
  useShortcut("general.previousPage", () => setActiveTab((t) => stepTab(visibleTabIds(), t, -1)));

  // Most recent backdrop tabs first. Updated during render, so the new tab's
  // backdrop mounts in the same commit as its page.
  const [keptBackdrops, setKeptBackdrops] = useState<TabId[]>([]);
  if (BACKDROP_TABS.has(viewTab) && keptBackdrops[0] !== viewTab) {
    setKeptBackdrops([viewTab, ...keptBackdrops.filter((t) => t !== viewTab)].slice(0, KEPT_BACKDROPS));
  }

  // The search bar is an overlay over whichever tab is open.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openOrbit = useCallback(() => setActiveTab("orbit"), [setActiveTab]);

  // Desktop global hotkey (Rust shows and focuses the window first). Opens
  // rather than toggles, so it never closes a bar left open while hidden.
  // Also toasts hotkeys that failed to register, so it stays mounted.
  usePaletteHotkey(useCallback(() => setPaletteOpen(true), []));

  // In-app Ctrl/Cmd+K toggles the bar. Skipped when something else already
  // handled the key, such as the hotkey recorder, and inside the Terminal,
  // whose keys belong to the shell.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isSearchShortcut(e) || inTerminal(e)) return;
      e.preventDefault();
      setPaletteOpen((open) => !open);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const page = useMemo(
    () => (
      <ViewEnter key={viewTab} fade={!still}>
        <Suspense fallback={null}>
          <View onNavigate={setActiveTab} />
        </Suspense>
      </ViewEnter>
    ),
    [View, viewTab, still, setActiveTab],
  );
  const backdrops = useMemo(
    () =>
      monochrome ? [] : [...keptBackdrops].sort().map((tab) => (
        <BackdropSlot key={tab} active={tab === viewTab}>
          {backdrop(tab, nebulaTheme)}
        </BackdropSlot>
      )),
    [keptBackdrops, viewTab, nebulaTheme, monochrome],
  );

  // Runs once: fetches the most used views' chunks after Home has settled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => preloadViews(activeTab), []);

  useEffect(() => {
    recordVisit(activeTab);
  }, [activeTab]);

  // Popups (dropdowns, pickers) portal to <body>, outside the page root, so
  // the Portal's, the Horizon's, the Engine's and the Orbit's palettes go on
  // <body> too for them to pick up.
  useEffect(() => {
    const orbit = !monochrome;
    document.body.classList.toggle("portal-theme", orbit && viewTab === "portal");
    document.body.classList.toggle("horizon-theme", orbit && viewTab === "calendar");
    document.body.classList.toggle("engine-theme", orbit && viewTab === "tasks");
    document.body.classList.toggle("orbit-theme", orbit && viewTab === "orbit");
    document.body.classList.toggle("obsidian-theme", orbit && viewTab === "archive");
    document.body.classList.toggle("settings-theme", orbit && viewTab === "settings");
  }, [viewTab, monochrome]);

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

  const rootClass = monochrome
    ? "default-root"
    : viewTab === "terminal"
      ? "terminal-root bg-black"
      : viewTab === "portal"
        ? "portal-root"
        : viewTab === "nebula"
          ? "nebula-root"
          : viewTab === "weather"
            ? "atmosphere-root"
            : viewTab === "archive"
              ? "obsidian-root"
              : viewTab === "calendar"
                ? "horizon-root"
                : viewTab === "tasks"
                  ? "engine-root"
                  : viewTab === "orbit"
                    ? "orbit-root"
                    : viewTab === "home"
                      ? "home-root"
                      : viewTab === "settings"
                        ? "settings-root"
                      : "mesh-gradient-bg";
  // The Nebula page, sidebar, and backdrop read their colours from these.
  const rootStyle =
    viewTab === "nebula"
      ? ({ "--nebula-a": nebulaTheme.colors[0], "--nebula-b": nebulaTheme.colors[1], "--nebula-c": nebulaTheme.colors[2] } as React.CSSProperties)
      : undefined;

  return (
    <AppProvider>
      <div className={`h-screen flex isolate overflow-hidden ${rootClass}`} style={rootStyle}>
        {/* Leaving a tab hides its backdrop instead of unmounting it, so
            coming back skips the WebGL setup, canvas restart or image decode.
            Sorted, so switching never moves a backdrop's DOM node. */}
        {backdrops}
        {monochrome && fluxLines && <FluxLines />}
        <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 min-h-0 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto scrollbar-thin">
          {/* The last view leaves at once and the next fades in. Keyed, so
              each switch mounts a fresh ViewEnter. */}
          {page}
        </main>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        <GlobalOverlays />
        {!uninstalled.includes("orbit") && <OrbitReadyNotifier onOpen={openOrbit} />}
        {/* Inside the page root, so the page's theme reaches it. */}
        <CommandPalette open={paletteOpen} onClose={closePalette} onNavigate={setActiveTab} />
      </div>
    </AppProvider>
  );
};

export default Index;
