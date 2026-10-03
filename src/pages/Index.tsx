import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/components/auth/LoginPage";
import AppSplash from "@/components/layout/AppSplash";
import { SidebarNav, BottomNav, type TabId } from "@/components/layout/Navigation";
import { AnimatePresence, motion } from "framer-motion";
import TerminalPage from "@/components/views/TerminalPage";
import PortalPage from "@/components/views/PortalPage";
import NebulaPage from "@/components/views/NebulaPage";
import CommandPalette from "@/components/CommandPalette";
import TerminalStatic from "@/components/layout/TerminalStatic";
import PortalBackdrop from "@/components/layout/PortalBackdrop";
import NebulaBackdrop from "@/components/layout/NebulaBackdrop";
import ObsidianBackdrop from "@/components/layout/ObsidianBackdrop";
import AtmosphereBackdrop from "@/components/layout/AtmosphereBackdrop";
import ImageBackdrop from "@/components/layout/ImageBackdrop";
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
import { LazyTaskForm, LazyTransactionDrawer, lazyViews, preloadViews, type ViewProps } from "@/lib/viewLoader";

// Nebula, Terminal, and Portal load with the app; the rest are split into
// chunks (see viewLoader.ts).
const views: Record<TabId, React.ComponentType<ViewProps>> = {
  ...lazyViews,
  portal: PortalPage,
  nebula: NebulaPage,
  terminal: TerminalPage,
};


/** Shown for the moment a view's chunk is still loading. */
function ViewFallback() {
  return (
    <div className="flex h-40 items-center justify-center" role="status" aria-label="Loading">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

function GlobalOverlays() {
  const { showTaskForm, setShowTaskForm, showTransactionForm, setShowTransactionForm, editingTask, setEditingTask, editingTransaction, setEditingTransaction, setQuickAddDraft, setShowQuickAdd } = useApp();
  useTrayQuickAdd(() => {
    setQuickAddDraft("");
    setShowQuickAdd(true);
  });
  useVaultLiveUpdates();
  return (
    <>
      <Suspense fallback={null}>
        <AnimatePresence>
          {showTaskForm && <LazyTaskForm editingTask={editingTask} onClose={() => { setShowTaskForm(false); setEditingTask(null); }} />}
        </AnimatePresence>
        <AnimatePresence>
          {showTransactionForm && <LazyTransactionDrawer editingTransaction={editingTransaction} onClose={() => { setShowTransactionForm(false); setEditingTransaction(null); }} />}
        </AnimatePresence>
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

  // The search bar lives on Home only. Its shortcuts work from every tab:
  // they switch to Home, and the bar focuses itself once it is mounted.
  const [paletteRequested, setPaletteRequested] = useState(false);
  const openPalette = useCallback(() => {
    setActiveTab("home");
    setPaletteRequested(true);
  }, []);
  const clearPaletteRequest = useCallback(() => setPaletteRequested(false), []);

  // Desktop global hotkey (Rust shows and focuses the window first). Also
  // toasts hotkeys that failed to register, so it stays mounted on every tab.
  usePaletteHotkey(openPalette);

  // In-app Ctrl/Cmd+K. Skipped when something else already handled the key,
  // such as the hotkey recorder, and inside the Terminal, whose keys belong
  // to the shell.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isPaletteShortcut(e) || inTerminal(e)) return;
      e.preventDefault();
      openPalette();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openPalette]);

  useEffect(() => {
    preloadViews();
  }, []);

  // Popups (dropdowns, pickers) portal to <body>, outside the page root, so
  // the Horizon's and the Engine's palettes go on <body> too for them to pick up.
  useEffect(() => {
    document.body.classList.toggle("horizon-theme", activeTab === "calendar");
    document.body.classList.toggle("engine-theme", activeTab === "tasks");
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
      ? "bg-black"
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
                  : "mesh-gradient-bg";
  // The Nebula page, sidebar, and backdrop read their colours from these.
  const rootStyle =
    activeTab === "nebula"
      ? ({ "--nebula-a": nebulaTheme.colors[0], "--nebula-b": nebulaTheme.colors[1], "--nebula-c": nebulaTheme.colors[2] } as React.CSSProperties)
      : undefined;

  return (
    <AppProvider>
      <div className={`h-screen flex isolate overflow-hidden ${rootClass}`} style={rootStyle}>
        {activeTab === "terminal" && <TerminalStatic />}
        {activeTab === "portal" && <PortalBackdrop theme={portalTheme} />}
        {activeTab === "nebula" && <NebulaBackdrop theme={nebulaTheme} />}
        {activeTab === "weather" && <AtmosphereBackdrop />}
        {activeTab === "archive" && <ObsidianBackdrop />}
        {activeTab === "calendar" && <ImageBackdrop image="horizon" />}
        {activeTab === "tasks" && <ImageBackdrop image="engine" />}
        <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 min-h-0 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto scrollbar-thin">
          {/* Home only. Its shortcuts are above, so they reach it from any tab. */}
          {activeTab === "home" && (
            <CommandPalette
              onNavigate={setActiveTab}
              focusRequested={paletteRequested}
              onFocusRequested={clearPaletteRequest}
            />
          )}
          {/* Reduced motion (OS setting or performance mode) swaps views
              without the slide, so the next view is not held back 200 ms. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={still ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={still ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: still ? 0 : 0.2 }}
            >
              <Suspense fallback={<ViewFallback />}>
                <View onNavigate={setActiveTab} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        <GlobalOverlays />
      </div>
    </AppProvider>
  );
};

export default Index;
