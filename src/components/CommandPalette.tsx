import { useState, useRef, useEffect } from "react";
import { useAppActions, useFinancialCategories, useTaskCategories, useTasks, useTransactions, type Task } from "@/contexts/AppContext";
import { nestTargets } from "@/lib/subtasks";
import { canSnooze, formatSnoozeDate, ownSnoozed, snoozePresets, snoozeTitle, snoozeUpdates, UNSNOOZE } from "@/lib/snooze";
import { toast } from "sonner";
import { appUi } from "@/lib/appUi";
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
  CalendarPlus,
  Settings,
  SquareTerminal,
  Sparkles,
  Orbit,
  ListTree,
  CornerLeftUp,
  AlarmClock,
  Sunrise,
  Infinity as InfinityIcon,
  X,
  CalendarDays,
  History,
  Keyboard,
  Power,
  FolderOpen,
  ListTodo,
  Bell,
  AppWindow,
  CloudSun,
  Gauge,
  Download,
  Bug,
} from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { isDesktop } from "@/lib/platform";
import { usePortalOcclusion } from "@/hooks/usePortal";
import { readRecents, type RecentItem } from "@/lib/recents";
import { SETTINGS_SECTIONS, settingsSectionValue } from "@/lib/settingsSections";

const ITEM = "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer";

/** Icons for the Settings sections, matching their headers on the Settings page. */
const SECTION_ICONS: Record<string, React.ElementType> = {
  shortcuts: Keyboard,
  startup: Power,
  vault: FolderOpen,
  nebula: Sparkles,
  engine: ListTodo,
  notifications: Bell,
  orbit: Orbit,
  portal: AppWindow,
  atmosphere: CloudSun,
  performance: Gauge,
  install: Download,
  diagnostics: Bug,
};

const RECENT_ICONS: Record<RecentItem["kind"], React.ElementType> = {
  task: CheckCircle2,
  note: BookOpen,
  event: CalendarDays,
};

function formatRecentDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: TabId) => void;
}

/**
 * The global search bar: an overlay over whichever tab is open. It renders
 * inside the page root (not portalled to <body>), so the page's theme tokens
 * reach it. Closes on Escape, a click outside the panel, or a picked result.
 */
export default function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  return <AnimatePresence>{open && <SearchOverlay onClose={onClose} onNavigate={onNavigate} />}</AnimatePresence>;
}

