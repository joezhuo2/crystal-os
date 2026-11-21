import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiResponse } from "@/lib/apiRequest";

export type AiProvider = "claude" | "nim" | "omniroute";
export type AiChoice = AiProvider | "none";

export const AI_PROVIDER_LABELS: Record<AiChoice, string> = {
  none: "None",
  claude: "Claude",
  nim: "NVIDIA NIM",
  omniroute: "OmniRoute",
};

export const CLAUDE_MODELS = [
  { id: "claude-fable-5-2", label: "Fable 5.2" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
];

export interface AiStatus {
  claude: { configured: boolean; model: string };
  nim: { configured: boolean; baseUrl: string; model: string };
  omniroute: { configured: boolean; hasKey: boolean; baseUrl: string; model: string };
}

interface ProviderPatch {
  apiKey?: string | null;
  baseUrl?: string;
  model?: string;
}

export type AiConfigPatch = Partial<Record<AiProvider, ProviderPatch>>;

export type AiContentPart = { type: "text"; text: string } | { type: "image"; mediaType: "image/png" | "image/jpeg"; data: string };

export interface AiMessage {
  role: "user" | "assistant";
  content: string | AiContentPart[];
}

export interface AskAiInput {
  provider: AiProvider;
  model?: string;
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
}

const request = <T,>(url: string, init?: RequestInit) => apiRequest<T>(url, init, "AI API error");
const post = <T,>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const STATUS_KEY = ["ai", "status"];

export function useAiStatus(enabled = true) {
  return useQuery({ queryKey: STATUS_KEY, queryFn: () => request<AiStatus>("/api/ai/status"), enabled });
}

export function useSaveAiConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AiConfigPatch) => post<AiStatus>("/api/ai/config", patch),
    onSuccess: (status) => {
      queryClient.setQueryData(STATUS_KEY, status);
      // The Courier's "configured" depends on the master key.
      void queryClient.invalidateQueries({ queryKey: ["mail", "status"] });
    },
  });
}

export async function askAi(input: AskAiInput): Promise<string> {
  const { text } = await post<{ text: string }>("/api/ai/chat", input);
  return text;
}

export type AiStreamEvent = { type: "thinking" | "text"; text: string } | { type: "done"; truncated: boolean };

export async function streamAi(input: AskAiInput, onEvent: (e: AiStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await apiResponse(
    "/api/ai/chat/stream",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal },
    "AI API error",
  );
  if (!res.body) throw new Error("The AI reply was empty");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const e = JSON.parse(line) as AiStreamEvent | { type: "error"; error: string };
      if (e.type === "error") throw new Error(e.error);
      onEvent(e);
    }
    if (done) return;
  }
}

function closingIndex(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseJsonReply<T = unknown>(text: string): T {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const end = closingIndex(text, start);
    if (end < 0) continue;
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      // Not JSON (e.g. "[sic]"): try the next bracket.
    }
  }
  throw new Error("The AI reply did not contain any JSON");
}
