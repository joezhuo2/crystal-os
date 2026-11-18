import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CircleDot, ExternalLink, FolderGit2, GitPullRequest, ListPlus, Timer, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useAppActions, useTaskCategories, useTasks } from "@/contexts/AppContext";
import { useNebulaSearchIndex } from "@/hooks/useHarness";
import { fetchInbox, GITHUB_LISTS, githubTask, itemRef, linkedTask, matchProject, type GitHubItem, type GitHubList } from "@/lib/github";
import { harness } from "@/lib/harness/store";
import { openExternal } from "@/lib/platform";
import { pomodoro } from "@/lib/pomodoro";
import { toLocalDateStr } from "@/lib/utils";
import type { TabId } from "@/components/layout/Navigation";

const LIST_ICONS: Record<GitHubList, LucideIcon> = { reviews: GitPullRequest, issues: CircleDot };

function Row({ value, icon: Icon, title, hint, itemClass, arrow, onSelect }: { value: string; icon: LucideIcon; title: string; hint?: string; itemClass: string; arrow?: boolean; onSelect: () => void }) {
  return (
    <CommandItem value={value} onSelect={onSelect} className={itemClass}>
      <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0" data-private>
        <p className="text-sm font-medium truncate">{title}</p>
        {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
      </div>
      {arrow && <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
    </CommandItem>
  );
}

export function GitHubCommands({ list, itemClass, tasksOn, nebulaOn, onNavigate, onClose, onBack, onStep }: {
  list: GitHubList;
  itemClass: string;
  tasksOn: boolean;
  nebulaOn: boolean;
  onNavigate: (tab: TabId) => void;
  onClose: () => void;
  onBack: () => void;
  /** A level was entered or left: the bar clears what was typed. */
  onStep: () => void;
}) {
  const inbox = useQuery({ queryKey: ["github-inbox"], queryFn: fetchInbox, staleTime: 60_000, retry: false });
  const [picked, setPicked] = useState<GitHubItem | null>(null);
  const tasks = useTasks();
  const categories = useTaskCategories();
  const { addTask } = useAppActions();
  const { projects } = useNebulaSearchIndex(nebulaOn);
  const { label, empty } = GITHUB_LISTS[list];

  const step = (item: GitHubItem | null) => {
    setPicked(item);
    onStep();
  };

  if (!picked) {
    const items = inbox.data?.[list] ?? [];
    return (
      <CommandGroup heading={label}>
        {(inbox.isLoading || inbox.error || !items.length) && (
          <p role="status" className="px-3 py-3 text-sm text-muted-foreground/70">
            {inbox.isLoading ? "Asking GitHub…" : inbox.error ? `Could not reach GitHub: ${inbox.error instanceof Error ? inbox.error.message : String(inbox.error)}` : empty}
          </p>
        )}
        {items.map((item) => (
          <Row
            key={item.url}
            value={`github-item-${itemRef(item)}-${item.title}`}
            icon={LIST_ICONS[list]}
            title={item.title}
            hint={`${itemRef(item)} · updated ${new Date(item.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            itemClass={itemClass}
            arrow
            onSelect={() => step(item)}
          />
        ))}
        <Row value="github-back" icon={ArrowLeft} title="Back" itemClass={itemClass} onSelect={onBack} />
      </CommandGroup>
    );
  }

  const existing = linkedTask(tasks, picked);
  const project = nebulaOn ? matchProject(picked, projects) : undefined;

  const ensureTask = async () => {
    if (existing) return { id: existing.id, title: existing.name };
    const task = githubTask(picked, list, categories[0]?.id ?? "", toLocalDateStr());
    const id = await addTask(task);
    return id ? { id, title: task.name } : null;
  };

  const createTask = async () => {
    onClose();
    if (existing) return onNavigate("tasks");
    const task = await ensureTask();
    if (task) toast.success(`Task added for today: ${task.title}`);
  };

  const focus = async () => {
    onClose();
    const task = await ensureTask();
    if (!task) return;
    const { phase } = pomodoro.getState();
    pomodoro.setTask(task);
    if (phase === "break") pomodoro.reset();
    if (!pomodoro.getState().running) pomodoro.start();
    toast.success(`Focusing on ${task.title}`);
  };

  const openProject = () => {
    if (!project) return;
    harness.openProjectChat(project.id);
    onNavigate("nebula");
    onClose();
  };

  const openGitHub = () => {
    openExternal(picked.url).catch(() => toast.error("Could not open GitHub"));
    onClose();
  };

  return (
    <CommandGroup heading={`${itemRef(picked)}: ${picked.title}`}>
      {tasksOn && (
        <Row
          value="github-action-task"
          icon={ListPlus}
          title={existing ? "Open the linked task" : "Create a linked task"}
          hint={existing ? existing.name : "Today, with the GitHub link in its notes"}
          itemClass={itemClass}
          onSelect={() => void createTask()}
        />
      )}
      {tasksOn && (
        <Row value="github-action-pomodoro-focus" icon={Timer} title="Start a Pomodoro" hint={existing ? "On the linked task" : "Creates the linked task and starts the timer"} itemClass={itemClass} onSelect={() => void focus()} />
      )}
      {project && <Row value="github-action-nebula-project" icon={FolderGit2} title={`Open ${project.name} in The Nebula`} hint={project.path} itemClass={itemClass} onSelect={openProject} />}
      <Row value="github-action-open-browser" icon={ExternalLink} title="Open on GitHub" hint={picked.url} itemClass={itemClass} onSelect={openGitHub} />
      <Row value="github-back" icon={ArrowLeft} title="Back" itemClass={itemClass} onSelect={() => step(null)} />
    </CommandGroup>
  );
}