/** Mounted only while open, so every query and sub-mode starts fresh. */
function SearchOverlay({ onClose, onNavigate }: Omit<CommandPaletteProps, "open">) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tasks = useTasks();
  const { updateTask, rescheduleTasks } = useAppActions();
  // "Make subtask of…": the task being nested while the bar lists parents for it.
  const [nestChild, setNestChild] = useState<Task | null>(null);
  // "Snooze…": the task being snoozed while the bar lists the snooze picks.
  const [snoozeTask, setSnoozeTask] = useState<Task | null>(null);
  const transactions = useTransactions();
  const taskCategories = useTaskCategories();
  const financialCategories = useFinancialCategories();
  const { setShowTaskForm, setShowTransactionForm, setSelectedNotePath, setShowQuickAdd, setQuickAddDraft, setShowEventForm } = appUi;

  // The Portal's native webview draws over all page content.
  usePortalOcclusion(true);

  // Focus waits a frame: after the desktop hotkey, Rust shows the window and
  // the webview may not have focus back yet. Focus goes back to where it was
  // on close, such as the Terminal.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (previous?.isConnected && previous !== document.body) previous.focus();
    };
  }, []);

  const close = onClose;

  // Read once per open: the overlay remounts every time the bar opens.
  const [recents] = useState(readRecents);

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

  const startNesting = (task: Task) => {
    setNestChild(task);
    setSearch("");
    inputRef.current?.focus();
  };

  const handleNest = (parent: Task) => {
    if (!nestChild) return;
    updateTask(nestChild.id, { parentId: parent.id });
    toast.success(`${nestChild.name} is now a subtask of ${parent.name}`);
    close();
  };

  const handleUnnest = (task: Task) => {
    updateTask(task.id, { parentId: undefined });
    toast.success(`${task.name} moved to the top level`);
    close();
  };

  const startSnoozing = (task: Task) => {
    setSnoozeTask(task);
    setSearch("");
    inputRef.current?.focus();
  };

  const handleSnooze = (until: string | "someday") => {
    if (!snoozeTask) return;
    rescheduleTasks(
      [{ id: snoozeTask.id, updates: snoozeUpdates(until) }],
      snoozeTitle(snoozeTask.name, until, toLocalDateStr()),
    );
    close();
  };

  const handleUnsnooze = (task: Task) => {
    rescheduleTasks([{ id: task.id, updates: UNSNOOZE }], `${task.name} is back`);
    close();
  };

  const parentChoices = nestChild ? nestTargets(nestChild.id, tasks) : [];

  const handleOpenSettingsSection = (id: string) => {
    appUi.setSettingsSection(id);
    handleNavigate("settings");
  };

  // Tasks come from the live list, so a deleted one drops out and a renamed
  // one shows its new name.
  const recentRows = recents.flatMap((item): { item: RecentItem; title: string; task?: Task }[] => {
    if (item.kind !== "task") return [{ item, title: item.title }];
    const task = tasks.find((t) => t.id === item.id);
    return task ? [{ item, title: task.name, task }] : [];
  });

  const handleOpenRecent = (item: RecentItem, task?: Task) => {
    if (item.kind === "task") {
      if (!task) return;
      close();
      appUi.setEditingTask(task);
      setShowTaskForm(true);
    } else if (item.kind === "note") {
      handleOpenNote(item.id);
    } else {
      appUi.setOpenEvent({ id: item.id, calendarId: item.calendarId, date: item.date });
      handleNavigate("calendar");
    }
  };

  const recentHint = (item: RecentItem, task?: Task) => {
    if (item.kind === "task") return `Task · ${taskCategories.find((c) => c.id === task?.categoryId)?.name ?? "Uncategorized"}`;
    if (item.kind === "note") return `Note · ${item.id}`;
    return `Event · ${formatRecentDate(item.date)}`;
  };

  const handleAddTask = () => {
    close();
    setShowTaskForm(true);
  };

  const handleLogExpense = () => {
    close();
    setShowTransactionForm(true);
  };

  const handleAddEvent = () => {
    // The Horizon owns the event form, so flag the request and navigate there.
    setShowEventForm(true);
    handleNavigate("calendar");
  };

  // ---------- Render ----------
  // Opacity sits on the panel itself, never on an ancestor of it: that would
  // cut off the panel's backdrop blur until the fade ended.
  return (
    <div
      className="search-overlay fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      // Handled here, with focus in the bar, so Escape closes only the bar and
      // never also a page panel listening on the document underneath.
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <m.div
        className="search-overlay-backdrop absolute inset-0"
        onMouseDown={close}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      <m.div
        className="search-overlay-panel relative mx-auto mt-[18vh] w-[min(640px,calc(100%-2rem))] rounded-xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
      <Command
        className="bg-transparent"
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
        <div className="search-overlay-divider flex items-center gap-3 px-5 py-3 min-w-0 border-b">
          <Search className="w-5 h-5 text-muted-foreground/50 shrink-0" />
          <CommandInput
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={
              nestChild
                ? `Make "${nestChild.name}" a subtask of…`
                : snoozeTask
                  ? `Snooze "${snoozeTask.name}" until…`
                  : "Search, 'add …' or 'log …'"
            }
            wrapperClassName="border-0 px-0 flex-1 min-w-0"
            className="h-8 text-base bg-transparent border-0 outline-none placeholder:text-muted-foreground/40 focus:ring-0"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground font-medium tracking-wider shrink-0">
            ESC
          </kbd>
        </div>

              <CommandList className="max-h-[min(420px,60vh)] overflow-y-auto scrollbar-thin px-2 py-2">
                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground/70">
                  {nestChild ? "No task to nest it under." : snoozeTask ? "No matching snooze." : 'No results found. Try "add Buy milk" or "log 25 for Lunch".'}
                </CommandEmpty>

                {nestChild ? (
                  <CommandGroup heading={`Subtask of… (${nestChild.name})`}>
                    {parentChoices.map((parent) => (
                      <CommandItem
                        key={parent.id}
                        value={`parent-${parent.id}-${parent.name}`}
                        onSelect={() => handleNest(parent)}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <ListTree className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{parent.name}</p>
                          <p className="text-xs text-muted-foreground">{parent.startDate}</p>
                        </div>
                      </CommandItem>
                    ))}
                    <CommandItem
                      value="parent-cancel"
                      onSelect={() => {
                        setNestChild(null);
                        setSearch("");
                      }}
                      className={ITEM}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Cancel</p>
                    </CommandItem>
                  </CommandGroup>
                ) : snoozeTask ? (
                  <CommandGroup heading={`Snooze until… (${snoozeTask.name})`}>
                    {snoozePresets(toLocalDateStr()).map((preset) => (
                      <CommandItem
                        key={preset.id}
                        value={`snooze-${preset.id}-${preset.label}`}
                        onSelect={() => handleSnooze(preset.date)}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <AlarmClock className="w-4 h-4" />
                        </div>
                        <p className="flex-1 min-w-0 text-sm font-medium truncate">{preset.label}</p>
                        <span className="text-xs text-muted-foreground">{formatSnoozeDate(preset.date, toLocalDateStr())}</span>
                      </CommandItem>
                    ))}
                    <CommandItem
                      value="snooze-someday-Someday"
                      onSelect={() => handleSnooze("someday")}
                      className={ITEM}
                    >
                      <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                        <InfinityIcon className="w-4 h-4" />
                      </div>
                      <p className="flex-1 min-w-0 text-sm font-medium truncate">Someday</p>
                      <span className="text-xs text-muted-foreground">No date</span>
                    </CommandItem>
                    <CommandItem
                      value="snooze-cancel"
                      onSelect={() => {
                        setSnoozeTask(null);
                        setSearch("");
                      }}
                      className={ITEM}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Cancel</p>
                    </CommandItem>
                  </CommandGroup>
                ) : (
                <>

                {/* ── Quick Add to the vault — always the first row ── */}
                <CommandGroup heading="Vault">
                  <CommandItem
                    value="quick-add-vault"
                    onSelect={handleQuickAdd}
                    className={ITEM}
                  >
                    <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                      <NotebookPen className="w-4 h-4" />
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
                      className={ITEM}
                    >
                      <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                        <Plus className="w-4 h-4" />
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
                      className={ITEM}
                    >
                      <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg">
                        <DollarSign className="w-4 h-4" />
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
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Tasks">
                      {matchedTasks.slice(0, 5).map((task) => {
                        const cat = taskCategories.find((c) => c.id === task.categoryId);
                        return (
                          <CommandItem
                            key={task.id}
                            value={`task-${task.name}-${cat?.name ?? ""}`}
                            onSelect={() => handleNavigate("tasks")}
                            className={ITEM}
                          >
                            <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                              <CheckCircle2
                                className={`w-4 h-4 ${task.completed ? "opacity-60" : ""}`}
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
                    {/* Nest or un-nest the best match: one action per row would crowd the list. */}
                    {matchedTasks[0] && !matchedTasks[0].completed && (
                      <CommandGroup heading="Task actions">
                        {matchedTasks[0].parentId ? (
                          <CommandItem
                            value={`unnest-${matchedTasks[0].name}`}
                            onSelect={() => handleUnnest(matchedTasks[0])}
                            className={ITEM}
                          >
                            <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                              <CornerLeftUp className="w-4 h-4" />
                            </div>
                            <p className="flex-1 min-w-0 text-sm font-medium truncate">Move "{matchedTasks[0].name}" to top level</p>
                          </CommandItem>
                        ) : (
                          nestTargets(matchedTasks[0].id, tasks).length > 0 && (
                            <CommandItem
                              value={`nest-${matchedTasks[0].name}`}
                              onSelect={() => startNesting(matchedTasks[0])}
                              className={ITEM}
                            >
                              <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                                <ListTree className="w-4 h-4" />
                              </div>
                              <p className="flex-1 min-w-0 text-sm font-medium truncate">Make "{matchedTasks[0].name}" a subtask of…</p>
                              <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                            </CommandItem>
                          )
                        )}
                        {/* Snooze or wake the best match. Children follow their parent. */}
                        {canSnooze(matchedTasks[0]) &&
                          (ownSnoozed(matchedTasks[0], toLocalDateStr()) ? (
                            <CommandItem
                              value={`unsnooze-${matchedTasks[0].name}`}
                              onSelect={() => handleUnsnooze(matchedTasks[0])}
                              className={ITEM}
                            >
                              <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                                <Sunrise className="w-4 h-4" />
                              </div>
                              <p className="flex-1 min-w-0 text-sm font-medium truncate">Unsnooze "{matchedTasks[0].name}"</p>
                            </CommandItem>
                          ) : (
                            <CommandItem
                              value={`snooze-task-${matchedTasks[0].name}`}
                              onSelect={() => startSnoozing(matchedTasks[0])}
                              className={ITEM}
                            >
                              <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                                <AlarmClock className="w-4 h-4" />
                              </div>
                              <p className="flex-1 min-w-0 text-sm font-medium truncate">Snooze "{matchedTasks[0].name}"…</p>
                              <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    )}
                  </>
                )}

                {/* ── Matching Transactions ── */}
                {matchedTransactions.length > 0 && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Financials">
                      {matchedTransactions.slice(0, 5).map((tx) => {
                        const cat = financialCategories.find((c) => c.id === tx.categoryId);
                        return (
                          <CommandItem
                            key={tx.id}
                            value={`tx-${tx.name}-${cat?.name ?? ""}`}
                            onSelect={() => handleNavigate("financials")}
                            className={ITEM}
                          >
                            <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg">
                              <Wallet className="w-4 h-4" />
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
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Vault Notes">
                      {matchedNotes.map((note) => (
                        <CommandItem
                          key={note.path}
                          value={`note-${note.title}-${note.tags.join("-")}-${note.path}`}
                          onSelect={() => handleOpenNote(note.path)}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                            <BookOpen className="w-4 h-4" />
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

                {/* ── Recently opened tasks, notes and events (empty search) ── */}
                {!search && recentRows.length > 0 && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Recent">
                      {recentRows.map(({ item, title, task }) => {
                        const Icon = RECENT_ICONS[item.kind];
                        return (
                          <CommandItem
                            key={`${item.kind}-${item.id}`}
                            value={`recent-${item.kind}-${item.id}`}
                            onSelect={() => handleOpenRecent(item, task)}
                            className={ITEM}
                          >
                            <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{title}</p>
                              <p className="text-xs text-muted-foreground truncate">{recentHint(item, task)}</p>
                            </div>
                            <History className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}

                {/* ── Quick Actions (when empty search, focused) ── */}
                {!search && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Quick Actions">
                      <CommandItem
                        value="add-new-task"
                        onSelect={handleAddTask}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">Add a new task</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">or type "add"</span>
                      </CommandItem>
                      <CommandItem
                        value="log-expense"
                        onSelect={handleLogExpense}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg">
                          <DollarSign className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">Log an expense</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">or type "log"</span>
                      </CommandItem>
                      <CommandItem
                        value="add-new-event"
                        onSelect={handleAddEvent}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <CalendarPlus className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">Add a new event</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">The Horizon</span>
                      </CommandItem>
                      <CommandItem
                        value="search-tasks-transactions"
                        onSelect={() => {}}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg">
                          <Search className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">Search tasks & transactions</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">just start typing</span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}

                {/* ── Settings shortcut (matched by cmdk's filter on `value`) ── */}
                {!addPrefix && !logPrefix && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Settings">
                      <CommandItem
                        value="settings-preferences-hotkey-shortcut-vault-folder-launch-login"
                        onSelect={() => handleNavigate("settings")}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <Settings className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">Open Settings</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">hotkeys, startup, vault</span>
                      </CommandItem>
                      {/* Individual sections only once something is typed, or the list would crowd the empty bar. */}
                      {search &&
                        SETTINGS_SECTIONS.filter((section) => !section.desktopOnly || isDesktop()).map((section) => {
                          const Icon = SECTION_ICONS[section.id] ?? Settings;
                          return (
                            <CommandItem
                              key={section.id}
                              value={settingsSectionValue(section)}
                              onSelect={() => handleOpenSettingsSection(section.id)}
                              className={ITEM}
                            >
                              <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">Settings → {section.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{section.hint}</p>
                              </div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                            </CommandItem>
                          );
                        })}
                      <CommandItem
                        value="portal-web-apps-discord-instagram-linkedin-spotify-gmail-outlook-x-reddit"
                        onSelect={() => handleNavigate("portal")}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <Orbit className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">Open The Portal</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">Discord, Instagram, web apps</span>
                      </CommandItem>
                      {isDesktop() && (
                        <CommandItem
                          value="nebula-coding-agent-ai-chat-deepseek-claude-code-kimi-model"
                          onSelect={() => handleNavigate("nebula")}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium">Open The Nebula</span>
                          <span className="ml-auto text-xs text-muted-foreground/50">coding agent</span>
                        </CommandItem>
                      )}
                      {isDesktop() && (
                        <CommandItem
                          value="terminal-powershell-shell-command-line-console"
                          onSelect={() => handleNavigate("terminal")}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                            <SquareTerminal className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium">Open Terminal</span>
                          <span className="ml-auto text-xs text-muted-foreground/50">PowerShell</span>
                        </CommandItem>
                      )}
                    </CommandGroup>
                  </>
                )}
                </>
                )}
              </CommandList>

              {/* Footer */}
              <div className="search-overlay-divider flex items-center justify-between px-4 py-2 border-t text-[11px] text-muted-foreground/50">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border text-[10px]">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border text-[10px]">↵</kbd>
                    select
                  </span>
                </div>
                <span className="search-overlay-brand font-medium text-xs">Crystal OS</span>
              </div>
      </Command>
      </m.div>
    </div>
  );
}
