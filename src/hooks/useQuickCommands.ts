import { useEffect, useRef } from "react";
import { useAppActions, useTaskCategories } from "@/contexts/AppContext";
import { useQuickAdd } from "@/hooks/useVault";
import { isDesktop } from "@/lib/platform";
import { formatClock, pomodoro } from "@/lib/pomodoro";
import { COMMAND_DONE_EVENT, COMMAND_RUN_EVENT, parseQuickCommand, type QuickCommandResult } from "@/lib/quickCommand";
import { toLocalDateStr } from "@/lib/utils";

function startFocus(minutes?: number): QuickCommandResult {
  if (pomodoro.getState().running && pomodoro.getState().phase === "focus") {
    return { ok: false, message: "Focus is already running" };
  }
  // A break in progress is skipped, back to focus.
  if (pomodoro.getState().phase === "break") pomodoro.reset();
  if (minutes) pomodoro.setDuration(minutes * 60);
  pomodoro.start();
  return { ok: true, message: `Focus started: ${formatClock(pomodoro.getState().remaining)}` };
}

/**
 * Runs what the desktop command box sends and answers it with the outcome.
 * Mount once, where the signed-in app lives. A no-op on the web.
 */
export function useQuickCommands() {
  const { addTask } = useAppActions();
  const categories = useTaskCategories();
  const quickAdd = useQuickAdd();
  const latest = useRef({ addTask, categories, quickAdd });
  latest.current = { addTask, categories, quickAdd };

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const run = async (text: string): Promise<QuickCommandResult> => {
      const command = parseQuickCommand(text);
      const { addTask, categories, quickAdd } = latest.current;
      switch (command.kind) {
        case "invalid":
          return { ok: false, message: command.reason };
        case "focus":
          return startFocus(command.minutes);
        case "note":
          try {
            await quickAdd.mutateAsync({ text: command.text });
            return { ok: true, message: "Saved to Inbox" };
          } catch (err) {
            return { ok: false, message: err instanceof Error ? err.message : String(err) };
          }
        case "task": {
          const today = toLocalDateStr();
          // shortcut: addTask reports a failed save only as a toast in the main window, so this cannot say it failed; return its result here if it ever gets one.
          addTask({
            name: command.name,
            startDate: today,
            startTime: "09:00",
            endDate: today,
            endTime: "10:00",
            priority: "medium",
            categoryId: categories[0]?.id ?? "",
            completed: false,
          });
          return { ok: true, message: `Task added for today: ${command.name}` };
        }
      }
    };

    import("@tauri-apps/api/event").then(({ listen, emit }) =>
      listen<string>(COMMAND_RUN_EVENT, async (e) => {
        void emit(COMMAND_DONE_EVENT, await run(String(e.payload ?? "")));
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
