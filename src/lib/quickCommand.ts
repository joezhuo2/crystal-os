/** Sent by the command box with the typed text; the main webview runs it. */
export const COMMAND_RUN_EVENT = "command://run";
/** Sent back by the main webview with a `QuickCommandResult`. */
export const COMMAND_DONE_EVENT = "command://done";

export const MAX_FOCUS_MINUTES = 180;

export type QuickCommand =
  | { kind: "task"; name: string }
  | { kind: "note"; text: string }
  | { kind: "focus"; minutes?: number }
  | { kind: "invalid"; reason: string };

export interface QuickCommandResult {
  ok: boolean;
  message: string;
}

const TASK_WORDS = new Set(["task", "todo", "t"]);
const NOTE_WORDS = new Set(["note", "idea", "n"]);
const FOCUS_WORDS = new Set(["focus", "f"]);

/** "task buy milk", "note an idea", "focus 25". Anything else is saved as a note. */
export function parseQuickCommand(input: string): QuickCommand {
  const text = input.trim();
  if (!text) return { kind: "invalid", reason: "Type a command first" };

  const [first, ...restWords] = text.split(/\s+/);
  const word = first.toLowerCase();
  const rest = restWords.join(" ");

  if (TASK_WORDS.has(word)) {
    return rest ? { kind: "task", name: rest } : { kind: "invalid", reason: "Add a name: task buy milk" };
  }
  if (NOTE_WORDS.has(word)) {
    return rest ? { kind: "note", text: rest } : { kind: "invalid", reason: "Add some text: note an idea" };
  }
  if (FOCUS_WORDS.has(word) && (!rest || /^\d+$/.test(rest))) {
    if (!rest) return { kind: "focus" };
    const minutes = Number(rest);
    if (minutes < 1 || minutes > MAX_FOCUS_MINUTES) {
      return { kind: "invalid", reason: `Focus takes 1 to ${MAX_FOCUS_MINUTES} minutes` };
    }
    return { kind: "focus", minutes };
  }
  return { kind: "note", text };
}
