import { useState } from "react";
import { Home, ListTodo, Calendar, Wallet, CloudSun, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type TabId = "home" | "tasks" | "calendar" | "financials" | "weather" | "archive";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "The Pulse", icon: Home },
  { id: "tasks", label: "The Engine", icon: ListTodo },
  { id: "calendar", label: "The Horizon", icon: Calendar },
  { id: "financials", label: "The Vault", icon: Wallet },
  { id: "weather", label: "The Atmosphere", icon: CloudSun },
  { id: "archive", label: "The Archive", icon: BookOpen },
];

interface SidebarNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      animate={{ width: expanded ? 256 : 64 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
      className="hidden md:flex flex-col h-screen sticky top-0 glass-card border-r border-t-0 border-b-0 border-l-0 rounded-none p-4 pt-8 gap-2 overflow-hidden"
    >
      <div className="mb-8 px-3 whitespace-nowrap overflow-hidden">
        <AnimatePresence mode="wait">
          {expanded ? (
            <motion.div key="full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-gradient-indigo">Crystal</span>{" "}
                <span className="text-muted-foreground font-light">OS</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-1">Productivity Ecosystem</p>
            </motion.div>
          ) : (
            <motion.div key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-gradient-indigo">C</span>
              </h1>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <nav className="flex flex-col gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap overflow-hidden ${
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={!expanded ? tab.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: "hsl(239 84% 67% / 0.15)",
                    border: "1px solid hsl(239 84% 67% / 0.25)",
                  }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <tab.icon className="w-4 h-4 relative z-10 shrink-0" />
              <motion.span
                className="relative z-10"
                animate={{ opacity: expanded ? 1 : 0 }}
                transition={{ duration: 0.15 }}
              >
                {tab.label}
              </motion.span>
            </button>
          );
        })}
      </nav>
    </motion.aside>
  );
}

export function BottomNav({ activeTab, onTabChange }: SidebarNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-card rounded-none border-l-0 border-r-0 border-b-0 px-2 py-1 flex justify-around">
      {tabs.map((tab) => {
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
