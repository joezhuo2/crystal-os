import type { ChatMessage, ChatMeta } from "./types";

export interface ChatHit {
  chat: ChatMeta;
  /** The matching text around the query, or null when only the title matched. */
  snippet: string | null;
}

function snippetAround(text: string, at: number, length: number): string {
  const start = Math.max(0, at - 30);
  const end = Math.min(text.length, at + length + 60);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`;
}

/**
 * Chats whose title or message text contains the query, title matches first,
 * then the most recently updated.
 */
export function searchChats(
  chats: readonly ChatMeta[],
  messagesOf: (chatId: string) => readonly ChatMessage[] | undefined,
  query: string,
  limit = 5,
): ChatHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: (ChatHit & { titleMatch: boolean })[] = [];
  for (const chat of chats) {
    const titleMatch = chat.title.toLowerCase().includes(q);
    let snippet: string | null = null;
    for (const message of messagesOf(chat.id) ?? []) {
      if (message.role === "system") continue;
      for (const block of message.blocks) {
        if (block.kind !== "text") continue;
        const at = block.text.toLowerCase().indexOf(q);
        if (at >= 0) {
          snippet = snippetAround(block.text, at, q.length);
          break;
        }
      }
      if (snippet) break;
    }
    if (titleMatch || snippet) hits.push({ chat, snippet, titleMatch });
  }
  return hits
    .sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch) || b.chat.updatedAt - a.chat.updatedAt)
    .slice(0, limit)
    .map(({ chat, snippet }) => ({ chat, snippet }));
}
