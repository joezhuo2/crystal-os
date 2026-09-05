import { useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { toLocalDateStr, useDebouncedValue } from "@/lib/utils";
import { useVaultNotes } from "@/hooks/useVault";
import type { TabId } from "@/components/layout/Navigation";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Wallet,
  Plus,
  Search,
  ArrowRight,
  DollarSign,
  CheckCircle2,
  NotebookPen,
  BookOpen,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface CommandPaletteProps {
  onNavigate: (tab: TabId) => void;
}

export default function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const { tasks, transactions, taskCategories, financialCategories, addTask, addTransaction, setShowTaskForm, setShowTransactionForm, setSelectedNotePath, setShowQuickAdd, setQuickAddDraft } = useApp();

  const showDropdown = focused && (search.length > 0 || focused);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocused(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const close = useCallback(() => {
    setFocused(false);
    setSearch("");
  }, []);

  // ---------- Natural-language parsing ----------
  const addPrefix = search.toLowerCase().startsWith("add ");
  const logPrefix = search.toLowerCase().startsWith("log ");

  const parsedTaskText = addPrefix ? search.slice(4).trim() : "";
  const parsedLog = logPrefix ? parseLogInput(search.slice(4).trim()) : null;

  function parseLogInput(raw: string): { amount: number; name: string } | null {
    const match = raw.match(/^(\d+(?:\.\d+)?)\s+(?:for\s+)?(.+)/i);
    if (match) return { amount: parseFloat(match[1]), name: match[2].trim() };
    return null;
  }

  // ---------- Search existing data ----------
  const today = toLocalDateStr();

  const matchedTasks =
    search.length >= 2 && !addPrefix && !logPrefix
      ? tasks.filter(
          (t) =>
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            taskCategories
              .find((c) => c.id === t.categoryId)
              ?.name.toLowerCase()
              .includes(search.toLowerCase()),
        )
      : [];

  const matchedTransactions =
    search.length >= 2 && !addPrefix && !logPrefix
      ? transactions.filter(
          (t) =>
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            financialCategories
              .find((c) => c.id === t.categoryId)
              ?.name.toLowerCase()
              .includes(search.toLowerCase()),
        )
      : [];

  // ---------- Search the Obsidian vault ----------
  const vaultQuery = !addPrefix && !logPrefix ? search.trim() : "";
  const debouncedVaultQuery = useDebouncedValue(vaultQuery, 250);
  const { data: vaultData } = useVaultNotes(
    { q: debouncedVaultQuery, limit: 5 },
    debouncedVaultQuery.length >= 2,
  );
  const matchedNotes = debouncedVaultQuery.length >= 2 ? (vaultData?.notes ?? []) : [];

  // ---------- Handlers ----------
  const handleNavigate = (tab: TabId) => {
    onNavigate(tab);
    close();
  };

  const handleQuickAdd = () => {
    // Seed the dialog with whatever was typed, minus the command prefixes.
    setQuickAddDraft(addPrefix || logPrefix ? "" : search.trim());
    close();
    setShowQuickAdd(true);
  };

  const handleOpenNote = (notePath: string) => {
    setSelectedNotePath(notePath);
    handleNavigate("archive");
  };

  const handleAddTask = () => {
    close();
    setShowTaskForm(true);
  };

  const handleLogExpense = () => {
    close();
    setShowTransactionForm(true);
  };

  // ---------- Render ----------
  return (
    <div ref={containerRef} className="relative w-full mb-4">
      <Command
        className="rounded-xl border overflow-visible"
        style={{
          background: "hsl(217 33% 15% / 0.6)",
          borderColor: focused ? "hsl(239 84% 67% / 0.35)" : "hsl(0 0% 100% / 0.08)",
          boxShadow: focused
            ? "0 8px 40px hsl(222 47% 6% / 0.5), 0 0 24px hsl(239 84% 67% / 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.06)"
            : "0 4px 20px hsl(222 47% 6% / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.04)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
        filter={(value, search) => {
          // Vault notes are matched server-side (including on body text), and
          // Quick Add is always offered — neither can pass a local substring
          // test against the raw query, so they opt out of cmdk's filter.
          if (value === "quick-add-vault" || value.startsWith("note-")) return 1;
          if (value.toLowerCase().includes(search.toLowerCase())) return 1;
          return 0;
        }}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-3 min-w-0">
          <Search className="w-5 h-5 text-muted-foreground/50 shrink-0" />
          <CommandInput
            value={search}
            onValueChange={setSearch}
            onFocus={() => setFocused(true)}
            placeholder="Search, 'add …' or 'log …'"
            wrapperClassName="border-0 px-0 flex-1 min-w-0"
            className="h-8 text-base bg-transparent border-0 outline-none placeholder:text-muted-foreground/40 focus:ring-0"
          />
          {focused && (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground font-medium tracking-wider shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {/* Dropdown Results */}
        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border overflow-hidden"
              style={{
                background: "hsl(217 33% 15% / 0.95)",
                borderColor: "hsl(0 0% 100% / 0.1)",
                boxShadow:
                  "0 16px 64px hsl(222 47% 6% / 0.7), 0 0 32px hsl(239 84% 67% / 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.06)",
                backdropFilter: "blur(24px)",
              }}
            >
              <CommandList className="max-h-[340px] overflow-y-auto scrollbar-thin px-2 py-2">
                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground/70">
                  No results found. Try "add Buy milk" or "log 25 for Lunch".
                </CommandEmpty>

                {/* ── Quick Add to the vault — always the first row ── */}
                <CommandGroup heading="Vault">
                  <CommandItem
                    value="quick-add-vault"
                    onSelect={handleQuickAdd}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15">
                      <NotebookPen className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {vaultQuery ? `Quick add "${vaultQuery}"` : "Quick Add to Vault"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Append to Inbox.md in your Obsidian vault
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                  </CommandItem>
                </CommandGroup>

                {/* ── Natural Language: Add Task ── */}
                {addPrefix && (
                  <CommandGroup heading="Actions">
                    <CommandItem
                      onSelect={handleAddTask}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15">
                        <Plus className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">Add New Task</p>
                        <p className="text-xs text-muted-foreground">Open the task creation form</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* ── Natural Language: Log Expense ── */}
                {logPrefix && (
                  <CommandGroup heading="Actions">
                    <CommandItem
                      onSelect={handleLogExpense}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/15">
                        <DollarSign className="w-4 h-4 text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">Log Transaction</p>
                        <p className="text-xs text-muted-foreground">Open the transaction form</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                    </CommandItem>
                  </CommandGroup>
                )}



                {/* ── Matching Tasks ── */}
                {matchedTasks.length > 0 && (
                  <>
                    <CommandSeparator className="my-1 bg-white/[0.06]" />
                    <CommandGroup heading="Tasks">
                      {matchedTasks.slice(0, 5).map((task) => {
                        const cat = taskCategories.find((c) => c.id === task.categoryId);
                        return (
                          <CommandItem
                            key={task.id}
                            value={`task-${task.name}-${cat?.name ?? ""}`}
                            onSelect={() => handleNavigate("tasks")}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                          >
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10">
                              <CheckCircle2
                                className={`w-4 h-4 ${task.completed ? "text-emerald-400" : "text-indigo-400"}`}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium truncate ${task.completed ? "line-through text-muted-foreground" : ""}`}
                              >
                                {task.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {cat?.name ?? "Uncategorized"} · {task.startDate}
                              </p>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}

                {/* ── Matching Transactions ── */}
                {matchedTransactions.length > 0 && (
                  <>
                    <CommandSeparator className="my-1 bg-white/[0.06]" />
                    <CommandGroup heading="Financials">
                      {matchedTransactions.slice(0, 5).map((tx) => {
                        const cat = financialCategories.find((c) => c.id === tx.categoryId);
                        return (
                          <CommandItem
                            key={tx.id}
                            value={`tx-${tx.name}-${cat?.name ?? ""}`}
                            onSelect={() => handleNavigate("financials")}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                          >
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/10">
                              <Wallet className="w-4 h-4 text-orange-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{tx.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {cat?.name ?? "Uncategorized"} ·{" "}
                                <span className={tx.type === "income" ? "text-emerald-400" : "text-red-400"}>
                                  {tx.type === "income" ? "+" : "-"}${tx.amount.toFixed(2)}
                                </span>
                              </p>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}

                {/* ── Matching Vault Notes ── */}
                {matchedNotes.length > 0 && (
                  <>
                    <CommandSeparator className="my-1 bg-white/[0.06]" />
                    <CommandGroup heading="Vault Notes">
                      {matchedNotes.map((note) => (
                        <CommandItem
                          key={note.path}
                          value={`note-${note.title}-${note.tags.join("-")}-${note.path}`}
                          onSelect={() => handleOpenNote(note.path)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 shrink-0">
                            <BookOpen className="w-4 h-4 text-sky-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{note.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {note.matchContext ?? (note.tags.length ? note.tags.join(" · ") : note.path)}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {/* ── Quick Actions (when empty search, focused) ── */}
                {!search && (
                  <>
                    <CommandSeparator className="my-1 bg-white/[0.06]" />
                    <CommandGroup heading="Quick Actions">
                      <CommandItem
                        value="add-new-task"
                        onSelect={handleAddTask}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
                          <Plus className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="text-sm font-medium">Add a new task</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">or type "add"</span>
                      </CommandItem>
                      <CommandItem
                        value="log-expense"
                        onSelect={handleLogExpense}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/10">
                          <DollarSign className="w-4 h-4 text-orange-400" />
                        </div>
                        <span className="text-sm font-medium">Log an expense</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">or type "log"</span>
                      </CommandItem>
                      <CommandItem
                        value="search-tasks-transactions"
                        onSelect={() => {}}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary-foreground"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10">
                          <Search className="w-4 h-4 text-sky-400" />
                        </div>
                        <span className="text-sm font-medium">Search tasks & transactions</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">just start typing</span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] text-[11px] text-muted-foreground/50">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px]">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px]">↵</kbd>
                    select
                  </span>
                </div>
                <span className="text-gradient-indigo font-medium text-xs">Crystal OS</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Command>
    </div>
  );
}
