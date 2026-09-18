import { useEffect, useState } from "react";
import { FolderPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatView from "@/components/nebula/ChatView";
import NebulaSetupCard from "@/components/nebula/NebulaSetupCard";
import NebulaToolbar from "@/components/nebula/NebulaToolbar";
import NewProjectDialog from "@/components/nebula/NewProjectDialog";
import ProjectSidebar from "@/components/nebula/ProjectSidebar";
import { startHarnessSession, useActiveChatLoader, useHarness } from "@/hooks/useHarness";
import { isDesktop } from "@/lib/platform";
import { candidates } from "@/lib/harness/modelRouter";
import { selectActiveChat, selectProjectTokens } from "@/lib/harness/store";

export default function NebulaPage() {
  const desktop = isDesktop();
  const state = useHarness();
  const [newProject, setNewProject] = useState(false);
  const chat = selectActiveChat(state);
  useActiveChatLoader(chat?.id ?? null);

  useEffect(() => {
    startHarnessSession();
  }, []);

  if (!desktop) {
    return (
      <div className="max-w-3xl space-y-4">
        <header className="flex items-center gap-3 px-1">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">The Nebula</h2>
            <p className="text-sm text-muted-foreground">The coding agent runs on this computer, so it is only available in the desktop app.</p>
          </div>
        </header>
      </div>
    );
  }

  const project = chat ? state.projects.find((p) => p.id === chat.projectId) : null;
  const runtime = chat ? state.runtime[chat.id] : undefined;
  const ready = state.hydrated && state.env?.runtimeInstalled && state.config;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[20rem] flex-col gap-3 md:h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-3 px-1">
        <Sparkles className="h-6 w-6 text-[var(--nebula-c)] drop-shadow-[0_0_8px_var(--nebula-c)]" />
        <div>
          <h2 className="nebula-title text-2xl font-bold tracking-tight">The Nebula</h2>
          <p className="text-sm text-white/55">A coding agent for your project folders</p>
        </div>
      </header>

      {!ready ? (
        <NebulaSetupCard />
      ) : (
        <div className="flex min-h-0 flex-1 gap-3">
          <ProjectSidebar />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {chat && project ? (
              <>
                <NebulaToolbar
                  chat={chat}
                  projectPath={project.path}
                  projectName={project.name}
                  running={Boolean(runtime?.running)}
                  chatTokens={runtime?.tokens ?? {}}
                  projectTokens={selectProjectTokens(state, project.id)}
                  allTime={state.allTime}
                  context={runtime?.context ?? null}
                  claudeModel={state.config!.claudeModel}
                  mediumChain={candidates("medium", state.config!).map((c) => c.label).join(" → ")}
                />
                <ChatView chat={chat} messages={runtime?.messages ?? []} running={Boolean(runtime?.running)} stopping={Boolean(runtime?.stopping)} loaded={Boolean(runtime?.loaded)} banner={runtime?.banner ?? null} />
              </>
            ) : (
              <div className="nebula-panel flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <p className="nebula-title text-xl font-semibold">{state.projects.length ? "Pick a chat" : "Start with a project"}</p>
                <p className="max-w-sm text-sm text-white/55">
                  {state.projects.length ? "Choose a chat on the left, or start a new one from a project." : "Point the agent at an existing folder or create a new one."}
                </p>
                {!state.projects.length && (
                  <Button onClick={() => setNewProject(true)}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New project
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <NewProjectDialog open={newProject} onOpenChange={setNewProject} />
    </div>
  );
}
