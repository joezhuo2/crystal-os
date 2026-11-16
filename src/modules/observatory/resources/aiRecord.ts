import { toast } from "sonner";
import { fetchRawNote } from "@/hooks/useVault";
import { saveAiOutput, setAiOutputStatus, type AiOutput, type AiOutputStatus } from "../aiLog";
import { errorText } from "../errorText";
import { observatoryAi, readObservatorySettings } from "../settings";
import type { PoolItem } from "./pool";
import { INBOX } from "./paths";

export type AiRecord = Omit<AiOutput, "folder" | "provider" | "model" | "code"> & { code?: string };

const warn = (title: string, err: unknown) => toast.warning(title, { description: errorText(err) });

export function courseOf(folder: string, path = ""): string {
  const rest = path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : "";
  const code = rest.includes("/") ? rest.slice(0, rest.indexOf("/")) : "";
  return code || INBOX;
}

// A failed log write must never break the feature that produced the output.
export async function recordAi(o: AiRecord): Promise<string | undefined> {
  try {
    const ai = observatoryAi();
    const { folder } = readObservatorySettings();
    return await saveAiOutput({ ...o, folder, code: o.code ?? courseOf(folder, o.source), provider: ai?.provider ?? "none", model: ai?.model ?? "" });
  } catch (err) {
    warn("Could not record the AI output in Obsidian", err);
    return undefined;
  }
}

export async function markAi(path: string | undefined, status: AiOutputStatus, unless: AiOutputStatus[] = []): Promise<void> {
  if (!path) return;
  try {
    if (unless.length) {
      const current = /^status:\s*(\S+)/m.exec((await fetchRawNote(path)).content)?.[1];
      if (unless.includes(current as AiOutputStatus)) return;
    }
    await setAiOutputStatus(path, status);
  } catch (err) {
    warn("Could not update the AI note in Obsidian", err);
  }
}

// shortcut: status is judged from one pool note, so a log whose items span several chapter pools can read "dismissed" early; scan all pools if that matters.
export async function syncPoolLogs(before: PoolItem[], after: PoolItem[]): Promise<void> {
  const prev = new Map(before.map((i) => [i.id, i.state]));
  const logs = new Set(after.flatMap((i) => (i.ai_log && prev.get(i.id) !== i.state ? [i.ai_log] : [])));
  for (const log of logs) {
    const mine = after.filter((i) => i.ai_log === log);
    if (mine.some((i) => i.state === "accepted")) await markAi(log, "accepted");
    else await markAi(log, mine.every((i) => i.state === "rejected") ? "dismissed" : "pending", ["accepted", "applied"]);
  }
}

export function questionsMarkdown(qs: { number?: string; page?: number; text: string; answer?: string; type?: string; topic?: string | null; note?: string }[]): string {
  if (!qs.length) return "No questions found.";
  return qs
    .map((q) => {
      const head = [q.number && `Question ${q.number}`, q.page && `page ${q.page}`, q.type, q.topic && `topic ${q.topic}`, q.note].filter(Boolean).join(" · ");
      return `## ${head || "Question"}\n\n${q.text.trim()}\n\n**Answer:** ${q.answer?.trim() || "_none_"}`;
    })
    .join("\n\n");
}
