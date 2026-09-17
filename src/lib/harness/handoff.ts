import type { ChatMessage, Engine } from "./types";

export const HANDOFF_PREAMBLE = "You are continuing a session previously handled by another model. Summary of prior conversation:";
export const HANDOFF_MAX_CHARS = 8000;

const ENGINE_NAME: Record<Engine, string> = { dsh: "DeepSeek Harness", claude: "Claude Code" };

function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Builds the context handed to `to` when a chat switches engines: every turn
 * since `to` last answered (or the whole chat), newest kept when trimming,
 * with tool calls reduced to one line each.
 */
export function buildHandoff(messages: ChatMessage[], to: Engine): string | null {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].engine === to) {
      start = i + 1;
      break;
    }
  }
  const lines: string[] = [];
  for (const message of messages.slice(start)) {
    if (message.role === "system") continue;
    const speaker = message.role === "user" ? "User" : `Assistant (${ENGINE_NAME[message.engine ?? "dsh"]}${message.model ? `, ${message.model}` : ""})`;
    const parts: string[] = [];
    for (const block of message.blocks) {
      if (block.kind === "text" && block.text.trim()) parts.push(clip(block.text.trim(), 2000));
      if (block.kind === "tool") parts.push(`[tool ${block.status}] ${clip(block.title, 160)}`);
    }
    if (parts.length) lines.push(`${speaker}:\n${parts.join("\n")}`);
  }
  if (lines.length === 0) return null;

  // Keep the most recent turns within the budget.
  const kept: string[] = [];
  let used = HANDOFF_PREAMBLE.length + 2;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (used + lines[i].length + 2 > HANDOFF_MAX_CHARS) {
      if (kept.length === 0) kept.unshift(clip(lines[i], HANDOFF_MAX_CHARS - used));
      break;
    }
    kept.unshift(lines[i]);
    used += lines[i].length + 2;
  }
  const omitted = lines.length - kept.length;
  return [HANDOFF_PREAMBLE, omitted > 0 ? `(${omitted} earlier turn${omitted === 1 ? "" : "s"} omitted)` : null, ...kept]
    .filter(Boolean)
    .join("\n\n");
}
