import { useState } from "react";
import { ChevronRight, Folder, Loader2, MessageSquarePlus, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { nebula, useHarness } from "@/hooks/useHarness";
import { harness, selectProjectChats } from "@/lib/harness/store";
import NewProjectDialog from "./NewProjectDialog";

type Confirm = { kind: "chat"; id: string; title: string } | { kind: "project"; id: string; title: string; path: string } | null;

/** Projects (folders) with their chats, newest first, pinned on top. */
export default function ProjectSidebar() {
  const state = useHarness();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [newProject, setNewProject] = useState(false);

  const commitRename = () => {
    if (renaming) harness.renameChat(renaming.id, renaming.title);
    setRenaming(null);
  };

  return (
    <aside className="nebula-panel flex w-64 shrink-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Projects</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setNewProject(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {state.projects.length === 0 && <p className="px-2 py-6 text-center text-xs text-white/50">Add a project folder to start chatting.</p>}
        {state.projects.map((project) => {
          const chats = selectProjectChats(state, project.id);
          const isCollapsed = collapsed[project.id];
          return (
            <div key={project.id} className="mb-1">
              <div className="group flex items-center gap-0.5 rounded-md px-1 hover:bg-white/5">
                <button
                  type="button"
                  className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={() => setCollapsed((c) => ({ ...c, [project.id]: !c[project.id] }))}
                  aria-label={isCollapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm font-medium"
                  onClick={() => {
                    setCollapsed((c) => ({ ...c, [project.id]: false }));
                    harness.openProjectChat(project.id);
                  }}
                  title={`New chat in ${project.path}`}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--nebula-a)]" />
                  <span className="truncate">{project.name}</span>
                </button>
                <button type="button" className="rounded p-1 text-white/50 opacity-0 hover:text-white group-hover:opacity-100" title="New chat" onClick={() => harness.createChat(project.id)}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded p-1 text-white/50 opacity-0 hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="Project actions">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => harness.createChat(project.id)}>New chat</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-400" onClick={() => setConfirm({ kind: "project", id: project.id, title: project.name, path: project.path })}>
                      Remove project…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {!isCollapsed && (
                <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-white/[0.08] pl-2">
                  {chats.length === 0 && <li className="px-2 py-1 text-xs text-white/40">No chats</li>}
                  {chats.map((chat) => {
                    const active = state.activeChatId === chat.id;
                    const running = state.runtime[chat.id]?.running;
                    return (
                      <li key={chat.id} className={`group/chat flex items-center rounded-md ${active ? "nebula-active-chat" : "hover:bg-white/5"}`}>
                        {renaming?.id === chat.id ? (
                          <Input
                            autoFocus
                            value={renaming.title}
                            onChange={(e) => setRenaming({ id: chat.id, title: e.target.value })}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            className="h-7 text-xs"
                            maxLength={120}
                          />
                        ) : (
                          <button
                            type="button"
                            className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-xs ${active ? "text-white" : "text-white/65"}`}
                            onClick={() => harness.setActiveChat(chat.id)}
                          >
                            {chat.pinned && <Pin className="h-3 w-3 shrink-0 text-white/40" />}
                            <span className="truncate">{chat.title}</span>
                            {running && <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin text-[var(--nebula-c)]" />}
                          </button>
                        )}
                        {renaming?.id !== chat.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="mr-1 rounded p-1 text-white/50 opacity-0 hover:text-white group-hover/chat:opacity-100 data-[state=open]:opacity-100"
                              aria-label="Chat actions"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setRenaming({ id: chat.id, title: chat.title })}>
                                <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => harness.togglePin(chat.id)}>
                                {chat.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
                                {chat.pinned ? "Unpin" : "Pin"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-400" disabled={running} onClick={() => setConfirm({ kind: "chat", id: chat.id, title: chat.title })}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <NewProjectDialog open={newProject} onOpenChange={setNewProject} />

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "project" ? `Remove ${confirm.title}?` : `Delete "${confirm?.title}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "project"
                ? `Its chats are deleted from Crystal OS. The folder ${confirm.path} and its files are left alone.`
                : "The transcript is deleted from Crystal OS. Files the agent changed stay changed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirm?.kind === "chat") harness.deleteChat(confirm.id);
                if (confirm?.kind === "project") {
                  nebula.closeWorkspace(confirm.path);
                  harness.removeProject(confirm.id);
                }
                setConfirm(null);
              }}
            >
              {confirm?.kind === "project" ? "Remove" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
