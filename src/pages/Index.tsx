import { useState } from "react";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/components/auth/LoginPage";
import { SidebarNav, BottomNav, type TabId } from "@/components/layout/Navigation";
import { AnimatePresence, motion } from "framer-motion";
import HomePage from "@/components/views/HomePage";
import TasksPage, { TaskForm } from "@/components/views/TasksPage";
import CalendarPage from "@/components/views/CalendarPage";
import FinancialsPage, { TransactionDrawer } from "@/components/views/FinancialsPage";
import WeatherPage from "@/components/views/WeatherPage";
import ArchivePage from "@/components/views/ArchivePage";
import CommandPalette from "@/components/CommandPalette";
import QuickAddDialog from "@/components/QuickAddDialog";

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
};

function GlobalOverlays() {
  const { showTaskForm, setShowTaskForm, showTransactionForm, setShowTransactionForm, editingTask, setEditingTask, editingTransaction, setEditingTransaction } = useApp();
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
  const View = views[activeTab];

  if (loading) {
    return (
      <div className="min-h-screen mesh-gradient-bg flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  // AppProvider sits inside this check so it never mounts without a user and
  // therefore never issues an unauthenticated query.
  if (!session) return <LoginPage />;

  return (
    <AppProvider>
      <div className="min-h-screen mesh-gradient-bg flex">
        <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto scrollbar-thin">
          <CommandPalette onNavigate={setActiveTab} />
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
