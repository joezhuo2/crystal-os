import { toLocalDateStr } from "@/lib/utils";
import type { Block, ChatMessage, ChatMeta, Engine } from "./types";

const ENGINE_NAME: Record<Engine, string> = { dsh: "DeepSeek Harness", claude: "Claude Code" };

/** Characters Obsidian or the file system will not take in a note name. */
function cleanName(text: string, fallback: string): string {
  const name = text.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return name || fallback;
}

/**
 * Where a chat is saved in the vault: one note per chat, so saving again
 * replaces it with the longer conversation. The id keeps two chats with the
 * same title apart.
 */
export function chatNotePath(chat: Pick<ChatMeta, "id" | "title">, projectName: string): string {
  return `Nebula/${cleanName(projectName, "Project")}/${cleanName(chat.title, "Chat")} (${chat.id.slice(0, 8)}).md`;
}

const time = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function blockLines(block: Block): string[] {
  switch (block.kind) {
    case "text":
      return block.text.trim() ? [block.text.trim(), ""] : [];
    case "thought":
      return block.text.trim() ? ["> [!note]- Thinking", ...block.text.trim().split("\n").map((l) => `> ${l}`), ""] : [];
    case "tool":
      return [`- Tool (${block.status}): ${block.title}`, ""];
    case "permission":
      return [`- Permission (${block.status}): ${block.title}`, ""];
    case "notice":
      return [`> [!${block.tone === "info" ? "info" : block.tone}] ${block.text}`, ""];
    case "handoff":
      return [`*Handed off from ${ENGINE_NAME[block.from]} to ${ENGINE_NAME[block.to]}.*`, ""];
  }
}

function speaker(message: ChatMessage): string {
  if (message.role === "user") return "You";
  if (message.role === "system") return "Nebula";
  const engine = message.engine ? ENGINE_NAME[message.engine] : "Assistant";
  return message.model ? `${engine} · ${message.model}` : engine;
}

/** A chat as an Obsidian note: frontmatter, then each turn under its speaker. */
export function chatToMarkdown(
  { chat, messages, projectName, projectPath }: { chat: ChatMeta; messages: ChatMessage[]; projectName: string; projectPath: string },
  now: Date = new Date(),
): string {
  const lines = [
    "---",
    "type: nebula-chat",
    `chat: ${chat.id}`,
    `project: "${projectName.replace(/"/g, '\\"')}"`,
    `created: ${toLocalDateStr(new Date(chat.createdAt))}`,
    `saved: ${toLocalDateStr(now)}`,
    "tags: [nebula]",
    "---",
    "",
    `# ${chat.title.trim() || "Chat"}`,
    "",
    `Project: \`${projectPath}\``,
    "",
  ];
  for (const message of messages) {
    const body = message.blocks.flatMap(blockLines);
    if (body.length === 0) continue;
    lines.push(`## ${speaker(message)}`, "", `*${time(message.createdAt)}*`, "", ...body);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
