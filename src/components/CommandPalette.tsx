import { useState, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { useAppActions, useFinancialCategories, useTaskCategories, useTasks, useTransactions, type Task } from "@/contexts/AppContext";
import { nestTargets } from "@/lib/subtasks";
import { fuzzyRank, fuzzyScore } from "@/lib/fuzzy";
import { parsePaletteCommand, readRecentCommands, recordRecentCommand, type PaletteCommand } from "@/lib/paletteCommand";
import { quickTask } from "@/lib/quickCommand";
import { pomodoro } from "@/lib/pomodoro";
import { privacySettings } from "@/lib/privacySettings";
import { notifySettings } from "@/lib/notifySettings";
import { themeSettings } from "@/lib/themeSettings";
import { canSnooze, formatSnoozeDate, ownSnoozed, snoozePresets, snoozeTitle, snoozeUpdates, UNSNOOZE } from "@/lib/snooze";
import { toast } from "sonner";
import { appUi } from "@/lib/appUi";
import { toLocalDateStr, useDebouncedValue } from "@/lib/utils";
import { useVaultNotes } from "@/hooks/useVault";
import { useFinance } from "@/hooks/useFinance";
import { amountLabel, categorise } from "@/lib/finance";
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
  CandlestickChart,
  Telescope,
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
  CalendarSearch,
  Package,
  PanelLeft,
  Mail,
  EyeOff,
  BellOff,
  Palette,
  Timer,
  Zap,
  Gamepad2,
} from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { isDesktop, openExternal } from "@/lib/platform";
import { usePortalOcclusion } from "@/hooks/usePortal";
import { readRecents, type RecentItem } from "@/lib/recents";
import { SETTINGS_SECTIONS, settingsSectionValue } from "@/lib/settingsSections";
import { calendarWasConnected, useCalendarEvents, useCalendarStatus } from "@/hooks/useGoogleCalendar";
import { pickedCalendarId } from "@/hooks/useTodayCapacity";
import { capacityWindow, useCapacitySettings } from "@/lib/capacitySettings";
import { formatEstimate } from "@/lib/capacity";
import { findFreeSlot, FREE_SLOT_DAYS, parseFreeSlot } from "@/lib/freeSlot";
import { fromMinutes } from "@/lib/timeGrid";
import { usesSidecar } from "@/lib/platform";
import { useNebulaSearchIndex } from "@/hooks/useHarness";
import { savedPrompts, useSavedPrompts } from "@/lib/harness/savedPrompts";
import { harness, selectActiveChat } from "@/lib/harness/store";
import { searchChats } from "@/lib/harness/chatSearch";
import { useInstalledModules } from "@/lib/installedModules";
import { useMailDigest, useMailStatus } from "@/hooks/useMail";
import { mailWasConnected } from "@/lib/mail";
import { PALETTE_EVENT_DAYS_AHEAD, PALETTE_EVENT_DAYS_BACK, parseSearchFilters, searchEvents, searchMail, taskPasses, upcomingEvents, wantsType } from "@/lib/paletteSearch";

const RECENT_MODULE: Record<RecentItem["kind"], TabId> = {
  task: "tasks",
  note: "archive",
  event: "calendar",
};

const ITEM = "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer";
const ObservatoryCommands = lazy(() => import("@/modules/observatory/ObservatoryCommands").then((m) => ({ default: m.ObservatoryCommands })));

