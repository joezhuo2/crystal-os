import { useEffect, useRef, useState } from "react";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/components/auth/LoginPage";
import AppSplash from "@/components/layout/AppSplash";
import { SidebarNav, BottomNav, type TabId } from "@/components/layout/Navigation";
import { AnimatePresence, motion } from "framer-motion";
import HomePage from "@/components/views/HomePage";
import TasksPage, { TaskForm } from "@/components/views/TasksPage";
import CalendarPage from "@/components/views/CalendarPage";
import FinancialsPage, { TransactionDrawer } from "@/components/views/FinancialsPage";
import WeatherPage from "@/components/views/WeatherPage";
import ArchivePage from "@/components/views/ArchivePage";
import SettingsPage from "@/components/views/SettingsPage";
import TerminalPage from "@/components/views/TerminalPage";
import PortalPage from "@/components/views/PortalPage";
import CommandPalette from "@/components/CommandPalette";
import TerminalStatic from "@/components/layout/TerminalStatic";
import PortalBackdrop from "@/components/layout/PortalBackdrop";
import { usePortal } from "@/hooks/usePortal";
import { isDesktop } from "@/lib/platform";
import { hidePortal } from "@/lib/portalNative";
import { PORTAL_THEME_CLASS } from "@/lib/portalStore";
import QuickAddDialog from "@/components/QuickAddDialog";
import { useTrayQuickAdd } from "@/hooks/useTrayQuickAdd";
import { useVaultLiveUpdates } from "@/hooks/useVault";

interface ViewProps {
  onNavigate?: (tab: TabId) => void;
}

const views: Record<TabId, React.ComponentType<ViewProps>> = {
  home: HomePage,
  tasks: TasksPage,
  calendar: CalendarPage,
  financials: FinancialsPage,
  weather: WeatherPage,
  archive: ArchivePage,
  portal: PortalPage,
  terminal: TerminalPage,
  settings: SettingsPage,
};

function GlobalOverlays() {
  const { showTaskForm, setShowTaskForm, showTransactionForm, setShowTransactionForm, editingTask, setEditingTask, editingTransaction, setEditingTransaction, setQuickAddDraft, setShowQuickAdd } = useApp();
  useTrayQuickAdd(() => {
    setQuickAddDraft("");
    setShowQuickAdd(true);
  });
  useVaultLiveUpdates();
  return (
    <>
      <AnimatePresence>
        {showTaskForm && <TaskForm editingTask={editingTask} onClose={() => { setShowTaskForm(false); setEditingTask(null); }} />}
      </AnimatePresence>
      <AnimatePresence>
        {showTransactionForm && <TransactionDrawer editingTransaction={editingTransaction} onClose={() => { setShowTransactionForm(false); setEditingTransaction(null); }} />}
      </AnimatePresence>
      <QuickAddDialog />
    </>
  );
}

const Index = () => {
  const { session, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const { theme: portalTheme } = usePortal();
  const View = views[activeTab];

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
        : "mesh-gradient-bg";

  return (
    <AppProvider>
      <div className={`h-screen flex isolate overflow-hidden ${rootClass}`}>
        {activeTab === "terminal" && <TerminalStatic />}
        {activeTab === "portal" && <PortalBackdrop theme={portalTheme} />}
        <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 min-h-0 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto scrollbar-thin">
          {/* Unmounted on the Terminal and Portal tabs: hides the bar and drops
              its shortcuts. On the Portal it would open under the app webview. */}
          {activeTab !== "terminal" && activeTab !== "portal" && <CommandPalette onNavigate={setActiveTab} />}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <View onNavigate={setActiveTab} />
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