/** Icons for the Settings sections, matching their headers on the Settings page. */
const SECTION_ICONS: Record<string, React.ElementType> = {
  shortcuts: Keyboard,
  keymap: Keyboard,
  modules: Package,
  navbar: PanelLeft,
  startup: Power,
  vault: FolderOpen,
  nebula: Sparkles,
  engine: ListTodo,
  notifications: Bell,
  orbit: Orbit,
  portal: AppWindow,
  atmosphere: CloudSun,
  mail: Mail,
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
  const { uninstalled } = useInstalledModules();
  const on = (id: TabId) => !uninstalled.includes(id);
  const tasksOn = on("tasks");
  const calendarOn = on("calendar");
  const financialsOn = on("financials");
  const archiveOn = on("archive");
  const nebulaOn = on("nebula");
  const mailOn = on("mail");
  const observatoryOn = on("observatory");
  const tasks = useTasks();
  const { updateTask, rescheduleTasks, addTask, addTransaction, completeTask } = useAppActions();
  // "Make subtask of…": the task being nested while the bar lists parents for it.
  const [nestPick, setNestChild] = useState<Task | null>(null);
  const nestChild = tasksOn ? nestPick : null;
  // "Snooze…": the task being snoozed while the bar lists the snooze picks.
  const [snoozePick, setSnoozeTask] = useState<Task | null>(null);
  const snoozeTask = tasksOn ? snoozePick : null;
  const transactions = useTransactions();
  const taskCategories = useTaskCategories();
  const financialCategories = useFinancialCategories();
  const { rules } = useFinance();
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
  const [recentCommands] = useState(readRecentCommands);

  // ---------- Natural-language parsing ----------
  const addPrefix = search.toLowerCase().startsWith("add ");
  const logPrefix = search.toLowerCase().startsWith("log ");

  // ---------- Search existing data ----------
  const usable = (c: PaletteCommand<Task> | null) =>
    !c || (c.kind === "log" ? financialsOn : tasksOn && (c.kind !== "snooze" || canSnooze(c.task))) ? c : null;
  const command = usable(parsePaletteCommand(search, tasks, toLocalDateStr()));

  const filters = parseSearchFilters(search, toLocalDateStr());
  const text = filters.text;
  const searching = (text.length >= 2 || filters.active) && !addPrefix && !logPrefix && !command;
  const taskCategory = (t: Task) => taskCategories.find((c) => c.id === t.categoryId)?.name;
  const txCategory = (t: { categoryId: string }) => financialCategories.find((c) => c.id === t.categoryId)?.name;

  const filteredTasks =
    tasksOn && searching && wantsType(filters, "task")
      ? tasks.filter((t) => taskPasses(t, taskCategory(t), filters, toLocalDateStr()))
      : [];
  const matchedTasks = text
    ? fuzzyRank(text, filteredTasks, (t) => `${t.name} ${taskCategory(t) ?? ""} ${t.notes ?? ""} ${(t.checklist ?? []).map((i) => i.text).join(" ")}`)
    : [...filteredTasks].sort((a, b) => Number(a.completed) - Number(b.completed) || a.endDate.localeCompare(b.endDate));

  const filteredTransactions =
    financialsOn && searching && wantsType(filters, "transaction")
      ? transactions.filter((t) => !filters.tag || txCategory(t)?.toLowerCase().includes(filters.tag))
      : [];
  const matchedTransactions = text ? fuzzyRank(text, filteredTransactions, (t) => `${t.name} ${txCategory(t) ?? ""}`) : filteredTransactions;

  // ---------- "next 5h": the next free block in The Horizon ----------
  const slot = parseFreeSlot(search);
  const slotMinutes = slot?.minutes ?? null;
  const capacity = useCapacitySettings();
  const eventsWanted = calendarOn && !addPrefix && !logPrefix && slotMinutes === null && wantsType(filters, "event") && !filters.overdue;
  const eventQuery = eventsWanted ? text : "";
  const debouncedEventQuery = useDebouncedValue(eventQuery, 250);
  const eventsByFilter = eventsWanted && !text && (filters.type === "event" || filters.dueBy !== null);
  const eventSearchOn = debouncedEventQuery.length >= 2 || eventsByFilter;
  const calendarStatus = useCalendarStatus(calendarOn && (slotMinutes !== null || eventSearchOn) && (!usesSidecar() || calendarWasConnected()));
  const calendarConnected = calendarStatus.data?.connected === true;
  const slotRange = useMemo(() => {
    const now = new Date();
    return {
      calendarId: pickedCalendarId(),
      timeMin: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      timeMax: new Date(now.getFullYear(), now.getMonth(), now.getDate() + FREE_SLOT_DAYS).toISOString(),
    };
  }, []);
  const slotEvents = useCalendarEvents(slotRange, calendarOn && slotMinutes !== null && calendarConnected);
  const slotLoading = calendarStatus.isLoading || (calendarConnected && slotEvents.isLoading);
  const freeSlot =
    slotMinutes === null || slotLoading
      ? null
      : findFreeSlot({
          events: slotEvents.data?.events ?? [],
          now: new Date(),
          minutes: slotMinutes,
          window: capacityWindow(capacity),
          days: slot?.days,
        });

  const eventRange = useMemo(() => {
    const now = new Date();
    return {
      calendarId: pickedCalendarId(),
      timeMin: new Date(now.getFullYear(), now.getMonth(), now.getDate() - PALETTE_EVENT_DAYS_BACK).toISOString(),
      timeMax: new Date(now.getFullYear(), now.getMonth(), now.getDate() + PALETTE_EVENT_DAYS_AHEAD).toISOString(),
    };
  }, []);
  const rangeEvents = useCalendarEvents(eventRange, eventSearchOn && calendarConnected);
  const inDueRange = (e: { startDate: string; endDate: string }) => !filters.dueBy || (e.endDate >= toLocalDateStr() && e.startDate <= filters.dueBy);
  const matchedEvents = !eventSearchOn
    ? []
    : eventsByFilter
      ? upcomingEvents(rangeEvents.data?.events ?? [], toLocalDateStr(), filters.dueBy)
      : searchEvents((rangeEvents.data?.events ?? []).filter(inDueRange), debouncedEventQuery, toLocalDateStr());

  const mailQuery = mailOn && !addPrefix && !logPrefix && wantsType(filters, "mail") ? text : "";
  const mailStatus = useMailStatus(mailQuery.length >= 2 && (!usesSidecar() || mailWasConnected()));
  const mailDigest = useMailDigest(mailQuery.length >= 2 ? mailStatus.data?.accounts : []);
  const matchedMail = searchMail(mailDigest.data?.items ?? [], mailQuery);

  // ---------- Search the Obsidian vault ----------
  const vaultQuery = !addPrefix && !logPrefix ? text : "";
  const debouncedVaultQuery = useDebouncedValue(vaultQuery, 250);
  const noteTag = filters.tag ?? undefined;
  const notesOn = archiveOn && wantsType(filters, "note") && (debouncedVaultQuery.length >= 2 || (!!noteTag && !addPrefix && !logPrefix));
  const { data: vaultData } = useVaultNotes({ q: debouncedVaultQuery, tag: noteTag, limit: 5 }, notesOn);
  const matchedNotes = notesOn ? (vaultData?.notes ?? []) : [];

  // ---------- Search Nebula chats (desktop) ----------
  const chatQuery = nebulaOn && vaultQuery.length >= 2 && wantsType(filters, "chat") ? vaultQuery : "";
  const nebulaIndex = useNebulaSearchIndex(chatQuery !== "");
  const matchedChats = nebulaOn ? searchChats(nebulaIndex.chats, nebulaIndex.messagesOf, chatQuery) : [];
  const projectName = (id: string) => nebulaIndex.projects.find((p) => p.id === id)?.name ?? "Project";

  const activeProjectId = selectActiveChat(harness.getState())?.projectId;
  useSavedPrompts();
  const projectPrompts = nebulaOn && activeProjectId && isDesktop() ? savedPrompts.forProject(activeProjectId) : [];

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

  const handleOpenChat = (chatId: string) => {
    harness.setActiveChat(chatId);
    handleNavigate("nebula");
  };

  const handleInsertPrompt = (body: string) => {
    savedPrompts.queueInsert(body);
    handleNavigate("nebula");
  };

  const handleOpenNote = (notePath: string) => {
    setSelectedNotePath(notePath);
    handleNavigate("archive");
  };

  const handleOpenEvent = (event: { id: string; calendarId: string; startDate: string }) => {
    appUi.setOpenEvent({ id: event.id, calendarId: event.calendarId, date: event.startDate });
    handleNavigate("calendar");
  };

  const handleOpenMail = (url: string) => {
    openExternal(url).catch(() => toast.error("Could not open the email"));
    close();
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

  const runCommand = (c: PaletteCommand<Task>, text: string) => {
    const today = toLocalDateStr();
    if (c.kind === "add") {
      void addTask(quickTask(c.name, taskCategories[0]?.id ?? "", today)).then((id) => {
        if (id) toast.success(`Task added for today: ${c.name}`);
      });
      recordRecentCommand(text);
    } else if (c.kind === "log") {
      addTransaction({ name: c.name, amount: c.amount, type: "expense", categoryId: categorise(c.name, rules, transactions), date: today });
      toast.success(`Logged ${c.amount.toFixed(2)} for ${c.name}`);
      recordRecentCommand(text);
    } else if (c.kind === "complete") {
      completeTask(c.task);
    } else if (c.kind === "focus") {
      const state = pomodoro.getState();
      pomodoro.setTask({ id: c.task.id, title: c.task.name });
      if (state.phase === "break") pomodoro.reset();
      if (!pomodoro.getState().running) pomodoro.start();
      toast.success(`Focusing on ${c.task.name}`);
    } else if (c.until) {
      rescheduleTasks([{ id: c.task.id, updates: snoozeUpdates(c.until) }], snoozeTitle(c.task.name, c.until, today));
    } else {
      return startSnoozing(c.task);
    }
    close();
  };

  const commandLabel = (c: PaletteCommand<Task>): [string, string] => {
    if (c.kind === "add") return [`Add task "${c.name}"`, "Today, in your first category"];
    if (c.kind === "log") return [`Log ${c.amount.toFixed(2)} for "${c.name}"`, "An expense, today"];
    if (c.kind === "complete") return [`Complete "${c.task.name}"`, "Mark it done"];
    if (c.kind === "focus") return [`Start focus on "${c.task.name}"`, "Links the Pomodoro to it and starts the timer"];
    if (c.until === "someday") return [`Snooze "${c.task.name}" to Someday`, "Hidden until you unsnooze it"];
    if (c.until) return [`Snooze "${c.task.name}" until ${formatSnoozeDate(c.until, toLocalDateStr())}`, "Hidden until that day"];
    return [`Snooze "${c.task.name}"…`, "Pick a day"];
  };

  const handleRecentCommand = (text: string) => {
    const parsed = usable(parsePaletteCommand(text, tasks, toLocalDateStr()));
    if (parsed) return runCommand(parsed, text);
    setSearch(text);
    inputRef.current?.focus();
  };

  const toggles = [
    {
      value: "toggle privacy mode blur hide amounts",
      label: "Toggle privacy mode",
      hint: privacySettings.getState() ? "On" : "Off",
      Icon: EyeOff,
      run: () => {
        const next = !privacySettings.getState();
        privacySettings.setEnabled(next);
        toast.success(`Privacy mode ${next ? "on" : "off"}`);
      },
    },
    {
      value: "toggle dnd do not disturb quiet notifications",
      label: "Toggle Do Not Disturb",
      hint: notifySettings.getState().doNotDisturb ? "On" : "Off",
      Icon: BellOff,
      run: () => {
        const next = !notifySettings.getState().doNotDisturb;
        notifySettings.setFlag("doNotDisturb", next);
        toast.success(`Do Not Disturb ${next ? "on" : "off"}`);
      },
    },
    {
      value: "switch theme toggle change orbit default appearance",
      label: "Switch theme",
      hint: themeSettings.getState().theme === "orbit" ? "Orbit" : "Default",
      Icon: Palette,
      run: () => themeSettings.setTheme(themeSettings.getState().theme === "orbit" ? "default" : "orbit"),
    },
  ];

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
    if (!on(RECENT_MODULE[item.kind])) return [];
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

  const handleFreeSlot = () => {
    if (!freeSlot) return close();
    if (calendarConnected) {
      appUi.setNewEventSlot({ date: freeSlot.date, start: fromMinutes(freeSlot.start), end: fromMinutes(freeSlot.end) });
      setShowEventForm(true);
    }
    handleNavigate("calendar");
  };

  const slotDay = (date: string) => {
    const today = toLocalDateStr();
    const tomorrow = toLocalDateStr(new Date(Date.now() + 86400000));
    return date === today ? "Today" : date === tomorrow ? "Tomorrow" : formatSnoozeDate(date, today);
  };

  const handleAddEvent = () => {
    // The Horizon owns the event form, so flag the request and navigate there.
    setShowEventForm(true);
    handleNavigate("calendar");
  };

  const vaultGroup = archiveOn && (
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
  );

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
        filter={(value) => {
          // Vault notes are matched server-side (including on body text), Nebula
          // chats on their messages, and
          // Quick Add is always offered — neither can pass a local substring
          // test against the raw query, so they opt out of cmdk's filter.
          if (value === "quick-add-vault" || value === "free-slot" || value === "run-command" || value.startsWith("task-") || value.startsWith("tx-") || value.startsWith("note-") || value.startsWith("nebula-chat-") || value.startsWith("mail-") || value.startsWith("event-") || value.startsWith("obs-")) return 1;
          return text ? fuzzyScore(text, value) : filters.active ? 1 : 0;
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
                  : "Search anything, 'add …' or 'log …'"
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

                {/* ── "next 5h": the next free block ── */}
                {calendarOn && slotMinutes !== null && (
                  <CommandGroup heading="The Horizon">
                    <CommandItem value="free-slot" onSelect={handleFreeSlot} className={ITEM}>
                      <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                        <CalendarSearch className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {slotLoading
                            ? `Looking for a free ${formatEstimate(slotMinutes)} block…`
                            : freeSlot
                              ? `Next free ${formatEstimate(slotMinutes)}: ${slotDay(freeSlot.date)}, ${fromMinutes(freeSlot.start)}–${fromMinutes(freeSlot.end)}`
                              : `No free ${formatEstimate(slotMinutes)} block in the next ${slot?.days === 1 ? "day" : `${slot?.days ?? FREE_SLOT_DAYS} days`}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {!slotLoading && !calendarConnected
                            ? "Work day only: connect Google Calendar to skip your events"
                            : freeSlot
                              ? "Create an event in that slot"
                              : `Within your work day, ${capacity.dayStart}–${capacity.dayEnd} (Settings → The Engine)`}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                    </CommandItem>
                  </CommandGroup>
                )}

                {!search && (
                  <p className="px-3 py-3 text-sm text-muted-foreground/70">
                    Search for anything, or run a command: "complete …", "snooze … to friday", "focus on …", "toggle privacy". Narrow a search with filters: type:task due:&lt;7d #school.
                  </p>
                )}

                {command && (
                  <CommandGroup heading="Run">
                    <CommandItem value="run-command" onSelect={() => runCommand(command, search)} className={ITEM}>
                      <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                        {command.kind === "focus" ? <Timer className="w-4 h-4" /> : command.kind === "snooze" ? <AlarmClock className="w-4 h-4" /> : command.kind === "log" ? <DollarSign className="w-4 h-4" /> : command.kind === "add" ? <Plus className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{commandLabel(command)[0]}</p>
                        <p className="text-xs text-muted-foreground">{commandLabel(command)[1]}</p>
                      </div>
                      <kbd className="rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground font-medium tracking-wider">ENTER</kbd>
                    </CommandItem>
                  </CommandGroup>
                )}

                {!search && recentCommands.length > 0 && (
                  <CommandGroup heading="Recent commands">
                    {recentCommands.map((text) => (
                      <CommandItem key={text} value={`recent-command-${text}`} onSelect={() => handleRecentCommand(text)} className={ITEM}>
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <Zap className="w-4 h-4" />
                        </div>
                        <p className="flex-1 min-w-0 text-sm font-medium truncate">{text}</p>
                        <span className="text-xs text-muted-foreground/50">run again</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {search && !filters.active && vaultGroup}

                {/* ── Natural Language: Add Task ── */}
                {tasksOn && addPrefix && (
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
                {financialsOn && logPrefix && (
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
                                <span data-private className={tx.type === "income" ? "text-emerald-400" : tx.type === "expense" ? "text-red-400" : "text-muted-foreground"}>
                                  {amountLabel(tx)}
                                </span>
                              </p>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}

                {observatoryOn && !addPrefix && !logPrefix && (
                  <Suspense fallback={null}>
                    <ObservatoryCommands search={search} itemClass={ITEM} onNavigate={() => handleNavigate("observatory")} onClose={close} />
                  </Suspense>
                )}

                {/* ── Matching calendar events ── */}
                {matchedEvents.length > 0 && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="The Horizon">
                      {matchedEvents.map((event) => (
                        <CommandItem
                          key={event.id}
                          value={`event-${event.id}`}
                          onSelect={() => handleOpenEvent(event)}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                            <CalendarDays className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0" data-private>
                            <p className="text-sm font-medium truncate">{event.summary || "(No title)"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[formatRecentDate(event.startDate), event.startTime, event.location].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {/* ── Matching mail ── */}
                {matchedMail.length > 0 && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="The Courier">
                      {matchedMail.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={`mail-${item.id}`}
                          onSelect={() => handleOpenMail(item.url)}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                            <Mail className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0" data-private>
                            <p className="text-sm font-medium truncate">{item.subject || "(No subject)"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[item.company ?? item.from, new Date(item.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })].join(" · ")}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
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

                {/* ── Matching Nebula chats ── */}
                {matchedChats.length > 0 && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Nebula Chats">
                      {matchedChats.map(({ chat, snippet }) => (
                        <CommandItem
                          key={chat.id}
                          value={`nebula-chat-${chat.id}`}
                          onSelect={() => handleOpenChat(chat.id)}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0" data-private>
                            <p className="text-sm font-medium truncate">{chat.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{snippet ?? projectName(chat.projectId)}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {/* ── Saved prompts for the active Nebula project ── */}
                {projectPrompts.length > 0 && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Nebula Prompts">
                      {projectPrompts.map((p) => (
                        <CommandItem key={p.id} value={`nebula-prompt-${p.id} ${p.title}`} onSelect={() => handleInsertPrompt(p.body)} className={ITEM}>
                          <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0" data-private>
                            <p className="text-sm font-medium truncate">{p.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.body}</p>
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

                {!search && vaultGroup && (
                  <>
                    <CommandSeparator className="my-1" />
                    {vaultGroup}
                  </>
                )}

                {/* ── Quick Actions (when empty search, focused) ── */}
                {!search && (tasksOn || financialsOn || calendarOn) && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading="Quick Actions">
                      {tasksOn && (
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
                      )}
                      {financialsOn && (
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
                      )}
                      {calendarOn && (
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
                      )}
                      {(tasksOn || financialsOn) && (
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
                      )}
                    </CommandGroup>
                  </>
                )}

                {/* ── Settings shortcut (matched by cmdk's filter on `value`) ── */}
                {!addPrefix && !logPrefix && !filters.active && (
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
                      {search &&
                        toggles.map(({ value, label, hint, Icon, run }) => (
                          <CommandItem
                            key={value}
                            value={value}
                            onSelect={() => {
                              run();
                              close();
                            }}
                            className={ITEM}
                          >
                            <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">{label}</span>
                            <span className="ml-auto text-xs text-muted-foreground/50">{hint}</span>
                          </CommandItem>
                        ))}
                      {/* Individual sections only once something is typed, or the list would crowd the empty bar. */}
                      {search &&
                        SETTINGS_SECTIONS.filter((section) => (!section.desktopOnly || isDesktop()) && (!section.module || on(section.module))).map((section) => {
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
                      {on("portal") && (
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
                      )}
                      {on("fun") && (
                      <CommandItem
                        value="arcade-fun-daily-games-wordle-connections-contexto-krillion-streak-scores"
                        onSelect={() => handleNavigate("fun")}
                        className={ITEM}
                      >
                        <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                          <Gamepad2 className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">Open The Arcade</span>
                        <span className="ml-auto text-xs text-muted-foreground/50">Daily games, streaks</span>
                      </CommandItem>
                      )}
                      {nebulaOn && isDesktop() && (
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
                      {on("mail") && (
                        <CommandItem
                          value="mail-courier-email-gmail-inbox-bills-payments-job-applications-orders-deliveries-security-alerts"
                          onSelect={() => handleNavigate("mail")}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                            <Mail className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium">Open The Courier</span>
                          <span className="ml-auto text-xs text-muted-foreground/50">bills, jobs, orders</span>
                        </CommandItem>
                      )}
                      {on("trades") && (
                        <CommandItem
                          value="trades-ledger-wealthsimple-stocks-options-profit-loss-pnl-journal"
                          onSelect={() => handleNavigate("trades")}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                            <CandlestickChart className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium">Open The Ledger</span>
                          <span className="ml-auto text-xs text-muted-foreground/50">trades, profit/loss</span>
                        </CommandItem>
                      )}
                      {on("observatory") && (
                        <CommandItem
                          value="observatory-study-courses-flashcards-spaced-repetition-fsrs"
                          onSelect={() => handleNavigate("observatory")}
                          className={ITEM}
                        >
                          <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg">
                            <Telescope className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium">Open The Observatory</span>
                          <span className="ml-auto text-xs text-muted-foreground/50">courses, study</span>
                        </CommandItem>
                      )}
                      {isDesktop() && on("terminal") && (
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
